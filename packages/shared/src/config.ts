import type { Activity, BossConfig, RoleId } from "./types";

/**
 * Every tunable number in the game lives here.
 * After a playtest or a simulator run, change values in this file only.
 */
export const GAME_CONFIG = {
  minPlayers: 3,
  maxPlayers: 5,
  /**
   * Boss HP below is written for 5 players. Smaller groups multiply it by these.
   * Tuned with the simulator (npm run sweep): missing roles make small groups
   * weaker than headcount alone suggests, so this is not a straight line.
   */
  hpMultiplierByPlayers: { 3: 0.37, 4: 0.98, 5: 1 } as Record<number, number>,

  terms: 4,
  /** Most Time chips a player can get in a term. Each player gets chips equal to their Energy, up to this. */
  chipsPerTerm: 4,
  startEnergy: 5,
  maxEnergy: 5,

  /** Energy lost per Study chip placed. Study is the only activity that costs Energy. */
  studyEnergyCost: 1,
  /** Energy restored to yourself per Health token. */
  healthRestore: 1,
  /** Energy restored to a teammate per Bond token. */
  bondRestore: 2,

  /** Chips needed on a statement's action for it to fire. */
  statementThreshold: 2,
  /** Energy restored to the targeted teammate when a role-targeted statement fires. */
  roleTargetRestore: 2,
  /** Extra damage per token of the targeted type when a token-targeted statement fires. */
  tokenTargetBonus: 1,
  rewritesPerGame: 1,

  /** Extra damage a token deals when it matches the boss's weakness (1 + this = 2). */
  weaknessBonus: 1,
  /** Damage dealt to Results Day by one full set (one of each token). */
  setDamage: 6,
  /** Energy every player loses at the end of every term (school takes it out of you). */
  drainPerTerm: 1,
  /** Extra Energy every player loses at the end of a term if any boss is still alive (0 = off). */
  endOfTermPenalty: 0,
  /** Energy a player regains at the end of a term they sat out (0 = rulebook as written). */
  sitOutRecovery: 0,

  bosses: [
    { id: "comparison", name: "Comparison", hp: 11, weakness: "bond", blurb: "\"I got an A. How about you?\"" },
    { id: "burnout", name: "Burnout", hp: 15, weakness: "health", blurb: "Running on empty since Week 3." },
    { id: "fear", name: "Fear of Failure", hp: 17, weakness: "interest", blurb: "\"What if I'm not good enough?\"" },
    {
      id: "results",
      name: "Results Day",
      hp: 26,
      weakness: null,
      special: "sets",
      blurb: "Ignores single tokens. Needs the whole you.",
    },
  ] satisfies BossConfig[],
} as const;

export type GameConfig = typeof GAME_CONFIG;

export interface RoleInfo {
  name: string;
  moba: string;
  /** Activity whose chips give 2 tokens. Null for the Explorer, who picks each term. */
  doubles: Activity | null;
  blurb: string;
}

export const ROLE_INFO: Record<RoleId, RoleInfo> = {
  grinder: {
    name: "The Grinder",
    moba: "Marksman",
    doubles: "study",
    blurb: "Hits hardest. Burns out fastest. Needs a team.",
  },
  anchor: {
    name: "The Anchor",
    moba: "Tank",
    doubles: "rest",
    blurb: "Keeps the team standing. Rest is the frontline.",
  },
  ally: {
    name: "The Ally",
    moba: "Support",
    doubles: "friends",
    blurb: "Turns time with friends into Energy for others.",
  },
  spark: {
    name: "The Spark",
    moba: "Mage",
    doubles: "interest",
    blurb: "Curiosity is a weapon. Fear of Failure hates it.",
  },
  explorer: {
    name: "The Explorer",
    moba: "Fighter",
    doubles: null,
    blurb: "Doubles a different activity each term.",
  },
};

export const ACTIVITY_LABEL: Record<Activity, string> = {
  study: "Study",
  rest: "Rest",
  friends: "Friends",
  interest: "Interest",
};

export const TOKEN_LABEL = {
  grade: "Grade",
  health: "Health",
  bond: "Bond",
  interest: "Interest",
} as const;

/** The action phrase used inside a Success Statement. */
export const ACTION_PHRASE: Record<Activity, string> = {
  study: "study",
  rest: "rest well",
  friends: "show up for friends",
  interest: "chase what I love",
};
