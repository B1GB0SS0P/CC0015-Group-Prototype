/*
 * End-to-end smoke test over real WebSockets: a board screen and 3 phones
 * play a full game against a running server.
 *
 *   npm run smoke --workspace=@nsc/server        (server must be running)
 */
import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, type GameState } from "@nsc/shared";

const URL = process.env.SERVER_URL ?? "http://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Conn = { room: Room; state?: GameState & { code: string }; id?: string | null; errors: string[] };
function wire(room: Room): Conn {
  const c: Conn = { room, errors: [] };
  room.onMessage("state", (s) => (c.state = s));
  room.onMessage("welcome", (w) => (c.id = w.playerId));
  room.onMessage("error", (e) => c.errors.push(e.message));
  return c;
}

async function main() {
  const client = new Client(URL);
  const host = wire(await client.create(ROOM_NAME, { host: true }));
  await sleep(200);
  const code = host.state!.code;
  console.log("room code", code);

  const seats = [
    { name: "Ana", role: "grinder", statement: { action: "study", target: { kind: "token", token: "bond" } } },
    { name: "Ben", role: "ally", statement: { action: "friends", target: { kind: "role", role: "grinder" } } },
    { name: "Cai", role: "anchor", statement: { action: "rest", target: { kind: "role", role: "ally" } } },
  ];
  const phones: Conn[] = [];
  for (const s of seats) {
    const p = wire(await new Client(URL).joinById(code, { name: s.name }));
    await sleep(100);
    p.room.send("chooseRole", { role: s.role });
    await sleep(50);
    p.room.send("setStatement", { statement: s.statement });
    phones.push(p);
  }
  await sleep(200);
  host.room.send("start", {});
  await sleep(200);
  console.log("phase", host.state!.phase, "term", host.state!.term, "boss", host.state!.bosses.map((b) => `${b.name} ${b.hp}`));

  // Mid-game disconnect + rejoin by name.
  await phones[2]!.room.leave(true);
  await sleep(200);
  console.log("Cai connected after leave:", host.state!.players.find((p) => p.name === "Cai")!.connected);
  phones[2] = wire(await new Client(URL).joinById(code, { name: "Cai" }));
  await sleep(200);
  console.log("Cai connected after rejoin:", host.state!.players.find((p) => p.name === "Cai")!.connected);

  // A late joiner with a new name is refused.
  try {
    await new Client(URL).joinById(code, { name: "Zed" });
    console.log("ERROR: late joiner was allowed");
  } catch (e) {
    console.log("late joiner refused:", (e as Error).message);
  }

  // Play 4 terms: everyone spreads chips, attacks the current boss, then done.
  while (host.state!.phase !== "over") {
    const st = host.state!;
    if (st.phase === "place") {
      for (const p of phones) {
        const me = st.players.find((x) => x.id === p.id)!;
        if (me.sittingOut) continue;
        const chips = Math.min(4, me.energy);
        const placement = { study: 0, rest: 0, friends: 0, interest: 0 } as Record<string, number>;
        const order = ["rest", "friends", "interest", "study"];
        for (let i = 0; i < chips; i++) placement[order[i % 4]!]! += 1;
        p.room.send("place", { placement });
      }
      await sleep(250);
    } else if (st.phase === "fight") {
      const boss = st.bosses.filter((b) => b.hp > 0).at(-1);
      for (const p of phones) {
        const me = host.state!.players.find((x) => x.id === p.id)!;
        if (boss?.special === "sets") {
          const n = Math.min(me.tokens.grade, me.tokens.health, me.tokens.bond, me.tokens.interest);
          if (n > 0) p.room.send("attackSet", { bossId: boss.id, count: n });
        } else if (boss) {
          for (const t of ["grade", "health", "bond", "interest"] as const) if (me.tokens[t] > 0) p.room.send("attack", { bossId: boss.id, token: t, count: me.tokens[t] });
        }
        await sleep(60);
        p.room.send("done", { done: true });
      }
      await sleep(250);
    }
    console.log(`term ${host.state!.term} phase ${host.state!.phase}`, host.state!.bosses.map((b) => `${b.name}:${b.hp}`).join(", "));
  }
  console.log("OUTCOME", host.state!.outcome);
  console.log("phone errors", phones.map((p) => p.errors));
  const last = host.state!.log.slice(-6).map((l) => l.text);
  console.log(last.join("\n"));
  process.exit(0);
}

main().catch((e) => {
  console.error("SMOKE FAILED", e);
  process.exit(1);
});
