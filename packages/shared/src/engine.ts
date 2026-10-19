import { ACTION_PHRASE, GAME_CONFIG, ROLE_INFO, TOKEN_LABEL, type GameConfig } from "./config";
import {
  ACTIVITIES,
  ACTIVITY_TOKEN,
  ROLES,
  TOKENS,
  type Activity,
  type Boss,
  type Counts,
  type GameState,
  type LogEntry,
  type LogKind,
  type Player,
  type Result,
  type RoleId,
  type Statement,
  type Token,
} from "./types";

/*
 * Every exported function takes a state and returns a Result with a NEW state.
 * The input state is never mutated, so the server, the client and the simulator
 * can all share this file safely.
 */

const MAX_LOG = 80;

export const zeroTokens = (): Counts<Token> => ({ grade: 0, health: 0, bond: 0, interest: 0 });
export const zeroActivities = (): Counts<Activity> => ({ study: 0, rest: 0, friends: 0, interest: 0 });

const ok = (state: GameState): Result => ({ ok: true, state });
const fail = (error: string): Result => ({ ok: false, error });

/** State is plain JSON, so a JSON round-trip is a safe deep copy in every runtime. */
function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

type LogDetail = Pick<LogEntry, "from" | "to" | "bossId" | "token" | "amount">;

function log(state: GameState, kind: LogKind, text: string, detail: LogDetail = {}) {
  const seq = (state.log[state.log.length - 1]?.seq ?? 0) + 1;
  state.log.push({ seq, term: state.term, kind, text, ...detail });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

function findPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

function clampEnergy(n: number, cfg: GameConfig) {
  return Math.max(0, Math.min(cfg.maxEnergy, n));
}

function isPosInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

/** Players who take part in this term (not sitting out at 0 Energy). */
export function activePlayers(state: GameState): Player[] {
  return state.players.filter((p) => !p.sittingOut);
}

export function aliveBosses(state: GameState): Boss[] {
  return state.bosses.filter((b) => b.hp > 0);
}

/** Time chips a player gets this term: their Energy, up to the maximum. Tired players get less done. */
export function chipsFor(p: Player, cfg: GameConfig = GAME_CONFIG): number {
  if (p.sittingOut) return 0;
  return Math.max(0, Math.min(cfg.chipsPerTerm, p.energy));
}

/** The activity a player's chips are doubled on this term. */
export function doubledActivity(p: Player): Activity | null {
  if (!p.role) return null;
  if (p.role === "explorer") return p.explorerDouble;
  return ROLE_INFO[p.role].doubles;
}

/** Damage one token of this type deals to this boss right now. */
export function tokenDamage(state: GameState, boss: Boss, token: Token, cfg: GameConfig = GAME_CONFIG): number {
  if (boss.special === "sets") return 0;
  const weakness = boss.weakness === token ? cfg.weaknessBonus : 0;
  return 1 + weakness + state.tokenBonus[token];
}

export function describeStatement(s: Statement): string {
  const target = s.target.kind === "role" ? ROLE_INFO[s.target.role].name.replace(/^The /, "the ") : TOKEN_LABEL[s.target.token];
  return `Success for me is when I ${ACTION_PHRASE[s.action]}, so that ${target} gets stronger.`;
}

export function validateStatement(s: unknown, ownRole: RoleId | null): string | null {
  if (!s || typeof s !== "object") return "Statement is missing.";
  const st = s as Statement;
  if (!ACTIVITIES.includes(st.action)) return "Pick an action for your statement.";
  const t = st.target as Statement["target"] | undefined;
  if (!t || (t.kind !== "role" && t.kind !== "token")) return "Pick a target for your statement.";
  if (t.kind === "role") {
    if (!ROLES.includes(t.role)) return "Unknown role.";
    if (ownRole && t.role === ownRole) return "Your statement has to help someone else, not your own role.";
  } else if (!TOKENS.includes(t.token)) {
    return "Unknown token type.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export function createGame(): GameState {
  return {
    phase: "lobby",
    term: 0,
    players: [],
    bosses: [],
    tokenBonus: zeroTokens(),
    log: [],
    outcome: null,
    history: [],
  };
}

export function addPlayer(state: GameState, id: string, name: string, cfg: GameConfig = GAME_CONFIG): Result {
  if (state.phase !== "lobby") return fail("The game has already started.");
  const clean = String(name ?? "").trim().slice(0, 16);
  if (!clean) return fail("Enter a name.");
  if (state.players.length >= cfg.maxPlayers) return fail(`This group is full (${cfg.maxPlayers} players).`);
  if (state.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return fail("Someone already has that name.");
  const s = clone(state);
  s.players.push({
    id,
    name: clean,
    role: null,
    statement: null,
    rewritesLeft: cfg.rewritesPerGame,
    energy: cfg.startEnergy,
    tokens: zeroTokens(),
    placement: null,
    explorerDouble: null,
    lastExplorerDouble: null,
    sittingOut: false,
    done: false,
    connected: true,
    stats: { statementFires: 0, energyGivenToOthers: 0, termsSatOut: 0, damageDealt: 0 },
  });
  log(s, "info", `${clean} joined.`);
  return ok(s);
}

export function removePlayer(state: GameState, id: string): Result {
  if (state.phase !== "lobby") return fail("Players can only leave in the lobby.");
  const s = clone(state);
  s.players = s.players.filter((p) => p.id !== id);
  return ok(s);
}

/**
 * The host removes a player, in any phase. Mid-game the team plays on without
 * them, and the step moves on if they were the one everyone was waiting for.
 */
export function kickPlayer(state: GameState, id: string, cfg: GameConfig = GAME_CONFIG): Result {
  const p = findPlayer(state, id);
  if (!p) return fail("That player has already left.");
  const playing = state.phase === "place" || state.phase === "fight";
  if (playing && state.players.length <= 1) return fail("Can't remove the last player mid-game. End the game with Play again instead.");
  const s = clone(state);
  s.players = s.players.filter((x) => x.id !== id);
  log(s, "info", `${p.name} was removed from the game.`);
  return ok(playing ? advance(s, cfg) : s);
}

export function setConnected(state: GameState, id: string, connected: boolean): Result {
  const s = clone(state);
  const p = findPlayer(s, id);
  if (!p) return fail("Unknown player.");
  p.connected = connected;
  return ok(s);
}

export function chooseRole(state: GameState, id: string, role: RoleId | null): Result {
  if (state.phase !== "lobby") return fail("Roles are chosen in the lobby.");
  if (role !== null && !ROLES.includes(role)) return fail("Unknown role.");
  const s = clone(state);
  const p = findPlayer(s, id);
  if (!p) return fail("Unknown player.");
  if (role && s.players.some((o) => o.id !== id && o.role === role)) return fail(`${ROLE_INFO[role].name} is already taken.`);
  p.role = role;
  // A statement that targets your new role is no longer valid.
  if (p.statement?.target.kind === "role" && p.statement.target.role === role) p.statement = null;
  return ok(s);
}

/**
 * Write or rewrite a statement. Free in the lobby; during the place step it
 * uses up the player's one rewrite, and only before they place chips.
 */
export function setStatement(state: GameState, id: string, statement: Statement): Result {
  const s = clone(state);
  const p = findPlayer(s, id);
  if (!p) return fail("Unknown player.");
  const err = validateStatement(statement, p.role);
  if (err) return fail(err);
  const next: Statement =
    statement.target.kind === "role"
      ? { action: statement.action, target: { kind: "role", role: statement.target.role } }
      : { action: statement.action, target: { kind: "token", token: statement.target.token } };

  if (s.phase === "lobby") {
    p.statement = next;
    return ok(s);
  }
  if (s.phase !== "place") return fail("You can only rewrite your statement at the start of a term.");
  if (p.placement) return fail("Rewrite before you place your chips.");
  if (p.rewritesLeft <= 0) return fail("You have already used your rewrite.");
  p.statement = next;
  p.rewritesLeft -= 1;
  log(s, "info", `${p.name} rewrote their statement: "${describeStatement(next)}"`);
  return ok(s);
}

export function canStart(state: GameState, cfg: GameConfig = GAME_CONFIG): string | null {
  if (state.phase !== "lobby") return "The game has already started.";
  if (state.players.length < cfg.minPlayers) return `Need at least ${cfg.minPlayers} players.`;
  const missingRole = state.players.find((p) => !p.role);
  if (missingRole) return `${missingRole.name} still needs a role.`;
  const missingStmt = state.players.find((p) => !p.statement);
  if (missingStmt) return `${missingStmt.name} still needs a Success Statement.`;
  const taken = new Set(state.players.map((p) => p.role));
  for (const p of state.players) {
    const t = p.statement!.target;
    if (t.kind === "role" && !taken.has(t.role)) {
      return `${p.name}'s statement targets ${ROLE_INFO[t.role].name}, who isn't playing.`;
    }
    const err = validateStatement(p.statement, p.role);
    if (err) return `${p.name}: ${err}`;
  }
  return null;
}

function spawnBoss(s: GameState, cfg: GameConfig) {
  const bc = cfg.bosses[s.term - 1];
  if (!bc) return;
  const scale = cfg.hpMultiplierByPlayers[s.players.length] ?? 1;
  const hp = Math.max(1, Math.round(bc.hp * scale));
  s.bosses.push({ ...bc, hp, maxHp: hp, arrivedTerm: s.term });
  log(s, "boss", `Term ${s.term}: ${bc.name} arrives with ${hp} HP.`, { bossId: bc.id, amount: hp });
}

export function startGame(state: GameState, cfg: GameConfig = GAME_CONFIG): Result {
  const err = canStart(state, cfg);
  if (err) return fail(err);
  const s = clone(state);
  s.phase = "place";
  s.term = 1;
  s.bosses = [];
  s.outcome = null;
  s.history = [];
  s.tokenBonus = zeroTokens();
  for (const p of s.players) {
    p.energy = cfg.startEnergy;
    p.tokens = zeroTokens();
    p.placement = null;
    p.explorerDouble = null;
    p.lastExplorerDouble = null;
    p.sittingOut = false;
    p.done = false;
    p.rewritesLeft = cfg.rewritesPerGame;
    p.stats = { statementFires: 0, energyGivenToOthers: 0, termsSatOut: 0, damageDealt: 0 };
  }
  spawnBoss(s, cfg);
  return ok(s);
}

// ---------------------------------------------------------------------------
// Step 2: place chips
// ---------------------------------------------------------------------------

export interface PlacementInput {
  placement: Partial<Counts<Activity>>;
  /** Required for the Explorer. */
  explorerDouble?: Activity | null;
}

export function submitPlacement(state: GameState, id: string, input: PlacementInput, cfg: GameConfig = GAME_CONFIG): Result {
  if (state.phase !== "place") return fail("It's not time to place chips.");
  const s = clone(state);
  const p = findPlayer(s, id);
  if (!p) return fail("Unknown player.");
  if (p.sittingOut) return fail("You're sitting out this term.");
  if (p.placement) return fail("You've already placed your chips this term.");

  const placement = zeroActivities();
  let total = 0;
  for (const a of ACTIVITIES) {
    const n = input.placement?.[a] ?? 0;
    if (!Number.isInteger(n) || n < 0) return fail("Chip counts must be whole numbers.");
    placement[a] = n;
    total += n;
  }
  const chips = chipsFor(p, cfg);
  if (total !== chips) return fail(`Place exactly ${chips} chip${chips === 1 ? "" : "s"} (one per point of Energy, up to ${cfg.chipsPerTerm}).`);

  if (p.role === "explorer") {
    const d = input.explorerDouble;
    if (!d || !ACTIVITIES.includes(d)) return fail("Explorer: choose which activity to double this term.");
    if (d === p.lastExplorerDouble) return fail("Explorer: you can't double the same activity two terms in a row.");
    p.explorerDouble = d;
  }
  p.placement = placement;
  return ok(advance(s, cfg));
}

/** Resolve chip placement once every active player has placed. */
function resolvePlacement(s: GameState, cfg: GameConfig) {
  for (const p of activePlayers(s)) {
    const pl = p.placement ?? zeroActivities();
    const dbl = doubledActivity(p);
    for (const a of ACTIVITIES) {
      const gained = pl[a] * (a === dbl ? 2 : 1);
      p.tokens[ACTIVITY_TOKEN[a]] += gained;
    }
    const cost = pl.study * cfg.studyEnergyCost;
    if (cost > 0) p.energy = clampEnergy(p.energy - cost, cfg);
    if (p.role === "explorer") p.lastExplorerDouble = p.explorerDouble;
  }

  // Step 3: statements fire.
  for (const p of activePlayers(s)) {
    const st = p.statement;
    if (!st || !p.placement) continue;
    if (p.placement[st.action] < cfg.statementThreshold) continue;
    p.stats.statementFires += 1;
    if (st.target.kind === "role") {
      const role = st.target.role;
      const target = s.players.find((o) => o.role === role);
      if (target && target.id !== p.id) {
        const before = target.energy;
        target.energy = clampEnergy(target.energy + cfg.roleTargetRestore, cfg);
        p.stats.energyGivenToOthers += target.energy - before;
        const gained = target.energy - before;
        log(s, "fire", gained > 0 ? `${p.name}'s statement fired: ${target.name} restores ${gained} Energy.` : `${p.name}'s statement fired, but ${target.name} was already at full Energy.`, { from: p.id, to: target.id, amount: gained });
      }
    } else {
      s.tokenBonus[st.target.token] += cfg.tokenTargetBonus;
      log(s, "fire", `${p.name}'s statement fired: ${TOKEN_LABEL[st.target.token]} tokens deal +${cfg.tokenTargetBonus} damage this term.`, { from: p.id, token: st.target.token, amount: cfg.tokenTargetBonus });
    }
  }

  s.phase = "fight";
  for (const p of s.players) p.done = p.sittingOut;
}

// ---------------------------------------------------------------------------
// Step 4: fight and support
// ---------------------------------------------------------------------------

function fightGuard(s: GameState, id: string): Player | string {
  if (s.phase !== "fight") return "It's not the fight step.";
  const p = findPlayer(s, id);
  if (!p) return "Unknown player.";
  return p;
}

export function attack(state: GameState, id: string, bossId: string, token: Token, count: number, cfg: GameConfig = GAME_CONFIG): Result {
  const s = clone(state);
  const p = fightGuard(s, id);
  if (typeof p === "string") return fail(p);
  if (!TOKENS.includes(token)) return fail("Unknown token.");
  if (!isPosInt(count)) return fail("Choose how many tokens to spend.");
  const boss = s.bosses.find((b) => b.id === bossId);
  if (!boss || boss.hp <= 0) return fail("That boss isn't in the fight.");
  if (boss.special === "sets") return fail(`${boss.name} ignores single tokens. Use a full set.`);
  if (p.tokens[token] < count) return fail(`You only have ${p.tokens[token]} ${TOKEN_LABEL[token]}.`);
  const per = tokenDamage(s, boss, token, cfg);
  const dmg = Math.min(boss.hp, per * count);
  p.tokens[token] -= count;
  boss.hp -= dmg;
  p.stats.damageDealt += dmg;
  log(s, "attack", `${p.name} hit ${boss.name} with ${count} ${TOKEN_LABEL[token]} for ${dmg}.${boss.hp === 0 ? ` ${boss.name} is beaten!` : ""}`, { from: p.id, bossId: boss.id, token, amount: dmg });
  return ok(s);
}

export function attackSet(state: GameState, id: string, bossId: string, count: number, cfg: GameConfig = GAME_CONFIG): Result {
  const s = clone(state);
  const p = fightGuard(s, id);
  if (typeof p === "string") return fail(p);
  if (!isPosInt(count)) return fail("Choose how many sets to spend.");
  const boss = s.bosses.find((b) => b.id === bossId);
  if (!boss || boss.hp <= 0) return fail("That boss isn't in the fight.");
  if (boss.special !== "sets") return fail("Full sets are only for Results Day.");
  for (const t of TOKENS) {
    if (p.tokens[t] < count) return fail(`A full set needs one of each token. You're short on ${TOKEN_LABEL[t]}.`);
  }
  for (const t of TOKENS) p.tokens[t] -= count;
  const dmg = Math.min(boss.hp, cfg.setDamage * count);
  boss.hp -= dmg;
  p.stats.damageDealt += dmg;
  log(s, "attack", `${p.name} spent ${count} full set${count > 1 ? "s" : ""} on ${boss.name} for ${dmg}.${boss.hp === 0 ? ` ${boss.name} is beaten!` : ""}`, { from: p.id, bossId: boss.id, token: "set", amount: dmg });
  return ok(s);
}

export function heal(state: GameState, id: string, count: number, cfg: GameConfig = GAME_CONFIG): Result {
  const s = clone(state);
  const p = fightGuard(s, id);
  if (typeof p === "string") return fail(p);
  if (!isPosInt(count)) return fail("Choose how many Health tokens to use.");
  if (p.tokens.health < count) return fail(`You only have ${p.tokens.health} Health.`);
  p.tokens.health -= count;
  const before = p.energy;
  p.energy = clampEnergy(p.energy + count * cfg.healthRestore, cfg);
  log(s, "support", `${p.name} rested: +${p.energy - before} Energy.`, { from: p.id, to: p.id, token: "health", amount: p.energy - before });
  return ok(s);
}

export function bond(state: GameState, id: string, targetId: string, count: number, cfg: GameConfig = GAME_CONFIG): Result {
  const s = clone(state);
  const p = fightGuard(s, id);
  if (typeof p === "string") return fail(p);
  if (!isPosInt(count)) return fail("Choose how many Bond tokens to use.");
  if (targetId === id) return fail("Bond tokens restore a teammate, not yourself.");
  const target = findPlayer(s, targetId);
  if (!target) return fail("Unknown teammate.");
  if (p.tokens.bond < count) return fail(`You only have ${p.tokens.bond} Bond.`);
  p.tokens.bond -= count;
  const before = target.energy;
  target.energy = clampEnergy(target.energy + count * cfg.bondRestore, cfg);
  p.stats.energyGivenToOthers += target.energy - before;
  log(s, "support", `${p.name} supported ${target.name}: +${target.energy - before} Energy.`, { from: p.id, to: target.id, token: "bond", amount: target.energy - before });
  return ok(s);
}

export function give(state: GameState, id: string, targetId: string, token: Token, count: number): Result {
  const s = clone(state);
  const p = fightGuard(s, id);
  if (typeof p === "string") return fail(p);
  if (!TOKENS.includes(token)) return fail("Unknown token.");
  if (!isPosInt(count)) return fail("Choose how many tokens to give.");
  if (targetId === id) return fail("Pick a teammate.");
  const target = findPlayer(s, targetId);
  if (!target) return fail("Unknown teammate.");
  if (p.tokens[token] < count) return fail(`You only have ${p.tokens[token]} ${TOKEN_LABEL[token]}.`);
  p.tokens[token] -= count;
  target.tokens[token] += count;
  log(s, "support", `${p.name} gave ${target.name} ${count} ${TOKEN_LABEL[token]}.`, { from: p.id, to: target.id, token, amount: count });
  return ok(s);
}

export function setDone(state: GameState, id: string, done: boolean, cfg: GameConfig = GAME_CONFIG): Result {
  const s = clone(state);
  const p = fightGuard(s, id);
  if (typeof p === "string") return fail(p);
  p.done = done;
  return ok(advance(s, cfg));
}

// ---------------------------------------------------------------------------
// Step 5: end of term
// ---------------------------------------------------------------------------

function endTerm(s: GameState, cfg: GameConfig) {
  const bossLeft = aliveBosses(s).length > 0;
  if (cfg.drainPerTerm > 0) {
    for (const p of s.players) p.energy = clampEnergy(p.energy - cfg.drainPerTerm, cfg);
  }
  if (bossLeft && cfg.endOfTermPenalty > 0) {
    for (const p of s.players) p.energy = clampEnergy(p.energy - cfg.endOfTermPenalty, cfg);
    log(s, "danger", `A boss is still standing. Everyone loses ${cfg.endOfTermPenalty} more Energy.`);
  }
  for (const p of s.players) {
    if (p.sittingOut) p.energy = clampEnergy(p.energy + cfg.sitOutRecovery, cfg);
    p.tokens = zeroTokens();
    p.placement = null;
    p.done = false;
    p.explorerDouble = null;
  }
  s.tokenBonus = zeroTokens();
  s.history.push({
    term: s.term,
    energies: Object.fromEntries(s.players.map((p) => [p.id, p.energy])),
    bossesAlive: aliveBosses(s).length,
  });

  if (s.term >= cfg.terms) {
    s.phase = "over";
    s.outcome = aliveBosses(s).length === 0 ? "win" : "lose";
    log(s, "boss", s.outcome === "win" ? "Every boss is beaten. The team wins together." : "Results Day is still standing. The team loses together.");
    return;
  }

  s.term += 1;
  for (const p of s.players) {
    p.sittingOut = p.energy <= 0;
    if (p.sittingOut) {
      p.stats.termsSatOut += 1;
      log(s, "danger", `${p.name} is burned out and sits out Term ${s.term}.`, { from: p.id });
    }
  }
  s.phase = "place";
  spawnBoss(s, cfg);
}

/** Move the game forward whenever everyone who needs to act has acted. */
function advance(s: GameState, cfg: GameConfig): GameState {
  for (let guard = 0; guard < 10; guard++) {
    if (s.phase === "place" && activePlayers(s).every((p) => p.placement)) {
      resolvePlacement(s, cfg);
      continue;
    }
    if (s.phase === "fight" && activePlayers(s).every((p) => p.done)) {
      endTerm(s, cfg);
      continue;
    }
    break;
  }
  return s;
}

/**
 * Host override: move on without waiting (for a player who left or froze).
 * In the place step, missing players place nothing this term.
 */
export function forceAdvance(state: GameState, cfg: GameConfig = GAME_CONFIG): Result {
  const s = clone(state);
  if (s.phase === "place") {
    for (const p of activePlayers(s)) if (!p.placement) p.placement = zeroActivities();
    resolvePlacement(s, cfg);
    return ok(advance(s, cfg));
  }
  if (s.phase === "fight") {
    endTerm(s, cfg);
    return ok(advance(s, cfg));
  }
  return fail("Nothing to skip right now.");
}

/** Back to the lobby with the same players, roles and statements. */
export function resetToLobby(state: GameState, cfg: GameConfig = GAME_CONFIG): Result {
  const s = clone(state);
  s.phase = "lobby";
  s.term = 0;
  s.bosses = [];
  s.outcome = null;
  s.history = [];
  s.tokenBonus = zeroTokens();
  for (const p of s.players) {
    p.energy = cfg.startEnergy;
    p.tokens = zeroTokens();
    p.placement = null;
    p.sittingOut = false;
    p.done = false;
    p.rewritesLeft = cfg.rewritesPerGame;
  }
  log(s, "info", "Back to the lobby.");
  return ok(s);
}

/** Team totals for the end screen. Deliberately no per-player ranking. */
export function teamSummary(state: GameState) {
  const sum = (f: (p: Player) => number) => state.players.reduce((a, p) => a + f(p), 0);
  return {
    statementFires: sum((p) => p.stats.statementFires),
    energyGivenToOthers: sum((p) => p.stats.energyGivenToOthers),
    termsSatOut: sum((p) => p.stats.termsSatOut),
    bossesBeaten: state.bosses.filter((b) => b.hp <= 0).length,
    bossesTotal: state.bosses.length,
  };
}
