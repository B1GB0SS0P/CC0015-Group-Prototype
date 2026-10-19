import { useState } from "react";
import type { Game } from "./net";

export function Home({ game, initialCode }: { game: Game; initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const busy = game.status === "connecting";
  const canJoin = code.trim().length === 4 && name.trim().length > 0 && !busy;

  return (
    <main className="page margined">
      <div className="narrow stack">
        <header className="stack" style={{ gap: 8, marginTop: 12 }}>
          <h1>No Solo Carry</h1>
          <p className="hand" style={{ fontSize: "1.3rem" }}>
            A co-op game about what success really means. Nobody carries alone.
          </p>
        </header>

        <form
          className="sheet stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (canJoin) void game.join(code, name);
          }}
        >
          <h2>Join your group</h2>
          <div className="field">
            <label htmlFor="code">Game code</label>
            <input
              id="code"
              className="input code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
              placeholder="ABCD"
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
            />
          </div>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              placeholder="First name is fine"
              autoComplete="given-name"
            />
            <p className="small muted">Lost connection mid-game? Join again with the same name to get your seat back.</p>
          </div>
          <button className="btn primary block" disabled={!canJoin}>
            {busy ? "Joining…" : "Join"}
          </button>
        </form>

        <section className="sheet flat stack" style={{ gap: 10 }}>
          <h3>Running this for a class?</h3>
          <p className="muted">Open the board screen on the projector. It shows the code your group joins with, the bosses and the team.</p>
          <button className="btn" disabled={busy} onClick={() => void game.host()}>
            Open a board screen
          </button>
        </section>

        <section className="sheet stack how-teaser" style={{ gap: 10 }}>
          <h3>New here?</h3>
          <ol className="muted" style={{ margin: 0, paddingLeft: "1.2em" }}>
            <li>Pick a role and write a Success Statement that helps a teammate.</li>
            <li>Each term, split your time between Study, Rest, Friends and Interest.</li>
            <li>Beat four bosses together. Grades alone won't do it.</li>
          </ol>
          <a className="btn primary" href="/how-to-play">
            How to play
          </a>
        </section>
      </div>
    </main>
  );
}
