/**
 * The /demo game: you play the Ally, three scripted bots play the rest of the
 * team, and the real rules engine runs in the browser (no server).
 *
 * Bots are deterministic (the engine has no randomness either), so every run of
 * the tour plays out the same way. The starting state is set up so each tour
 * step has something to show:
 * - Term 1: the Ally's statement fires when 2 chips go on Friends, and the
 *   Grinder starts lower on Energy, so the Ally's support is visible.
 * - The Ally's Friends chips are doubled, so they have Bond to attack and give.
 * - Results Day: the bots place for the tokens the Ally lacks and pass them
 *   over, so the Ally holds at least one full set.
 */
import {
  ACTIVITY_TOKEN,
  TOKENS,
  addPlayer,
  aliveBosses,
  attack,
  attackSet,
  bond,
  chipsFor,
  chooseRole,
  createGame,
  give,
  heal,
  setDone,
  setStatement,
  startGame,
  submitPlacement,
  tokenDamage,
  type Activity,
  type Counts,
  type GameState,
  type Player,
  type Result,
  type RoleId,
  type Statement,
  type Token,
} from "@nsc/shared";

export const DEMO_CODE = "DEMO";
export const ALLY = "you";
export const BOTS = ["gwen", "arun", "siti"] as const;

const SEATS: { id: string; name: string; role: RoleId; statement: Statement }[] = [
  { id: ALLY, name: "Alex", role: "ally", statement: { action: "friends", target: { kind: "role", role: "grinder" } } },
  // Bot statements use actions the bots don't put 2 chips on in Term 1, so only
  // your statement fires on the tour's "Statements fire" step.
  { id: "gwen", name: "Gwen", role: "grinder", statement: { action: "friends", target: { kind: "token", token: "bond" } } },
  { id: "arun", name: "Arun", role: "anchor", statement: { action: "interest", target: { kind: "role", role: "ally" } } },
  { id: "siti", name: "Siti", role: "spark", statement: { action: "study", target: { kind: "role", role: "anchor" } } },
];

/** The Grinder starts tired: they've been grinding since before the game began. */
const GRINDER_START_ENERGY = 3;

function must(r: Result): GameState {
  if (!r.ok) throw new Error(`Demo script error: ${r.error}`);
  return r.state;
}

/** Apply an engine call, keeping the old state if the rules say no. */
function tryApply(s: GameState, r: Result): GameState {
  return r.ok ? r.state : s;
}

const zero = (): Counts<Activity> => ({ study: 0, rest: 0, friends: 0, interest: 0 });
const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

// ---------------------------------------------------------------------------
// Bot placement
// ---------------------------------------------------------------------------

/** How each bot spends n chips: the Grinder only studies, the others lean into their role. */
function roleMix(role: RoleId | null, n: number): Counts<Activity> {
  const pl = zero();
  if (role === "grinder") pl.study = n;
  else if (role === "anchor") {
    pl.rest = Math.min(n, 3);
    pl.friends = n - pl.rest;
  } else {
    pl.interest = Math.min(n, 3);
    pl.rest = n - pl.interest;
  }
  return pl;
}

function botPlacement(p: Player): Counts<Activity> {
  return roleMix(p.role, chipsFor(p));
}

function placeBots(s: GameState): GameState {
  for (const id of BOTS) {
    const p = player(s, id);
    if (s.phase !== "place" || p.sittingOut || p.placement) continue;
    s = tryApply(s, submitPlacement(s, id, { placement: botPlacement(p), explorerDouble: null }));
  }
  return s;
}

// ---------------------------------------------------------------------------
// Bot fight
// ---------------------------------------------------------------------------

/** Support first (Bond to the most tired teammate, Health for yourself), then hit bosses. */
function fightAs(s: GameState, id: string, { attackBosses = true } = {}): GameState {
  // Give Bond to whoever is most tired, while anyone is at 3 or below.
  for (let guard = 0; guard < 12; guard++) {
    const me = player(s, id);
    if (me.tokens.bond === 0) break;
    const tired = s.players.filter((o) => o.id !== id && o.energy <= 3).sort((a, b) => a.energy - b.energy)[0];
    if (!tired) break;
    const next = tryApply(s, bond(s, id, tired.id, 1));
    if (next === s) break;
    s = next;
  }
  for (let guard = 0; guard < 6; guard++) {
    const me = player(s, id);
    if (me.tokens.health === 0 || me.energy > 2) break;
    const next = tryApply(s, heal(s, id, 1));
    if (next === s) break;
    s = next;
  }
  if (!attackBosses) return s;

  // Full sets on Results Day.
  for (let guard = 0; guard < 6; guard++) {
    const results = aliveBosses(s).find((b) => b.special === "sets");
    const me = player(s, id);
    if (!results || !TOKENS.every((t) => me.tokens[t] > 0)) break;
    s = tryApply(s, attackSet(s, id, results.id, 1));
  }
  // Single tokens on the other bosses, weak spot first.
  for (let guard = 0; guard < 40; guard++) {
    const me = player(s, id);
    const targets = aliveBosses(s).filter((b) => b.special !== "sets");
    if (targets.length === 0) break;
    let best: { boss: string; token: Token; dmg: number } | null = null;
    for (const t of TOKENS) {
      if (me.tokens[t] === 0) continue;
      for (const b of targets) {
        const dmg = tokenDamage(s, b, t);
        if (!best || dmg > best.dmg) best = { boss: b.id, token: t, dmg };
      }
    }
    if (!best) break;
    const next = tryApply(s, attack(s, id, best.boss, best.token, 1));
    if (next === s) break;
    s = next;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Public script
// ---------------------------------------------------------------------------

/** Term 1, chips step: the bots have already placed, waiting on you. */
export function initialDemoState(): GameState {
  let s = createGame();
  for (const seat of SEATS) {
    s = must(addPlayer(s, seat.id, seat.name));
    s = must(chooseRole(s, seat.id, seat.role));
    s = must(setStatement(s, seat.id, seat.statement));
  }
  s = must(startGame(s));
  // startGame returns a fresh copy, so adjusting it here is safe.
  player(s, "gwen").energy = GRINDER_START_ENERGY;
  return placeBots(s);
}

/** Called after any action of yours succeeds: the bots react. */
export function botsReact(s: GameState): GameState {
  if (s.phase === "place") return placeBots(s);
  if (s.phase === "fight" && player(s, ALLY).done) {
    // You pressed "I'm done": the bots take their turn, then end the term.
    for (const id of BOTS) s = fightAs(s, id);
    for (const id of BOTS) s = tryApply(s, setDone(s, id, true));
    return placeBots(s);
  }
  return s;
}

/** Your own auto-play while fast-forwarding: fire your statement, then support and fight. */
function allyPlacement(p: Player): Counts<Activity> {
  const n = chipsFor(p);
  const pl = zero();
  if (n === 0) return pl;
  pl.friends = Math.min(2, n);
  const left = n - pl.friends;
  pl.rest = Math.min(1, left);
  pl.interest = left - pl.rest;
  return pl;
}

/**
 * "Jump to Results Day": play out the rest of the current term and Terms 2–3
 * with the scripts, set Term 4 up so the bots can complete your set, and stop
 * at the start of the Results Day fight with the missing tokens passed to you.
 */
export function jumpToResults(start: GameState): GameState {
  let s = start;
  for (let guard = 0; guard < 40; guard++) {
    if (s.phase === "over" || (s.phase === "fight" && s.term === 4)) break;
    if (s.phase === "place") {
      const me = player(s, ALLY);
      if (!me.sittingOut && !me.placement) {
        s = tryApply(s, submitPlacement(s, ALLY, { placement: allyPlacement(me), explorerDouble: null }));
      }
      s = s.term === 4 ? placeBotsForSet(s) : placeBots(s);
      continue;
    }
    if (s.phase === "fight") {
      s = fightAs(s, ALLY);
      for (const id of BOTS) s = fightAs(s, id);
      for (const p of s.players) s = tryApply(s, setDone(s, p.id, true));
    }
  }
  return passMissingToAlly(s);
}

/** Term 4 placement: between them, the bots make every token type you won't have. */
function placeBotsForSet(s: GameState): GameState {
  const me = player(s, ALLY);
  const have = new Set<Token>();
  if (me.placement) for (const [a, n] of Object.entries(me.placement)) if (n > 0) have.add(ACTIVITY_TOKEN[a as Activity]);
  const need = TOKENS.filter((t) => !have.has(t));
  const activityFor: Record<Token, Activity> = { grade: "study", health: "rest", bond: "friends", interest: "interest" };

  const plans = new Map<string, Counts<Activity>>();
  const free = new Map<string, number>();
  for (const id of BOTS) {
    const p = player(s, id);
    if (p.sittingOut || p.placement) continue;
    plans.set(id, zero());
    free.set(id, chipsFor(p));
  }
  // Hand out one chip per missing token, to the bot with the most chips left.
  for (const t of need) {
    const id = [...free.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!id || id[1] === 0) break;
    plans.get(id[0])![activityFor[t]] += 1;
    free.set(id[0], id[1] - 1);
  }
  // Remaining chips go on each bot's usual mix.
  for (const [id, plan] of plans) {
    const mix = roleMix(player(s, id).role, free.get(id)!);
    for (const a of Object.keys(mix) as Activity[]) plan[a] += mix[a];
    s = tryApply(s, submitPlacement(s, id, { placement: plan, explorerDouble: null }));
  }
  return s;
}

/** Results Day fight: each bot passes you one of any token type you're missing. */
function passMissingToAlly(s: GameState): GameState {
  if (!(s.phase === "fight" && s.term === 4)) return s;
  for (const t of TOKENS) {
    if (player(s, ALLY).tokens[t] > 0) continue;
    const donor = BOTS.map((id) => player(s, id)).find((p) => p.tokens[t] > 0);
    if (donor) s = tryApply(s, give(s, donor.id, ALLY, t, 1));
  }
  return s;
}

/** True when you hold at least one of every token type. */
export function allyHasSet(s: GameState): boolean {
  const me = player(s, ALLY);
  return TOKENS.every((t) => me.tokens[t] > 0);
}
