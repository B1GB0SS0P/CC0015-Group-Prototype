import { ROLE_INFO, TOKEN_LABEL, ACTION_PHRASE, GAME_CONFIG, type Boss, type Statement, type Token } from "@nsc/shared";

export function Pips({ value, max = GAME_CONFIG.maxEnergy, label = "Energy" }: { value: number; max?: number; label?: string }) {
  return (
    <span className={`pips${value <= 1 ? " low" : ""}`} role="img" aria-label={`${label} ${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`pip${i < value ? " on" : ""}`} />
      ))}
    </span>
  );
}

export function Tok({ token, count }: { token: Token; count?: number }) {
  return (
    <span className={`tok ${token}`}>
      {count !== undefined ? `${count} ` : ""}
      {TOKEN_LABEL[token]}
    </span>
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

export function BossCard({ boss, current }: { boss: Boss; current: boolean }) {
  const beaten = boss.hp <= 0;
  const pct = Math.max(0, Math.round((boss.hp / boss.maxHp) * 100));
  return (
    <article className={`boss${current ? " current" : ""}${beaten ? " beaten" : ""}`} aria-label={`${boss.name}: ${boss.hp} of ${boss.maxHp} HP`}>
      <div className="score">
        {boss.hp}
        <small>/{boss.maxHp}</small>
      </div>
      {beaten && <div className="stamp">Beaten</div>}
      <h3>{boss.name}</h3>
      <p className="blurb">{boss.blurb}</p>
      <div className="hpbar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="weak">
        {boss.special === "sets" ? (
          <>
            <span>Only a full set hurts it:</span>
            <Tok token="grade" />
            <Tok token="health" />
            <Tok token="bond" />
            <Tok token="interest" />
          </>
        ) : boss.weakness ? (
          <>
            <span>Weak to</span>
            <Tok token={boss.weakness} />
            <span className="muted">(extra damage)</span>
          </>
        ) : null}
      </div>
    </article>
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
