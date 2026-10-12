import {
  ACTIVITIES,
  ACTIVITY_TOKEN,
  GAME_CONFIG,
  chipsFor,
  TOKENS,
  activePlayers,
  aliveBosses,
  attack,
  attackSet,
  bond,
  doubledActivity,
  give,
  heal,
  setDone,
  tokenDamage,
  zeroActivities,
  type Activity,
  type Counts,
  type GameState,
  type Player,
  type Result,
  type RoleId,
  type Statement,
  type Token,
} from "@nsc/shared";

export type Rng = () => number;

/** Small deterministic PRNG so runs are reproducible. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function must(r: Result): GameState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

export interface Strategy {
  name: string;
  description: string;
  statements: (roles: RoleId[], rng: Rng) => Record<string, Statement>;
  place: (s: GameState, p: Player, rng: Rng) => { placement: Counts<Activity>; explorerDouble?: Activity };
  /** Whether the team spends Health/Bond on Energy before attacking. */
  support: boolean;
}

// ---------------------------------------------------------------------------
// Statement sets
// ---------------------------------------------------------------------------

const MIXED: Record<RoleId, Statement> = {
  ally: { action: "friends", target: { kind: "role", role: "grinder" } },
  anchor: { action: "rest", target: { kind: "token", token: "health" } },
  spark: { action: "interest", target: { kind: "token", token: "interest" } },
  grinder: { action: "study", target: { kind: "token", token: "bond" } },
  explorer: { action: "rest", target: { kind: "role", role: "grinder" } },
};

const TOKEN_ONLY: Record<RoleId, Statement> = {
  ally: { action: "friends", target: { kind: "token", token: "bond" } },
  anchor: { action: "rest", target: { kind: "token", token: "health" } },
  spark: { action: "interest", target: { kind: "token", token: "interest" } },
  grinder: { action: "study", target: { kind: "token", token: "grade" } },
  explorer: { action: "rest", target: { kind: "token", token: "grade" } },
};

const ROLE_ONLY: Record<RoleId, Statement> = {
  ally: { action: "friends", target: { kind: "role", role: "grinder" } },
  anchor: { action: "rest", target: { kind: "role", role: "spark" } },
  spark: { action: "interest", target: { kind: "role", role: "explorer" } },
  grinder: { action: "study", target: { kind: "role", role: "anchor" } },
  explorer: { action: "rest", target: { kind: "role", role: "grinder" } },
};

const ALL_STUDY: Record<RoleId, Statement> = {
  ally: { action: "study", target: { kind: "token", token: "grade" } },
  anchor: { action: "study", target: { kind: "token", token: "grade" } },
  spark: { action: "study", target: { kind: "token", token: "grade" } },
  grinder: { action: "study", target: { kind: "token", token: "grade" } },
  explorer: { action: "study", target: { kind: "token", token: "grade" } },
};

const fixed = (set: Record<RoleId, Statement>) => (roles: RoleId[]) =>
  Object.fromEntries(roles.map((r) => [r, set[r]])) as Record<string, Statement>;

// ---------------------------------------------------------------------------
// Placement policies
// ---------------------------------------------------------------------------

function explorerPick(p: Player, wanted: Activity[]): Activity {
  for (const a of wanted) if (a !== p.lastExplorerDouble) return a;
  return ACTIVITIES.find((a) => a !== p.lastExplorerDouble)!;
}

function currentBoss(s: GameState) {
  return s.bosses.find((b) => b.arrivedTerm === s.term);
}

const tokenActivity = (t: Token): Activity => ACTIVITIES.find((a) => ACTIVITY_TOKEN[a] === t)!;

/** Everyone studies every chip: the "grades are everything" team. */
function placeAllStudy(_s: GameState, p: Player) {
  const placement = zeroActivities();
  placement.study = chipsFor(p);
  return { placement, explorerDouble: p.role === "explorer" ? explorerPick(p, ["study", "rest"]) : undefined };
}

/** Uniformly random chips. */
function placeRandom(_s: GameState, p: Player, rng: Rng) {
  const placement = zeroActivities();
  for (let i = 0; i < chipsFor(p); i++) placement[ACTIVITIES[Math.floor(rng() * 4)]!] += 1;
  return { placement, explorerDouble: p.role === "explorer" ? explorerPick(p, [ACTIVITIES[Math.floor(rng() * 4)]!]) : undefined };
}

/**
 * A sensible team: two chips on your strength (so your statement fires),
 * the rest on the current boss's weakness, rest when tired, and on Results
 * Day spread chips so the team can build full sets.
 */
function placeBalanced(s: GameState, p: Player) {
  const cfg = GAME_CONFIG;
  const boss = currentBoss(s);
  const placement = zeroActivities();
  let explorerDouble: Activity | undefined;

  const weakAct = boss?.weakness ? tokenActivity(boss.weakness) : null;
  if (p.role === "explorer") explorerDouble = explorerPick(p, weakAct ? [weakAct, "rest"] : ["rest", "friends", "interest", "study"]);
  const spec = p.role === "explorer" ? explorerDouble! : doubledActivity(p)!;
  const stAction = p.statement?.action ?? spec;
  // Avoid burning out, except in the final term, when there is no next term to sit out.
  const lastTerm = s.term >= cfg.terms;
  const chips = chipsFor(p);
  const maxStudy = lastTerm ? chips : Math.max(0, p.energy - 2);

  const put = (a: Activity, n = 1) => {
    for (let i = 0; i < n; i++) {
      const sum = ACTIVITIES.reduce((x, k) => x + placement[k], 0);
      if (sum >= chips) return;
      if (a === "study" && placement.study >= maxStudy) a = "rest";
      placement[a] += 1;
    }
  };

  if (boss?.special === "sets") {
    // Results Day: two on the statement action, then fill whichever token the team is shortest on.
    put(stAction, 2);
    const projected: Counts<Token> = { grade: 0, health: 0, bond: 0, interest: 0 };
    for (const o of s.players) {
      if (o.sittingOut || !o.placement) continue;
      const d = doubledActivity(o);
      for (const a of ACTIVITIES) projected[ACTIVITY_TOKEN[a]] += o.placement[a] * (a === d ? 2 : 1);
    }
    for (const a of ACTIVITIES) projected[ACTIVITY_TOKEN[a]] += placement[a] * (a === spec ? 2 : 1);
    while (ACTIVITIES.reduce((x, k) => x + placement[k], 0) < chips) {
      const short = [...TOKENS].sort((x, y) => projected[x] - projected[y])[0]!;
      const a = tokenActivity(short);
      put(a);
      projected[short] += a === spec ? 2 : 1;
    }
    return { placement, explorerDouble };
  }

  put(stAction, 2);
  if (p.energy <= 3) put("rest");
  if (weakAct) put(weakAct, 4);
  put(spec, 4);
  put("rest", 4);
  return { placement, explorerDouble };
}

// ---------------------------------------------------------------------------
// Fight policy (shared by every strategy)
// ---------------------------------------------------------------------------

export function playFight(state: GameState, support: boolean): GameState {
  let s = state;
  const cfg = GAME_CONFIG;
  const byId = (id: string) => s.players.find((p) => p.id === id)!;

  if (support) {
    // Keep everyone at 2+ Energy so the end-of-term hit can't knock them out.
    for (const p of [...s.players].sort((a, b) => a.energy - b.energy)) {
      while (byId(p.id).energy < 3 && byId(p.id).tokens.health > 0) s = must(heal(s, p.id, 1));
      for (const helper of s.players) {
        if (helper.id === p.id) continue;
        while (byId(p.id).energy < 3 && byId(helper.id).tokens.bond > 0) s = must(bond(s, helper.id, p.id, 1));
      }
    }
  }

  // Results Day: pool every token with one player and build full sets.
  const results = aliveBosses(s).find((b) => b.special === "sets");
  if (results) {
    const hand = s.players[0]!.id;
    for (const o of s.players) {
      if (o.id === hand) continue;
      for (const t of TOKENS) if (byId(o.id).tokens[t] > 0) s = must(give(s, o.id, hand, t, byId(o.id).tokens[t]));
    }
    const h = byId(hand);
    const sets = Math.min(...TOKENS.map((t) => h.tokens[t]), Math.ceil(results.hp / cfg.setDamage));
    if (sets > 0) s = must(attackSet(s, hand, results.id, sets));
  }

  // Single-token attacks: best damage first, oldest boss first.
  for (const boss of aliveBosses(s).filter((b) => b.special !== "sets").sort((a, b) => a.arrivedTerm - b.arrivedTerm)) {
    for (;;) {
      const live = s.bosses.find((b) => b.id === boss.id)!;
      if (live.hp <= 0) break;
      let best: { pid: string; token: Token; dmg: number } | null = null;
      for (const p of s.players) {
        for (const t of TOKENS) {
          if (p.tokens[t] <= 0) continue;
          const dmg = tokenDamage(s, live, t, cfg);
          if (!best || dmg > best.dmg) best = { pid: p.id, token: t, dmg };
        }
      }
      if (!best) break;
      s = must(attack(s, best.pid, live.id, best.token, 1));
    }
  }

  if (support) {
    // Leftovers would be discarded anyway: turn them into Energy.
    for (const p of s.players) if (byId(p.id).tokens.health > 0) s = must(heal(s, p.id, byId(p.id).tokens.health));
    for (const p of s.players) {
      while (byId(p.id).tokens.bond > 0) {
        const target = s.players.filter((o) => o.id !== p.id).sort((a, b) => a.energy - b.energy)[0];
        if (!target) break;
        s = must(bond(s, p.id, target.id, 1));
      }
    }
  }

  for (const p of activePlayers(s)) if (s.phase === "fight") s = must(setDone(s, p.id, true));
  return s;
}

// ---------------------------------------------------------------------------
// Strategy catalogue
// ---------------------------------------------------------------------------

export const STRATEGIES: Strategy[] = [
  {
    name: "balanced",
    description: "Spread time, support tired players, mixed statements",
    statements: fixed(MIXED),
    place: placeBalanced,
    support: true,
  },
  {
    name: "balanced-no-support",
    description: "Same placement, but never spends Health or Bond on Energy",
    statements: fixed(MIXED),
    place: placeBalanced,
    support: false,
  },
  {
    name: "balanced-token-statements",
    description: "Balanced, but every statement targets a token type",
    statements: fixed(TOKEN_ONLY),
    place: placeBalanced,
    support: true,
  },
  {
    name: "balanced-role-statements",
    description: "Balanced, but every statement targets a teammate",
    statements: fixed(ROLE_ONLY),
    place: placeBalanced,
    support: true,
  },
  {
    name: "all-study",
    description: "Every chip on Study, every term",
    statements: fixed(ALL_STUDY),
    place: placeAllStudy,
    support: true,
  },
  {
    name: "random",
    description: "Random chips, sensible statements",
    statements: fixed(MIXED),
    place: placeRandom,
    support: true,
  },
];
