import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { GAME_CONFIG, ROLE_INFO, aliveBosses, canStart, chipsFor, teamSummary, type Player } from "@nsc/shared";
import type { Game, LiveState } from "./net";
import { BossCard, ConnectionBanner, Pips, StatementText, Toast } from "./ui";

const DEBRIEF = [
  "Before the game started, what did you think winning would need? Was it true?",
  "Results Day only took full sets. What does that say about success?",
  "Who did your statement target, and why? Did anyone rewrite theirs?",
  "Why do you think the rules never let you target yourself?",
  "Grades were one token out of four. When were they useful, and when were they not enough?",
];

function joinUrl(code: string) {
  return `${window.location.origin}/join/${code}`;
}

function QR({ code }: { code: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(joinUrl(code), { margin: 1, width: 440, color: { dark: "#172447", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [code]);
  return src ? <img className="qr" src={src} alt={`QR code to join game ${code}`} /> : null;
}

function phaseText(s: LiveState): { title: string; hint: string } {
  if (s.phase === "lobby") return { title: "Lobby", hint: "Scan the code, pick a role and write a Success Statement." };
  if (s.phase === "place") return { title: `Term ${s.term}: place your chips`, hint: "Split your time. Chips equal your Energy, up to 4." };
  if (s.phase === "fight") return { title: `Term ${s.term}: fight and support`, hint: "Spend tokens on bosses, or on keeping teammates going." };
  return { title: "Game over", hint: "" };
}

function PlayerStatus({ p, s }: { p: Player; s: LiveState }) {
  if (!p.connected) return <span className="badge red">Offline</span>;
  if (s.phase === "lobby") return p.role && p.statement ? <span className="badge">Ready</span> : <span className="badge outline">Choosing…</span>;
  if (p.sittingOut) return <span className="badge red">Burned out</span>;
  if (s.phase === "place") return p.placement ? <span className="badge">Placed</span> : <span className="badge outline">{chipsFor(p)} chips</span>;
  if (s.phase === "fight") return p.done ? <span className="badge">Done</span> : <span className="badge outline">Acting…</span>;
  return null;
}

export function Board({ game }: { game: Game }) {
  const s = game.state;
  const [confirmSkip, setConfirmSkip] = useState(false);
  const startError = useMemo(() => (s && s.phase === "lobby" ? canStart(s) : null), [s]);

  if (!s) {
    return (
      <main className="page margined">
        <p className="hand">Setting up the board…</p>
      </main>
    );
  }

  const { title, hint } = phaseText(s);
  const summary = teamSummary(s);

  return (
    <main className="page margined">
      <ConnectionBanner status={game.status} />
      <div className="board">
        {/* Left: how to join, terms, controls */}
        <aside className="stack">
          <div className="sheet stack" style={{ gap: 10 }}>
            <p className="muted small">Join at {window.location.host}/join with code</p>
            <div className="code-big">{s.code}</div>
            {s.phase === "lobby" && <QR code={s.code} />}
          </div>

          {s.phase !== "lobby" && (
            <div className="terms" aria-label={`Term ${s.term} of ${GAME_CONFIG.terms}`}>
              {Array.from({ length: GAME_CONFIG.terms }, (_, i) => i + 1).map((t) => (
                <div key={t} className={`term${t === s.term && s.phase !== "over" ? " now" : t < s.term || s.phase === "over" ? " past" : ""}`}>
                  {t}
                </div>
              ))}
            </div>
          )}

          <div className="stack" style={{ gap: 10 }}>
            {s.phase === "lobby" && (
              <>
                <button className="btn primary block" disabled={!!startError} onClick={() => game.send("start", {})}>
                  Start the game
                </button>
                {startError && <p className="small muted">{startError}</p>}
              </>
            )}
            {(s.phase === "place" || s.phase === "fight") &&
              (confirmSkip ? (
                <div className="sheet flat stack" style={{ gap: 8 }}>
                  <p className="small">Move on without waiting? Anyone who hasn't placed chips places none this term.</p>
                  <div className="row">
                    <button
                      className="btn danger"
                      onClick={() => {
                        game.send("forceNext", {});
                        setConfirmSkip(false);
                      }}
                    >
                      Move on
                    </button>
                    <button className="btn ghost" onClick={() => setConfirmSkip(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn block" onClick={() => setConfirmSkip(true)}>
                  Skip waiting
                </button>
              ))}
            {s.phase === "over" && (
              <button className="btn primary block" onClick={() => game.send("restart", {})}>
                Play again
              </button>
            )}
            <button className="btn ghost" onClick={() => void game.leave()}>
              Close board
            </button>
          </div>
        </aside>

        {/* Middle: the game */}
        <section className="stack">
          <header className="stack" style={{ gap: 4 }}>
            <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>{title}</h1>
            {hint && <p className="muted">{hint}</p>}
          </header>

          {s.phase === "over" ? (
            <div className="stack">
              <p className={`outcome ${s.outcome}`}>{s.outcome === "win" ? "The team wins together." : "The team loses together."}</p>
              <div className="row">
                <span className="badge outline">{summary.bossesBeaten} of {summary.bossesTotal} bosses beaten</span>
                <span className="badge outline">{summary.statementFires} statements fired</span>
                <span className="badge outline">{summary.energyGivenToOthers} Energy given to teammates</span>
                <span className="badge outline">{summary.termsSatOut} terms lost to burnout</span>
              </div>
              <div className="sheet stack">
                <h2>Talk it through</h2>
                <ol className="qlist">
                  {DEBRIEF.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            s.bosses.length > 0 && (
              <div className="bosses">
                {[...s.bosses].reverse().map((b) => (
                  <BossCard key={b.id} boss={b} current={b.arrivedTerm === s.term} />
                ))}
              </div>
            )
          )}

          <h2 style={{ marginTop: 8 }}>The team</h2>
          {s.players.length === 0 ? (
            <p className="muted">Nobody yet. Scan the QR code or type the code at {window.location.host}.</p>
          ) : (
            <div className="attendance">
              {s.players.map((p) => (
                <div key={p.id} className={`att${p.sittingOut ? " out" : ""}`}>
                  <div>
                    <div className="who">{p.name}</div>
                    <div className="small muted">{p.role ? `${ROLE_INFO[p.role].name} (${ROLE_INFO[p.role].moba})` : "No role yet"}</div>
                  </div>
                  <div className="stmt">
                    <StatementText s={p.statement} />
                  </div>
                  <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
                    {s.phase !== "lobby" && <Pips value={p.energy} />}
                    <PlayerStatus p={p} s={s} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: margin notes */}
        <aside className="stack">
          <h3>Margin notes</h3>
          <div className="log" aria-live="polite">
            {s.log.length === 0 && <p className="muted small">What happens shows up here.</p>}
            {[...s.log].reverse().map((l, i) => (
              <div key={`${s.log.length - i}`} className={`entry k-${l.kind}`}>
                {l.text}
              </div>
            ))}
          </div>
          {s.phase !== "lobby" && s.phase !== "over" && aliveBosses(s).length === 0 && (
            <p className="banner small">Every boss so far is beaten. Keep everyone's Energy up for what comes next.</p>
          )}
        </aside>
      </div>
      <Toast text={game.error} />
    </main>
  );
}
