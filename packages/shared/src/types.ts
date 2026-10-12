export const ACTIVITIES = ["study", "rest", "friends", "interest"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const TOKENS = ["grade", "health", "bond", "interest"] as const;
export type Token = (typeof TOKENS)[number];

/** Each activity produces exactly one kind of token. */
export const ACTIVITY_TOKEN: Record<Activity, Token> = {
  study: "grade",
  rest: "health",
  friends: "bond",
  interest: "interest",
};

export const ROLES = ["grinder", "anchor", "ally", "spark", "explorer"] as const;
export type RoleId = (typeof ROLES)[number];

export type StatementTarget =
  | { kind: "role"; role: RoleId }
  | { kind: "token"; token: Token };

/** "Success for me is when I [action], so that [target] gets stronger." */
export interface Statement {
  action: Activity;
  target: StatementTarget;
}

export type Counts<K extends string> = Record<K, number>;

export interface PlayerStats {
  /** Times this player's statement fired. */
  statementFires: number;
  /** Energy this player restored to teammates (Bond tokens and role-targeted statements). */
  energyGivenToOthers: number;
  /** Terms this player spent sitting out at 0 Energy. */
  termsSatOut: number;
  /** Damage dealt to bosses. Kept for analysis only; never shown as a ranking. */
  damageDealt: number;
}

export interface Player {
  id: string;
  name: string;
  role: RoleId | null;
  statement: Statement | null;
  rewritesLeft: number;
  energy: number;
  tokens: Counts<Token>;
  /** This term's chip placement, or null if not yet placed. */
  placement: Counts<Activity> | null;
  /** The Explorer's doubled activity this term. */
  explorerDouble: Activity | null;
  /** The Explorer's doubled activity last term (cannot repeat). */
  lastExplorerDouble: Activity | null;
  /** Sitting out this term because Energy hit 0. */
  sittingOut: boolean;
  /** Pressed "done" during the fight step. */
  done: boolean;
  connected: boolean;
  stats: PlayerStats;
}

export type BossId = "comparison" | "burnout" | "fear" | "results";

export interface BossConfig {
  id: BossId;
  name: string;
  hp: number;
  /** Token type that deals extra damage. Null for Results Day. */
  weakness: Token | null;
  /** "sets": only damaged by a full set of one of each token. */
  special?: "sets";
  /** One-line flavour shown on the card. */
  blurb: string;
}

export interface Boss extends BossConfig {
  maxHp: number;
  arrivedTerm: number;
}

export type Phase = "lobby" | "place" | "fight" | "over";

export type LogKind = "info" | "fire" | "attack" | "support" | "boss" | "danger";

export interface LogEntry {
  term: number;
  kind: LogKind;
  text: string;
}

export interface GameState {
  phase: Phase;
  /** 1-based. 0 in the lobby. */
  term: number;
  players: Player[];
  /** Every boss that has arrived so far, alive or beaten. */
  bosses: Boss[];
  /** Extra damage per token type this term, from token-targeted statements. */
  tokenBonus: Counts<Token>;
  log: LogEntry[];
  outcome: "win" | "lose" | null;
  /** Energy history per term, for the end screen. */
  history: { term: number; energies: Record<string, number>; bossesAlive: number }[];
}

export type Result = { ok: true; state: GameState } | { ok: false; error: string };
