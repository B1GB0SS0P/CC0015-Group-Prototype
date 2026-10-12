import { teamSummary } from "@nsc/shared";
import { playGame } from "./sweep-lib";
import { STRATEGIES } from "./strategies";

/*
 * Balance check with the numbers currently in config.ts.
 *
 *   npm run sim                         all strategies, 5 players, 2000 games each
 *   npm run sim -- --games 500 --players 4
 */

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

const games = arg("games", 2000);
const players = arg("players", 5);

console.log(`\nNo Solo Carry balance check: ${games} games per strategy, ${players} players\n`);
const rows = STRATEGIES.map((strategy) => {
  let wins = 0;
  let bosses = 0;
  let satOut = 0;
  let anySatOut = 0;
  let fires = 0;
  let energyGiven = 0;
  for (let g = 0; g < games; g++) {
    const s = playGame(strategy, players, 1000 + g);
    const sum = teamSummary(s);
    if (s.outcome === "win") wins++;
    bosses += sum.bossesBeaten;
    satOut += sum.termsSatOut;
    if (sum.termsSatOut > 0) anySatOut++;
    fires += sum.statementFires;
    energyGiven += sum.energyGivenToOthers;
  }
  return {
    strategy: strategy.name,
    "win %": +((wins / games) * 100).toFixed(1),
    "bosses beaten (of 4)": +(bosses / games).toFixed(2),
    "games with a burnout %": +((anySatOut / games) * 100).toFixed(1),
    "terms sat out / game": +(satOut / games).toFixed(2),
    "statement fires / game": +(fires / games).toFixed(1),
    "Energy given to others / game": +(energyGiven / games).toFixed(1),
  };
});
console.table(rows);
for (const s of STRATEGIES) console.log(`  ${s.name.padEnd(28)} ${s.description}`);
console.log("");
