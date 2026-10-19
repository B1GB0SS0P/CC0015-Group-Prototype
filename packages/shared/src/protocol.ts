import type { Activity, GameState, RoleId, Statement, Token } from "./types";

/** Name of the Colyseus room type. */
export const ROOM_NAME = "game";

/** Options sent when creating or joining a room. */
export interface JoinOptions {
  /** True for the shared board screen (teacher / projector). */
  host?: boolean;
  /** Secret from a previous session, lets the board reclaim host control. */
  hostKey?: string;
  name?: string;
}

/** Messages from a client to the server. */
export interface ClientMessages {
  chooseRole: { role: RoleId | null };
  setStatement: { statement: Statement };
  start: Record<string, never>;
  place: { placement: Partial<Record<Activity, number>>; explorerDouble?: Activity | null };
  attack: { bossId: string; token: Token; count: number };
  attackSet: { bossId: string; count: number };
  heal: { count: number };
  bond: { targetId: string; count: number };
  give: { targetId: string; token: Token; count: number };
  done: { done: boolean };
  forceNext: Record<string, never>;
  restart: Record<string, never>;
  /** Host only: remove a player from the game. */
  kick: { playerId: string; ban?: boolean };
  /** Keep-alive. Free hosts (Render) sleep after 15 minutes without incoming messages. */
  ping: Record<string, never>;
}

/** Messages from the server to a client. */
export interface ServerMessages {
  state: GameState & { code: string };
  welcome: { playerId: string | null; isHost: boolean; hostKey?: string; code: string };
  error: { message: string };
  /** Sent to a player the host removed, just before their connection closes. */
  kicked: { message: string };
}
