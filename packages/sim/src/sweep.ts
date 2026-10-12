import { GAME_CONFIG } from "@nsc/shared";
import { run } from "./sweep-lib";
import { STRATEGIES } from "./strategies";

/*
 * Tuning sweep: scales every boss's HP and reports each strategy's win rate
 * (and average bosses beaten). Use it after changing numbers in config.ts.
 *
 *   npm run sweep --workspace=@nsc/sim
 *
 * What "balanced" looks like: sensible teams win, the same teams without
 * support lose, all-study teams lose.
 */

const cfg = GAME_CONFIG as unknown as { bosses: { hp: number }[] };
const BASE = cfg.bosses.map((b) => b.hp);

const rows: Record<string, string | number>[] = [];
for (const mult of [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4]) {
  cfg.bosses.forEach((b, i) => (b.hp = Math.round(BASE[i]! * mult)));
  const row: Record<string, string | number> = { "HP x": mult, hp: cfg.bosses.map((b) => b.hp).join("/") };
  for (const s of STRATEGIES) {
    const r = run(s, 300);
    row[s.name] = `${r.win}% (${r.bosses})`;
  }
  rows.push(row);
}
cfg.bosses.forEach((b, i) => (b.hp = BASE[i]!));
console.log("\nWin % per strategy (average bosses beaten, of 4). HP x = multiplier on config.ts values.\n");
console.table(rows);
