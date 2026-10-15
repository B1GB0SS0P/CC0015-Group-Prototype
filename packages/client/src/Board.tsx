import QRCode from "qrcode";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { GAME_CONFIG, ROLE_INFO, TOKENS, TOKEN_LABEL, ACTION_PHRASE, aliveBosses, canStart, chipsFor, teamSummary, type Boss, type LogEntry, type Player } from "@nsc/shared";
import type { Game, LiveState } from "./net";
import { Battery, BossDoodle, ConnectionBanner, DoodleDefs, HpBoxes, TokenChip, Toast, Weakness } from "./ui";

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
    QRCode.toDataURL(joinUrl(code), { margin: 1, width: 480, color: { dark: "#16213f", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [code]);
  return src ? <img className="qr" src={src} alt={`QR code to join game ${code}`} /> : null;
}

const PHASE_NAME = { lobby: "Getting ready", place: "Place your chips", fight: "Fight and support", over: "Game over" } as const;
const PHASE_HINT = {
  lobby: "Scan the code, pick a role and write a Success Statement.",
  place: "Split your time on your phone. Chips equal your Energy, up to 4.",
  fight: "Spend tokens on the boss, or keep a teammate going.",
  over: "",
} as const;

/** The boss the room should look at: this term's arrival if it's alive, else the oldest one still standing. */
function heroBoss(s: LiveState): Boss | null {
  const alive = aliveBosses(s);
  return alive.find((b) => b.arrivedTerm === s.term) ?? alive[0] ?? null;
}

// ---------------------------------------------------------------------------
// The one big line: what just happened
// ---------------------------------------------------------------------------

function EventLine({ e, s }: { e: LogEntry; s: LiveState }) {
  const name = (id?: string) => s.players.find((p) => p.id === id)?.name ?? "Someone";
  const boss = s.bosses.find((b) => b.id === e.bossId);
  const tok = e.token && e.token !== "set" ? e.token : null;

  if (e.kind === "support" && e.from && e.to) {
    if (e.from === e.to)
      return (
        <>
          {name(e.from)} <TokenChip token="health" /> <span className="hl">rested: +{e.amount} Energy</span>
        </>
      );
    if (tok === "bond" && e.amount !== undefined && !e.text.includes(" gave "))
      return (
        <>
          {name(e.from)} <TokenChip token="bond" /> <span className="hl">gave {name(e.to)} +{e.amount} Energy</span>
        </>
      );
    return (
      <>
        {name(e.from)} <span className="hl">passed {name(e.to)}</span> {e.amount} {tok && <TokenChip token={tok} />} {tok && TOKEN_LABEL[tok]}
      </>
    );
  }
  if (e.kind === "fire" && e.from) {
    if (e.to)
      return (
        <>
          {name(e.from)}'s statement fired: <span className="hl">{e.amount ? `${name(e.to)} +${e.amount} Energy` : `${name(e.to)} was already full`}</span>
        </>
      );
    if (tok)
      return (
        <>
          {name(e.from)}'s statement fired: <TokenChip token={tok} /> <span className="hl">{TOKEN_LABEL[tok]} hits +{e.amount} harder</span>
        </>
      );
  }
  if (e.kind === "attack" && e.from && boss) {
    const beaten = e.text.includes("is beaten");
    return (
      <>
        {name(e.from)} {e.token === "set" ? "spent a full set on" : "hit"} {boss.name}{" "}
        {e.token === "set" ? TOKENS.map((t) => <TokenChip key={t} token={t} />) : tok && <TokenChip token={tok} />}
        <span className="dmg">−{e.amount}</span>
        {beaten && <span className="hl">Beaten!</span>}
      </>
    );
  }
  return <span className="hl">{e.text}</span>;
}

// ---------------------------------------------------------------------------
// Board effects: arrows between notes, damage numbers, stamps
// ---------------------------------------------------------------------------

function useBoardEffects(s: LiveState | null, boardRef: RefObject<HTMLDivElement | null>, fxRef: RefObject<HTMLDivElement | null>, arrowsRef: RefObject<SVGSVGElement | null>) {
  const lastSeq = useRef<number | null>(null);
  const queue = useRef<LogEntry[]>([]);
  const busy = useRef(false);
  const [banner, setBanner] = useState<LogEntry | null>(null);
  const stateRef = useRef(s);
  stateRef.current = s;

  function arrow(fromId: string, toId: string, label: string) {
    const board = boardRef.current, svg = arrowsRef.current;
    const a = board?.querySelector(`[data-pid="${fromId}"]`)?.getBoundingClientRect();
    const b = board?.querySelector(`[data-pid="${toId}"]`)?.getBoundingClientRect();
    if (!board || !svg || !a || !b) return;
    const br = board.getBoundingClientRect();
    const w = br.width, h = br.height;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const x1 = a.left - br.left + a.width / 2, y1 = a.top - br.top + 4;
    const x2 = b.left - br.left + b.width / 2, y2 = b.top - br.top + 4;
    const lift = Math.min(w * 0.05, Math.max(w * 0.035, Math.abs(x2 - x1) * 0.1));
    const cy = Math.min(y1, y2) - lift;
    const sw = w * 0.012;
    const d = `M${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2 - sw}`;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.innerHTML = `
      <path d="${d}" fill="none" stroke="#ffd84a" stroke-width="${sw * 2.2}" stroke-linecap="round" opacity=".85"/>
      <path d="${d}" fill="none" stroke="#16213f" stroke-width="${sw * 0.45}" stroke-linecap="round"/>
      <path d="M${x2 - sw * 1.4} ${y2 - sw * 2.6} L${x2} ${y2 - sw * 0.6} L${x2 + sw * 1.4} ${y2 - sw * 2.6}" fill="none" stroke="#16213f" stroke-width="${sw * 0.45}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String((x1 + x2) / 2));
    text.setAttribute("y", String(cy + lift * 0.25));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "arrow-label");
    text.setAttribute("font-size", String(w * 0.026));
    text.setAttribute("stroke-width", String(w * 0.006));
    text.textContent = label;
    g.appendChild(text);
    svg.appendChild(g);
    g.querySelectorAll("path").forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      p.getBoundingClientRect();
      p.style.transition = "stroke-dashoffset .7s ease-out";
      p.style.strokeDashoffset = "0";
    });
    setTimeout(() => {
      g.style.transition = "opacity .5s";
      g.style.opacity = "0";
    }, 2200);
    setTimeout(() => g.remove(), 2800);
  }

  function fx(className: string, text: string, at?: Element | null) {
    const board = boardRef.current, layer = fxRef.current;
    if (!board || !layer) return;
    const el = document.createElement("div");
    el.className = className;
    el.textContent = text;
    if (at) {
      const br = board.getBoundingClientRect(), r = at.getBoundingClientRect();
      el.style.left = `${r.right - br.left + 8}px`;
      el.style.top = `${r.top - br.top - r.height}px`;
    }
    layer.appendChild(el);
    setTimeout(() => el.remove(), className === "stamp-fx" ? 1400 : 1300);
  }

  function play(e: LogEntry) {
    setBanner(e);
    const board = boardRef.current;
    if ((e.kind === "support" || e.kind === "fire") && e.from && e.to && e.from !== e.to) {
      const name = stateRef.current?.players.find((p) => p.id === e.to)?.name ?? "";
      arrow(e.from, e.to, e.kind === "fire" ? "statement" : e.token === "bond" && !e.text.includes(" gave ") ? `+${e.amount} Energy` : `passed ${name}`);
    }
    if (e.kind === "attack" && board) {
      const stage = board.querySelector<HTMLElement>(`[data-boss="${e.bossId}"]`);
      if (stage) {
        stage.classList.remove("shake");
        void stage.offsetWidth;
        stage.classList.add("shake");
        fx("float", `−${e.amount}`, stage.querySelector(".hp-num"));
      }
      if (e.text.includes("is beaten")) fx("stamp-fx", "Beaten");
    }
  }

  function pump() {
    if (busy.current) return;
    const next = queue.current.shift();
    if (!next) return;
    busy.current = true;
    play(next);
    setTimeout(() => {
      busy.current = false;
      pump();
    }, 900);
  }

  const last = s?.log[s.log.length - 1]?.seq ?? 0;
  useEffect(() => {
    if (!s) return;
    if (lastSeq.current === null || last < lastSeq.current) {
      // First load or a restart: show where things stand, don't replay history.
      lastSeq.current = last;
      setBanner([...s.log].reverse().find((e) => e.kind !== "info" && e.term === s.term) ?? null);
      return;
    }
    const fresh = s.log.filter((e) => e.seq > lastSeq.current! && e.kind !== "info");
    lastSeq.current = last;
    // A busy term can log many hits at once. Keep the board current: replay
    // every support moment, but only the latest few of everything else.
    const keep = [...queue.current, ...fresh];
    const supportive = keep.filter((e) => e.kind === "support" || e.kind === "fire");
    const rest = keep.filter((e) => e.kind !== "support" && e.kind !== "fire").slice(-2);
    queue.current = keep.filter((e) => supportive.includes(e) || rest.includes(e)).slice(-4);
    pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  // Forget the last event when a new phase starts with nothing to say yet.
  const phaseKey = s ? `${s.phase}-${s.term}` : "";
  useEffect(() => {
    if (s && !s.log.some((e) => e.term === s.term && e.kind !== "info")) setBanner(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey]);

  return banner;
}

// ---------------------------------------------------------------------------
// Team: one sticky note per player
// ---------------------------------------------------------------------------

function shortStatement(p: Player) {
  if (!p.statement) return null;
  const st = p.statement;
  const target = st.target.kind === "role" ? ROLE_INFO[st.target.role].name.replace(/^The /, "the ") : TOKEN_LABEL[st.target.token];
  return (
    <div className="stmt">
      Success is when I <mark>{ACTION_PHRASE[st.action]}</mark>, so <mark>{target}</mark> gets stronger.
    </div>
  );
}

function status(p: Player, s: LiveState): string {
  if (!p.connected) return "Offline";
  if (s.phase === "lobby") return p.role && p.statement ? "Ready" : "Choosing…";
  if (p.sittingOut) return "Sitting out";
  if (s.phase === "place") return p.placement ? "Placed" : `Placing ${chipsFor(p)} chips…`;
  if (s.phase === "fight") return p.done ? "Done" : "Acting…";
  return "";
}

function Team({ s }: { s: LiveState }) {
  const prev = useRef<Record<string, number>>({});
  const fresh: Record<string, number> = {};
  for (const p of s.players) fresh[p.id] = Math.max(0, p.energy - (prev.current[p.id] ?? p.energy));
  useEffect(() => {
    prev.current = Object.fromEntries(s.players.map((p) => [p.id, p.energy]));
  });

  if (s.players.length === 0) return <p className="team-empty">Nobody yet. Scan the code to join.</p>;
  const playing = s.phase === "place" || s.phase === "fight";
  return (
    <div className="team" style={{ gridTemplateColumns: `repeat(${Math.max(3, s.players.length)}, minmax(0, 1fr))` }}>
      {s.players.map((p) => {
        const st = status(p, s);
        const ok = st === "Ready" || st === "Placed" || st === "Done";
        return (
          <div key={p.id} data-pid={p.id} className={`note${p.sittingOut ? " out" : ""}`}>
            {playing && p.sittingOut && <span className="need">Burned out. Bond brings them back</span>}
            {playing && !p.sittingOut && p.energy <= 1 && (
              <span className="need">
                <TokenChip token="bond" />
                Could use support
              </span>
            )}
            <div className="who">
              <b>{p.name}</b>
              <span>{p.role ? ROLE_INFO[p.role].name.replace(/^The /, "") : "No role yet"}</span>
            </div>
            {s.phase !== "lobby" && (
              <div className="energy">
                <Battery value={p.energy} fresh={fresh[p.id]} />
                <em>{p.energy}/5</em>
              </div>
            )}
            {shortStatement(p)}
            {st && <span className={`state${ok ? " ok" : ""}`}>{ok ? `✓ ${st}` : st}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stage({ s, canStartError, onStart }: { s: LiveState; canStartError: string | null; onStart: () => void }) {
  if (s.phase === "lobby") {
    return (
      <div className="stage lobby">
        <div className="qr-sheet">
          <QR code={s.code} />
        </div>
        <div className="stack" style={{ gap: "calc(var(--u) * 1.4)" }}>
          <h1 className="boss-name">Join the game</h1>
          <p className="lead">
            Scan the code, or go to <b>{window.location.host}/join</b> and type <b>{s.code}</b>.
          </p>
          <ol className="steps">
            <li>Pick a role.</li>
            <li>Write a Success Statement that helps a teammate.</li>
            <li>Beat four bosses together. Grades alone won't do it.</li>
          </ol>
          <div className="start-row">
            <button className="btn primary big-btn" disabled={!!canStartError} onClick={onStart}>
              Start the game
            </button>
            {canStartError && <span className="lead small-lead">{canStartError}</span>}
          </div>
        </div>
      </div>
    );
  }

  if (s.phase === "over") {
    const summary = teamSummary(s);
    return (
      <div className="stage over">
        <div className="stack" style={{ gap: "calc(var(--u) * 1.2)" }}>
          <p className={`outcome ${s.outcome}`}>{s.outcome === "win" ? "The team wins together." : "The team loses together."}</p>
          <div className="stats">
            <span>
              <b>{summary.bossesBeaten}</b> of {summary.bossesTotal} bosses beaten
            </span>
            <span>
              <b>{summary.statementFires}</b> statements fired
            </span>
            <span>
              <b>{summary.energyGivenToOthers}</b> Energy given to teammates
            </span>
            <span>
              <b>{summary.termsSatOut}</b> terms lost to burnout
            </span>
          </div>
        </div>
        <div className="debrief">
          <h2>Talk it through</h2>
          <ol>
            {DEBRIEF.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  const hero = heroBoss(s);
  const others = aliveBosses(s).filter((b) => b !== hero);
  if (!hero) {
    return (
      <div className="stage">
        <div />
        <p className="clear-msg">Every boss so far is beaten. Keep everyone's Energy up for what comes next.</p>
      </div>
    );
  }
  return (
    <div className={`stage${others.length ? " with-others" : ""}`}>
      <div className="doodle">
        <BossDoodle id={hero.id} />
      </div>
      <div className="boss-info" data-boss={hero.id}>
        <h1 className="boss-name">{hero.name}</h1>
        <div className="boss-quote">{hero.blurb}</div>
        <HpBoxes boss={hero} />
        <Weakness boss={hero} />
      </div>
      {others.length > 0 && (
        <div className="others">
          <span className="others-label">Still standing</span>
          {others.map((b) => (
            <div key={b.id} className="other" data-boss={b.id}>
              <b>{b.name}</b>
              <span className="hp-num">
                {b.hp}
                <small> / {b.maxHp}</small>
              </span>
              {b.weakness && <TokenChip token={b.weakness} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Board({ game }: { game: Game }) {
  const s = game.state;
  const [confirmSkip, setConfirmSkip] = useState(false);
  const startError = useMemo(() => (s && s.phase === "lobby" ? canStart(s) : null), [s]);
  const boardRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const arrowsRef = useRef<SVGSVGElement>(null);
  const banner = useBoardEffects(s, boardRef, fxRef, arrowsRef);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Re-run the highlighter swipe each time the line changes.
  useLayoutEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    el.classList.remove("go");
    void el.offsetWidth;
    el.classList.add("go");
  }, [banner?.seq]);

  useEffect(() => setConfirmSkip(false), [s?.phase, s?.term]);

  if (!s) {
    return (
      <main className="page margined">
        <p className="hand">Setting up the board…</p>
      </main>
    );
  }

  const beaten = s.bosses.filter((b) => b.hp <= 0);
  const playing = s.phase === "place" || s.phase === "fight";

  return (
    <main className="board-screen">
      <DoodleDefs />
      <ConnectionBanner status={game.status} />
      <div className="board" ref={boardRef}>
        <div className="bin">
          <div className="top">
            <div className="tape">
              <small>Join with code</small>
              <b>{s.code}</b>
            </div>
            <div className="where">
              {s.phase !== "lobby" && (
                <div className="terms" aria-label={`Term ${s.term} of ${GAME_CONFIG.terms}`}>
                  {Array.from({ length: GAME_CONFIG.terms }, (_, i) => i + 1).map((t) => (
                    <span key={t} className={`term${t < s.term || s.phase === "over" ? " past" : t === s.term ? " now" : ""}`}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="phase-name">{PHASE_NAME[s.phase]}</div>
            </div>
            <div className="stickers">
              {beaten.map((b) => (
                <span key={b.id} className="sticker">
                  <BossDoodle id={b.id} />
                  <span>{b.name}</span>
                  <em>Beaten</em>
                </span>
              ))}
            </div>
          </div>

          <div className={`middle${playing ? " with-banner" : ""}`}>
            {playing && (
              <div className="banner-line" ref={bannerRef} aria-live="polite">
                {banner ? <EventLine e={banner} s={s} /> : <span className="hint">{PHASE_HINT[s.phase]}</span>}
              </div>
            )}
            <Stage s={s} canStartError={startError} onStart={() => game.send("start", {})} />
          </div>

          <Team s={s} />
        </div>
        <div className="fx" ref={fxRef} />
        <svg className="arrows" ref={arrowsRef} aria-hidden="true" />
      </div>

      <div className="host-ctl">
        {playing &&
          (confirmSkip ? (
            <>
              <span>Move on without waiting? Anyone who hasn't finished does nothing this step.</span>
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
            </>
          ) : (
            <button className="btn" onClick={() => setConfirmSkip(true)}>
              Skip waiting
            </button>
          ))}
        {s.phase === "over" && (
          <button className="btn primary" onClick={() => game.send("restart", {})}>
            Play again
          </button>
        )}
        <button className="btn ghost" onClick={() => void game.leave()}>
          Close board
        </button>
      </div>
      <Toast text={game.error} />
    </main>
  );
}
