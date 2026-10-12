import { randomBytes, randomUUID } from "node:crypto";
import { Room, ServerError, matchMaker, type Client } from "@colyseus/core";
import {
  addPlayer,
  attack,
  attackSet,
  bond,
  chooseRole,
  createGame,
  forceAdvance,
  give,
  heal,
  removePlayer,
  resetToLobby,
  setConnected,
  setDone,
  setStatement,
  startGame,
  submitPlacement,
  type ClientMessages,
  type GameState,
  type JoinOptions,
  type Result,
} from "@nsc/shared";

/** Letters only, without I and O, so codes are easy to read off a projector. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
/** How long a dropped phone (screen locked, Wi-Fi blip) keeps its seat. */
const RECONNECT_SECONDS = 300;
/** How long a lobby seat waits for its player to come back before it's freed. */
const LOBBY_SEAT_SECONDS = 60;

async function uniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const bytes = randomBytes(4);
    const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    const taken = await matchMaker.query({ roomId: code });
    if (taken.length === 0) return code;
  }
  throw new Error("Could not find a free room code.");
}

/**
 * One room = one group of up to 5 players plus the shared board screen (host).
 *
 * The game state is a plain JSON object owned by the shared rules engine.
 * Every accepted action replaces it and the full state is broadcast; it's a
 * few kilobytes and changes a few times a minute, so no delta sync is needed.
 */
export class GameRoom extends Room {
  maxClients = 8;
  maxMessagesPerSecond = 20;

  private game: GameState = createGame();
  /** Colyseus session id -> player id (stable across manual rejoins). */
  private seats = new Map<string, string>();
  private hostSession: string | null = null;
  /** True once the creating board screen has joined. Later board screens need the host key. */
  private hostClaimed = false;
  private hostKey = randomBytes(12).toString("hex");

  async onCreate(options: JoinOptions) {
    this.roomId = await uniqueCode();
    if (!options?.host) throw new ServerError(400, "Only the board screen can create a game.");

    const handlers: { [K in keyof ClientMessages]: (client: Client, msg: ClientMessages[K]) => Result } = {
      chooseRole: (c, m) => this.asPlayer(c, (id) => chooseRole(this.game, id, m?.role ?? null)),
      setStatement: (c, m) => this.asPlayer(c, (id) => setStatement(this.game, id, m?.statement)),
      start: (c) => this.asHost(c, () => startGame(this.game)),
      place: (c, m) =>
        this.asPlayer(c, (id) => submitPlacement(this.game, id, { placement: m?.placement ?? {}, explorerDouble: m?.explorerDouble ?? null })),
      attack: (c, m) => this.asPlayer(c, (id) => attack(this.game, id, m?.bossId, m?.token, m?.count)),
      attackSet: (c, m) => this.asPlayer(c, (id) => attackSet(this.game, id, m?.bossId, m?.count)),
      heal: (c, m) => this.asPlayer(c, (id) => heal(this.game, id, m?.count)),
      bond: (c, m) => this.asPlayer(c, (id) => bond(this.game, id, m?.targetId, m?.count)),
      give: (c, m) => this.asPlayer(c, (id) => give(this.game, id, m?.targetId, m?.token, m?.count)),
      done: (c, m) => this.asPlayer(c, (id) => setDone(this.game, id, Boolean(m?.done))),
      forceNext: (c) => this.asHost(c, () => forceAdvance(this.game)),
      restart: (c) => this.asHost(c, () => resetToLobby(this.game)),
    };

    for (const [type, handler] of Object.entries(handlers)) {
      this.onMessage(type, (client: Client, message: unknown) => {
        let result: Result;
        try {
          result = (handler as (c: Client, m: unknown) => Result)(client, message);
        } catch (err) {
          console.error(`[${this.roomId}] ${type} failed`, err);
          result = { ok: false, error: "Something went wrong. Try again." };
        }
        if (result.ok) {
          this.game = result.state;
          this.broadcastState();
        } else {
          client.send("error", { message: result.error });
        }
      });
    }
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    // The board screen.
    if (options.host) {
      const isCreator = !this.hostClaimed;
      if (!isCreator && options.hostKey !== this.hostKey) throw new ServerError(403, "This game already has a board screen.");
      this.hostClaimed = true;
      this.hostSession = client.sessionId;
      client.send("welcome", { playerId: null, isHost: true, hostKey: this.hostKey, code: this.roomId });
      client.send("state", this.publicState());
      return;
    }

    const name = String(options.name ?? "").trim();
    if (!name) throw new ServerError(400, "Enter a name.");

    // Joining under the name of a disconnected seat takes it back (refresh, dead battery, new phone).
    const seat = this.game.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (seat && !seat.connected) {
      for (const [sid, pid] of this.seats) if (pid === seat.id) this.seats.delete(sid);
      this.seats.set(client.sessionId, seat.id);
      this.apply(setConnected(this.game, seat.id, true));
      client.send("welcome", { playerId: seat.id, isHost: false, code: this.roomId });
      this.broadcastState();
      return;
    }
    if (this.game.phase !== "lobby") {
      if (seat) throw new ServerError(403, `${seat.name} is already connected.`);
      throw new ServerError(403, "This game has already started. Join with the same name you used before.");
    }

    const id = randomUUID();
    const result = addPlayer(this.game, id, name);
    if (!result.ok) throw new ServerError(400, result.error);
    this.game = result.state;
    this.seats.set(client.sessionId, id);
    client.send("welcome", { playerId: id, isHost: false, code: this.roomId });
    this.broadcastState();
  }

  /** Lost connection without saying goodbye (phone locked, Wi-Fi dropped). */
  async onDrop(client: Client) {
    const pid = this.seats.get(client.sessionId);
    if (pid) this.apply(setConnected(this.game, pid, false));
    this.broadcastState();
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
    } catch {
      // Timed out; onLeave handles the rest.
    }
  }

  onReconnect(client: Client) {
    const pid = this.seats.get(client.sessionId);
    if (pid) this.apply(setConnected(this.game, pid, true));
    // A refreshed page reconnects with an empty UI, so always say who it is again.
    if (client.sessionId === this.hostSession) client.send("welcome", { playerId: null, isHost: true, hostKey: this.hostKey, code: this.roomId });
    else if (pid) client.send("welcome", { playerId: pid, isHost: false, code: this.roomId });
    this.broadcastState();
  }

  onLeave(client: Client) {
    if (client.sessionId === this.hostSession) this.hostSession = null;
    const pid = this.seats.get(client.sessionId);
    if (!pid) return;
    this.seats.delete(client.sessionId);
    // Keep the seat so a refreshed or reconnecting phone gets its role and statement back.
    // In the lobby, free it after a minute so a group isn't blocked by someone who left.
    this.apply(setConnected(this.game, pid, false));
    if (this.game.phase === "lobby") {
      this.clock.setTimeout(() => {
        const p = this.game.players.find((x) => x.id === pid);
        if (this.game.phase === "lobby" && p && !p.connected) {
          this.apply(removePlayer(this.game, pid));
          this.broadcastState();
        }
      }, LOBBY_SEAT_SECONDS * 1000);
    }
    this.broadcastState();
  }

  // ---------------------------------------------------------------------------

  private asPlayer(client: Client, fn: (playerId: string) => Result): Result {
    const pid = this.seats.get(client.sessionId);
    if (!pid) return { ok: false, error: "Only players can do that." };
    return fn(pid);
  }

  private asHost(client: Client, fn: () => Result): Result {
    if (client.sessionId !== this.hostSession) return { ok: false, error: "Only the board screen can do that." };
    return fn();
  }

  private apply(result: Result) {
    if (result.ok) this.game = result.state;
  }

  private publicState() {
    return { ...this.game, code: this.roomId };
  }

  private broadcastState() {
    this.broadcast("state", this.publicState());
  }
}
