import { ROLE_INFO, TOKEN_LABEL, ACTION_PHRASE, GAME_CONFIG, TOKENS, type Boss, type BossId, type Statement, type Token } from "@nsc/shared";
import type { ReactElement } from "react";

/** Each token has its own shape, so it reads without colour (and from the back row). */
const TOKEN_ICON: Record<Token, ReactElement> = {
  grade: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M3 5.5c3-1.2 6-1 9 1 3-2 6-2.2 9-1V19c-3-1-6-.8-9 1-3-1.8-6-2-9-1z" />
      <path d="M12 6.5V20" />
    </svg>
  ),
  health: (
    <svg viewBox="0 0 24 24">
      <path fill="#fff" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z" />
    </svg>
  ),
  bond: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
      <circle cx="9" cy="12" r="5" />
      <circle cx="15" cy="12" r="5" />
    </svg>
  ),
  interest: (
    <svg viewBox="0 0 24 24">
      <path fill="#fff" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6.1L12 16.6l-5.4 2.9 1.2-6.1-4.5-4.1 6.1-.7z" />
    </svg>
  ),
};

export function TokenChip({ token, ghost = false }: { token: Token; ghost?: boolean }) {
  return (
    <span className={`chip t-${token}${ghost ? " ghost" : ""}`} aria-hidden="true">
      {TOKEN_ICON[token]}
    </span>
  );
}

/** A token with its name, e.g. in a sentence or an inventory. */
export function Tok({ token, count }: { token: Token; count?: number }) {
  return (
    <span className={`tok ${token}`}>
      <TokenChip token={token} />
      {count !== undefined ? `${count} ` : ""}
      {TOKEN_LABEL[token]}
    </span>
  );
}

/** Energy as a battery. Fresh cells (just restored) flash. */
export function Battery({ value, max = GAME_CONFIG.maxEnergy, label = "Energy", fresh = 0 }: { value: number; max?: number; label?: string; fresh?: number }) {
  return (
    <span className="battery" role="img" aria-label={`${label} ${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`cell${i < value ? "" : " off"}${i < value && i >= value - fresh ? " new" : ""}`} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Boss drawings: pencil doodles in the notebook
// ---------------------------------------------------------------------------

const INK = { stroke: "var(--ink)", strokeWidth: 4, strokeLinecap: "round", strokeLinejoin: "round", fill: "none", filter: "url(#wobble)" } as const;

/** The wobble filter the doodles use. Render once per page. */
export function DoodleDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <filter id="wobble">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="5" />
      </filter>
    </svg>
  );
}

export function BossDoodle({ id }: { id: BossId }) {
  if (id === "comparison")
    return (
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <rect {...INK} x="22" y="40" width="66" height="120" rx="8" />
        <rect {...INK} x="112" y="22" width="66" height="148" rx="8" />
        <path {...INK} d="M36 70 l30 30 M126 54 l36 40" />
        <circle {...INK} cx="55" cy="128" r="9" />
        <circle {...INK} cx="145" cy="128" r="12" />
        <path {...INK} d="M14 190 H186" />
      </svg>
    );
  if (id === "burnout")
    return (
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <path {...INK} d="M66 186 V92 h68 v94" />
        <path {...INK} d="M84 92 q0 26 -8 34 M116 92 q2 16 8 22" />
        <path d="M100 78 q-22 -22 0 -56 q22 30 0 56z" fill="var(--interest)" stroke="var(--interest)" strokeWidth="3" filter="url(#wobble)" />
        <path {...INK} d="M30 190 H170" />
      </svg>
    );
  if (id === "fear")
    return (
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <path {...INK} fill="rgba(22,33,63,.10)" d="M38 176 C 16 118, 34 34, 100 26 C 166 34, 184 118, 162 176 Z" />
        <ellipse cx="78" cy="88" rx="10" ry="13" fill="var(--ink)" />
        <ellipse cx="122" cy="88" rx="10" ry="13" fill="var(--ink)" />
        <path {...INK} d="M80 122 q20 -10 40 0" />
        <circle {...INK} fill="var(--paper)" cx="100" cy="150" r="9" />
        <path {...INK} d="M100 159 v20 M100 166 l-10 8 M100 166 l10 8 M100 179 l-8 10 M100 179 l8 10" />
        <path {...INK} d="M14 190 H186" />
      </svg>
    );
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <rect {...INK} fill="#fff" x="26" y="58" width="148" height="100" rx="6" />
      <path {...INK} d="M26 62 L100 116 L174 62" />
      <circle cx="140" cy="140" r="30" fill="#fff" stroke="var(--red)" strokeWidth="5" filter="url(#wobble)" />
      <text x="140" y="155" textAnchor="middle" fontFamily="Kalam, cursive" fontWeight="700" fontSize="44" fill="var(--red)">
        ?
      </text>
      <path {...INK} d="M14 190 H186" />
    </svg>
  );
}

/** HP as boxes that get crossed out, plus the number. */
export function HpBoxes({ boss }: { boss: Boss }) {
  return (
    <div className="hp">
      <div className={`boxes${boss.maxHp > 20 ? " many" : ""}`} aria-hidden="true">
        {Array.from({ length: boss.maxHp }, (_, i) => (
          <span key={i} className={`box${i >= boss.hp ? " lost" : ""}`} />
        ))}
      </div>
      <div className="hp-num" aria-label={`${boss.hp} of ${boss.maxHp} HP left`}>
        {boss.hp}
        <small> / {boss.maxHp} HP</small>
      </div>
    </div>
  );
}

export function Weakness({ boss }: { boss: Boss }) {
  if (boss.special === "sets")
    return (
      <div className="weak">
        <span>Only full sets hurt it:</span>
        {TOKENS.map((t) => (
          <TokenChip key={t} token={t} />
        ))}
      </div>
    );
  if (!boss.weakness) return null;
  return (
    <div className="weak">
      <span>Weak spot:</span>
      <Tok token={boss.weakness} />
      <span className="muted">hits twice as hard</span>
    </div>
  );
}

/** A boss on a phone: small doodle, name, HP and weak spot. */
export function BossCard({ boss }: { boss: Boss }) {
  const beaten = boss.hp <= 0;
  return (
    <article className={`boss-card${beaten ? " beaten" : ""}`} aria-label={`${boss.name}: ${boss.hp} of ${boss.maxHp} HP`}>
      <div className="boss-card-doodle">
        <BossDoodle id={boss.id} />
      </div>
      <div className="stack" style={{ gap: 6, minWidth: 0 }}>
        <h3>{boss.name}</h3>
        <p className="blurb">{boss.blurb}</p>
        <HpBoxes boss={boss} />
        <Weakness boss={boss} />
      </div>
      {beaten && <div className="stamp">Beaten</div>}
    </article>
  );
}

/** The statement with its two choices highlighted, like marked answers. */
export function StatementText({ s }: { s: Statement | null }) {
  if (!s) return <span className="muted">No statement yet</span>;
  const target = s.target.kind === "role" ? ROLE_INFO[s.target.role].name.replace(/^The /, "the ") : TOKEN_LABEL[s.target.token];
  return (
    <span className="statement">
      Success for me is when I <mark>{ACTION_PHRASE[s.action]}</mark>, so that <mark>{target}</mark> gets stronger.
    </span>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="toast" role="alert">
      {text}
    </div>
  );
}

export function ConnectionBanner({ status }: { status: string }) {
  if (status === "reconnecting") return <div className="banner">Connection lost. Reconnecting…</div>;
  if (status === "closed") return <div className="banner">Disconnected from the game. Refresh to rejoin.</div>;
  return null;
}
