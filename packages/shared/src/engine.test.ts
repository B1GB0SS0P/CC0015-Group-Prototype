import { describe, expect, it } from "vitest";
import {
  GAME_CONFIG,
  addPlayer,
  attack,
  attackSet,
  bond,
  canStart,
  chooseRole,
  createGame,
  forceAdvance,
  heal,
  setDone,
  setStatement,
  startGame,
  submitPlacement,
  type GameState,
  type Result,
  type RoleId,
  type Statement,
} from "./index";

function must(r: Result): GameState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const roles: RoleId[] = ["grinder", "anchor", "ally", "spark", "explorer"];

/** A started 5-player game. Statements default to a harmless token target. */
function started(overrides: Partial<Record<RoleId, Statement>> = {}): GameState {
  let s = createGame();
  roles.forEach((r, i) => {
    s = must(addPlayer(s, `p${i}`, r));
    s = must(chooseRole(s, `p${i}`, r));
    const st: Statement = overrides[r] ?? { action: "interest", target: { kind: "token", token: "interest" } };
    s = must(setStatement(s, `p${i}`, st));
  });
  return must(startGame(s));
}

const id = (r: RoleId) => `p${roles.indexOf(r)}`;
const player = (s: GameState, r: RoleId) => s.players.find((p) => p.role === r)!;

/** Everyone places the same chips (Explorer doubles rest). */
function placeAll(s: GameState, placement: Record<string, number>): GameState {
  for (const p of s.players) {
    if (p.sittingOut) continue;
    s = must(submitPlacement(s, p.id, { placement, explorerDouble: p.role === "explorer" ? (p.lastExplorerDouble === "rest" ? "friends" : "rest") : undefined }));
  }
  return s;
}

/** Skip ahead with the host override, keeping everyone healthy so nobody sits out. */
function skipTo(s: GameState, term: number): GameState {
  while (s.phase !== "over" && s.term < term) {
    s = must(forceAdvance(s));
    if (s.phase === "fight") s = must(forceAdvance(s));
    for (const p of s.players) {
      p.energy = GAME_CONFIG.startEnergy;
      p.sittingOut = false;
    }
  }
  return s;
}

function allDone(s: GameState): GameState {
  for (const p of s.players) if (!p.sittingOut) s = must(setDone(s, p.id, true));
  return s;
}

/** Ana (Grinder), Ben (Ally), Cai (Anchor), all with valid statements. */
function threePlayers(): GameState {
  let s = createGame();
  const seats: [string, string, RoleId, Statement][] = [
    ["a", "Ana", "grinder", { action: "study", target: { kind: "token", token: "bond" } }],
    ["b", "Ben", "ally", { action: "friends", target: { kind: "role", role: "grinder" } }],
    ["c", "Cai", "anchor", { action: "rest", target: { kind: "role", role: "ally" } }],
  ];
  for (const [pid, name, role, st] of seats) {
    s = must(addPlayer(s, pid, name));
    s = must(chooseRole(s, pid, role));
    s = must(setStatement(s, pid, st));
  }
  return s;
}

describe("lobby", () => {
  it("needs at least the minimum number of players", () => {
    let s = createGame();
    s = must(addPlayer(s, "a", "Ana"));
    expect(canStart(s)).toMatch(/at least/);
  });

  it("rejects a statement that targets your own role", () => {
    let s = createGame();
    s = must(addPlayer(s, "a", "Ana"));
    s = must(chooseRole(s, "a", "ally"));
    const r = setStatement(s, "a", { action: "friends", target: { kind: "role", role: "ally" } });
    expect(r.ok).toBe(false);
  });

  it("blocks duplicate roles", () => {
    let s = createGame();
    s = must(addPlayer(s, "a", "Ana"));
    s = must(addPlayer(s, "b", "Ben"));
    s = must(chooseRole(s, "a", "grinder"));
    expect(chooseRole(s, "b", "grinder").ok).toBe(false);
  });

  it("won't start if a statement targets a role nobody is playing", () => {
    let s = threePlayers();
    s = must(setStatement(s, "a", { action: "study", target: { kind: "role", role: "spark" } }));
    expect(canStart(s)).toMatch(/isn't playing/);
  });

  it("scales boss HP for smaller groups", () => {
    const s = must(startGame(threePlayers()));
    expect(s.bosses[0]!.hp).toBe(Math.round(GAME_CONFIG.bosses[0]!.hp * GAME_CONFIG.hpMultiplierByPlayers[3]!));
  });
});

describe("placing chips", () => {
  it("doubles the role's activity and charges Energy for Study", () => {
    let s = started();
    s = placeAll(s, { study: 3, rest: 1 });
    const g = player(s, "grinder");
    expect(g.tokens.grade).toBe(6); // doubled
    expect(g.tokens.health).toBe(1);
    expect(g.energy).toBe(GAME_CONFIG.startEnergy - 3);
    const a = player(s, "anchor");
    expect(a.tokens.health).toBe(2); // doubled rest
    expect(s.phase).toBe("fight");
  });

  it("gives tired players fewer chips (chips = Energy, up to 4)", () => {
    let s = started();
    s = placeAll(s, { study: 2, rest: 2 }); // 5 -> 3 after Study
    s = allDone(s); // drain -> 2
    const g = player(s, "grinder");
    expect(g.energy).toBe(2);
    expect(submitPlacement(s, g.id, { placement: { rest: 4 } }).ok).toBe(false);
    expect(submitPlacement(s, g.id, { placement: { rest: 2 } }).ok).toBe(true);
  });

  it("requires exactly the chip count", () => {
    const s = started();
    expect(submitPlacement(s, id("grinder"), { placement: { study: 2 } }).ok).toBe(false);
  });

  it("stops the Explorer doubling the same activity twice in a row", () => {
    let s = started();
    s = placeAll(s, { rest: 4 });
    s = allDone(s);
    const r = submitPlacement(s, id("explorer"), { placement: { rest: 4 }, explorerDouble: "rest" });
    expect(r.ok).toBe(false);
  });
});

describe("statements", () => {
  it("a role-targeted statement restores that teammate's Energy", () => {
    let s = started({ ally: { action: "friends", target: { kind: "role", role: "grinder" } } });
    // Grinder studies 4 (5 -> 1), Ally puts 2 on friends so the statement fires (+2).
    s = must(submitPlacement(s, id("grinder"), { placement: { study: 4 } }));
    s = must(submitPlacement(s, id("ally"), { placement: { friends: 2, rest: 2 } }));
    for (const r of ["anchor", "spark"] as RoleId[]) s = must(submitPlacement(s, id(r), { placement: { rest: 4 } }));
    s = must(submitPlacement(s, id("explorer"), { placement: { rest: 4 }, explorerDouble: "rest" }));
    expect(player(s, "grinder").energy).toBe(3);
    expect(player(s, "ally").stats.statementFires).toBe(1);
  });

  it("a token-targeted statement adds damage for the whole team", () => {
    let s = started({ grinder: { action: "study", target: { kind: "token", token: "bond" } } });
    s = must(submitPlacement(s, id("grinder"), { placement: { study: 2, friends: 2 } }));
    for (const r of ["anchor", "ally", "spark"] as RoleId[]) s = must(submitPlacement(s, id(r), { placement: { friends: 4 } }));
    s = must(submitPlacement(s, id("explorer"), { placement: { friends: 4 }, explorerDouble: "rest" }));
    expect(s.tokenBonus.bond).toBe(1);
    // Comparison is weak to Bond: 1 base + 1 weakness + 1 statement = 3 each.
    const before = s.bosses[0]!.hp;
    s = must(attack(s, id("anchor"), "comparison", "bond", 2));
    expect(before - s.bosses[0]!.hp).toBe(6);
  });

  it("does not fire with fewer chips than the threshold", () => {
    let s = started({ grinder: { action: "study", target: { kind: "token", token: "bond" } } });
    s = placeAll(s, { study: 1, rest: 3 });
    expect(s.tokenBonus.bond).toBe(0);
  });

  it("allows one rewrite, only before placing", () => {
    let s = started();
    const st: Statement = { action: "study", target: { kind: "role", role: "ally" } };
    s = must(setStatement(s, id("grinder"), st));
    expect(player(s, "grinder").rewritesLeft).toBe(0);
    expect(setStatement(s, id("grinder"), st).ok).toBe(false);
  });
});

describe("fight and support", () => {
  it("Results Day only takes full sets", () => {
    let s = started();
    s = skipTo(s, 4);
    expect(s.term).toBe(4);
    s = placeAll(s, { study: 1, rest: 1, friends: 1, interest: 1 });
    expect(attack(s, id("anchor"), "results", "grade", 1).ok).toBe(false);
    const before = s.bosses.find((b) => b.id === "results")!.hp;
    s = must(attackSet(s, id("anchor"), "results", 1));
    expect(before - s.bosses.find((b) => b.id === "results")!.hp).toBe(GAME_CONFIG.setDamage);
  });

  it("Health restores your own Energy, Bond restores a teammate's", () => {
    let s = started();
    s = placeAll(s, { study: 2, rest: 1, friends: 1 });
    const g0 = player(s, "grinder").energy;
    s = must(heal(s, id("grinder"), 1));
    expect(player(s, "grinder").energy).toBe(g0 + 1);
    expect(bond(s, id("ally"), id("ally"), 1).ok).toBe(false);
    s = must(bond(s, id("ally"), id("grinder"), 1));
    expect(player(s, "grinder").energy).toBe(Math.min(5, g0 + 1 + 2));
  });
});

describe("end of term", () => {
  it("every term drains Energy, a surviving boss drains more, and tokens are discarded", () => {
    let s = started();
    s = placeAll(s, { rest: 4 });
    s = allDone(s);
    expect(s.term).toBe(2);
    expect(player(s, "anchor").energy).toBe(GAME_CONFIG.startEnergy - GAME_CONFIG.drainPerTerm - GAME_CONFIG.endOfTermPenalty);
    expect(player(s, "anchor").tokens.health).toBe(0);
    expect(s.bosses.map((b) => b.id)).toEqual(["comparison", "burnout"]);
  });

  it("a player at 0 Energy sits out the next term", () => {
    let s = started();
    s = must(submitPlacement(s, id("grinder"), { placement: { study: 4 } })); // 5 -> 1
    for (const r of ["anchor", "ally", "spark"] as RoleId[]) s = must(submitPlacement(s, id(r), { placement: { rest: 4 } }));
    s = must(submitPlacement(s, id("explorer"), { placement: { rest: 4 }, explorerDouble: "rest" }));
    s = allDone(s); // surviving boss -> 0
    expect(s.phase).toBe("place");
    expect(s.term).toBe(2);
    expect(player(s, "grinder").sittingOut).toBe(true);
    expect(submitPlacement(s, id("grinder"), { placement: { rest: 4 } }).ok).toBe(false);
  });

  it("the team loses if a boss survives the last term", () => {
    let s = skipTo(started(), 4);
    s = must(forceAdvance(s));
    s = must(forceAdvance(s));
    expect(s.phase).toBe("over");
    expect(s.outcome).toBe("lose");
  });

  it("never mutates the input state", () => {
    const s = started();
    const snapshot = JSON.stringify(s);
    placeAll(s, { study: 4 });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
