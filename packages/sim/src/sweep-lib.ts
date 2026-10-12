import {
  ROLES,
  activePlayers,
  addPlayer,
  chooseRole,
  createGame,
  setStatement,
  startGame,
  submitPlacement,
  teamSummary,
  type GameState,
  type Result,
  type RoleId,
} from "@nsc/shared";
import { mulberry32, playFight, type Strategy } from "./strategies";

function must(r: Result): GameState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** Play one full game with a strategy. Deterministic for a given seed. */
export function playGame(strategy: Strategy, players: number, seed: number) {
  const rng = mulberry32(seed);
  const roles = ROLES.slice(0, players) as RoleId[];
  let s = createGame();
  const stmts = strategy.statements(roles, rng);
  roles.forEach((role, i) => {
    s = must(addPlayer(s, `p${i}`, role));
    s = must(chooseRole(s, `p${i}`, role));
  });
  roles.forEach((role, i) => {
    let st = stmts[role]!;
    // In smaller groups, swap role targets that aren't playing for a token target.
    if (st.target.kind === "role" && !roles.includes(st.target.role)) st = { action: st.action, target: { kind: "token", token: "bond" } };
    s = must(setStatement(s, `p${i}`, st));
  });
  s = must(startGame(s));
  while (s.phase !== "over") {
    if (s.phase === "place") {
      for (const p of activePlayers(s)) {
        if (s.phase !== "place") break;
        s = must(submitPlacement(s, p.id, strategy.place(s, s.players.find((x) => x.id === p.id)!, rng)));
      }
    } else {
      s = playFight(s, strategy.support);
    }
  }
  return s;
}

/** Win % and average bosses beaten over many games. */
export function run(strategy: Strategy, games: number, players = 5) {
  let wins = 0;
  let bosses = 0;
  for (let g = 0; g < games; g++) {
    const s = playGame(strategy, players, 5000 + g);
    if (s.outcome === "win") wins++;
    bosses += teamSummary(s).bossesBeaten;
  }
  return { win: Math.round((wins / games) * 100), bosses: +(bosses / games).toFixed(2) };
}
