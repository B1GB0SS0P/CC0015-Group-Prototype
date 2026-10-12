import { useEffect, useMemo, useState } from "react";
import {
  ACTION_PHRASE,
  ACTIVITIES,
  ACTIVITY_LABEL,
  ACTIVITY_TOKEN,
  GAME_CONFIG,
  ROLES,
  ROLE_INFO,
  TOKENS,
  TOKEN_LABEL,
  aliveBosses,
  chipsFor,
  doubledActivity,
  tokenDamage,
  validateStatement,
  type Activity,
  type Counts,
  type Player,
  type RoleId,
  type Statement,
  type Token,
} from "@nsc/shared";
import type { Game, LiveState } from "./net";
import { BossCard, ConnectionBanner, Pips, StatementText, Tok, Toast } from "./ui";

type Send = Game["send"];

// ---------------------------------------------------------------------------
// Statement builder (lobby and the one rewrite)
// ---------------------------------------------------------------------------

type TargetKey = `role:${RoleId}` | `token:${Token}`;

function targetKey(s: Statement | null): TargetKey | "" {
  if (!s) return "";
  return s.target.kind === "role" ? `role:${s.target.role}` : `token:${s.target.token}`;
}

function StatementBuilder({
  me,
  state,
  onSave,
  saveLabel,
}: {
  me: Player;
  state: LiveState;
  onSave: (s: Statement) => void;
  saveLabel: string;
}) {
  const [action, setAction] = useState<Activity | "">(me.statement?.action ?? "");
  const [target, setTarget] = useState<TargetKey | "">(targetKey(me.statement));
  const taken = new Set(state.players.map((p) => p.role));

  const draft: Statement | null = useMemo(() => {
    if (!action || !target) return null;
    const [kind, value] = target.split(":") as ["role" | "token", string];
    return kind === "role" ? { action, target: { kind, role: value as RoleId } } : { action, target: { kind, token: value as Token } };
  }, [action, target]);

  const problem = draft ? validateStatement(draft, me.role) : null;
  const unchanged = draft && me.statement && targetKey(draft) === targetKey(me.statement) && draft.action === me.statement.action;

  return (
    <div className="builder">
      <p className="statement">Success for me is when I…</p>
      <select className="input" value={action} onChange={(e) => setAction(e.target.value as Activity)} aria-label="Action">
        <option value="">choose an action</option>
        {ACTIVITIES.map((a) => (
          <option key={a} value={a}>
            {ACTION_PHRASE[a]}
          </option>
        ))}
      </select>
      <p className="statement">…so that this gets stronger:</p>
      <select className="input" value={target} onChange={(e) => setTarget(e.target.value as TargetKey)} aria-label="Target">
        <option value="">choose a teammate's role or a token type</option>
        <optgroup label="A teammate's role (restores 2 Energy)">
          {ROLES.filter((r) => r !== me.role).map((r) => (
            <option key={r} value={`role:${r}`}>
              {ROLE_INFO[r].name}
              {state.phase === "lobby" && !taken.has(r) ? " (nobody yet)" : ""}
            </option>
          ))}
        </optgroup>
        <optgroup label="A token type (+1 damage for the whole team)">
          {TOKENS.map((t) => (
            <option key={t} value={`token:${t}`}>
              {TOKEN_LABEL[t]}
            </option>
          ))}
        </optgroup>
      </select>
      <p className="small muted">
        It fires in any term you put {GAME_CONFIG.statementThreshold}+ chips on its action. It can never target yourself.
      </p>
      {draft && !problem && !unchanged && (
        <div className="sheet flat">
          <StatementText s={draft} />
        </div>
      )}
      {problem && <p className="small" style={{ color: "var(--red)" }}>{problem}</p>}
      <button className="btn primary" disabled={!draft || !!problem || !!unchanged} onClick={() => draft && onSave(draft)}>
        {saveLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

function Lobby({ me, state, send }: { me: Player; state: LiveState; send: Send }) {
  const owner = (r: RoleId) => state.players.find((p) => p.role === r);
  return (
    <div className="stack">
      <section className="stack" style={{ gap: 10 }}>
        <h2>1. Pick a role</h2>
        <p className="muted small">Each role doubles one activity. Only one person per role.</p>
        <div className="roles">
          {ROLES.map((r) => {
            const o = owner(r);
            const mine = o?.id === me.id;
            const info = ROLE_INFO[r];
            return (
              <button
                key={r}
                className={`role${mine ? " mine" : ""}`}
                disabled={!!o && !mine}
                onClick={() => send("chooseRole", { role: mine ? null : r })}
                aria-pressed={mine}
              >
                <span className="name">{info.name}</span>
                <span className="small muted">
                  {info.moba}. Doubles {info.doubles ? ACTIVITY_LABEL[info.doubles] : "any one activity each term"}.
                </span>
                <span className="small">{o && !mine ? `Taken by ${o.name}` : info.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sheet stack" style={{ gap: 10 }}>
        <h2>2. Write your Success Statement</h2>
        {!me.role ? (
          <p className="muted">Pick a role first.</p>
        ) : (
          <>
            {me.statement && (
              <div className="banner small">
                Saved: <StatementText s={me.statement} />
              </div>
            )}
            <StatementBuilder me={me} state={state} onSave={(st) => send("setStatement", { statement: st })} saveLabel={me.statement ? "Update statement" : "Save statement"} />
          </>
        )}
      </section>

      <p className="hand muted" style={{ fontSize: "1.15rem" }}>
        {me.role && me.statement ? "You're ready. The board starts the game when everyone is." : "Waiting on you."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: place chips
// ---------------------------------------------------------------------------

function Place({ me, state, send }: { me: Player; state: LiveState; send: Send }) {
  const chips = chipsFor(me);
  const empty = (): Counts<Activity> => ({ study: 0, rest: 0, friends: 0, interest: 0 });
  const [placement, setPlacement] = useState<Counts<Activity>>(empty);
  const [explorerDouble, setExplorerDouble] = useState<Activity | "">("");
  const [rewriting, setRewriting] = useState(false);

  useEffect(() => {
    setPlacement(empty());
    setExplorerDouble("");
  }, [state.term]);

  if (me.sittingOut) {
    return (
      <div className="sheet stack">
        <h2>You're burned out this term</h2>
        <p>Your Energy hit 0, so you have no chips. Teammates can bring you back with Bond tokens during the fight.</p>
      </div>
    );
  }

  if (me.placement) {
    return (
      <div className="sheet stack">
        <h2>Locked in</h2>
        <div className="inv">
          {ACTIVITIES.filter((a) => me.placement![a] > 0).map((a) => (
            <span key={a} className="badge outline">
              {me.placement![a]} on {ACTIVITY_LABEL[a]}
            </span>
          ))}
        </div>
        <p className="muted">Waiting for the rest of the team.</p>
      </div>
    );
  }

  const used = ACTIVITIES.reduce((n, a) => n + placement[a], 0);
  const left = chips - used;
  const dbl = me.role === "explorer" ? explorerDouble || null : doubledActivity(me);
  const explorerNeedsPick = me.role === "explorer" && !explorerDouble;
  const fires = !!me.statement && placement[me.statement.action] >= GAME_CONFIG.statementThreshold;
  const boss = state.bosses.find((b) => b.arrivedTerm === state.term);

  return (
    <div className="stack">
      <div className="sheet stack" style={{ gap: 6 }}>
        <div className="spread">
          <h2>Place {chips} chip{chips === 1 ? "" : "s"}</h2>
          <span className="hand" style={{ fontSize: "1.6rem" }}>{left} left</span>
        </div>
        {chips < GAME_CONFIG.chipsPerTerm && <p className="small muted">You get one chip per point of Energy. Rest and teammates' Bond tokens bring it back up.</p>}
        {boss && (
          <p className="small">
            {boss.name} is here.{" "}
            {boss.special === "sets" ? "It only takes full sets: one of each token." : boss.weakness ? <>Its weakness is <Tok token={boss.weakness} />.</> : null}
          </p>
        )}
      </div>

      {me.role === "explorer" && (
        <div className="field">
          <label htmlFor="dbl">Explorer: double which activity this term?</label>
          <select id="dbl" className="input" value={explorerDouble} onChange={(e) => setExplorerDouble(e.target.value as Activity)}>
            <option value="">choose one</option>
            {ACTIVITIES.map((a) => (
              <option key={a} value={a} disabled={a === me.lastExplorerDouble}>
                {ACTIVITY_LABEL[a]}
                {a === me.lastExplorerDouble ? " (used last term)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="sheet" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {ACTIVITIES.map((a) => {
          const per = a === dbl ? 2 : 1;
          return (
            <div key={a} className="stepper">
              <div>
                <strong>{ACTIVITY_LABEL[a]}</strong>{" "}
                {a === dbl && <span className="badge">doubled</span>}
                <div className="small muted">
                  Each chip: {per} <span style={{ color: `var(--${ACTIVITY_TOKEN[a]})`, fontWeight: 700 }}>{TOKEN_LABEL[ACTIVITY_TOKEN[a]]}</span>
                  {a === "study" ? ", costs 1 Energy" : ""}
                </div>
              </div>
              <button className="round" aria-label={`Remove a chip from ${ACTIVITY_LABEL[a]}`} disabled={placement[a] === 0} onClick={() => setPlacement({ ...placement, [a]: placement[a] - 1 })}>
                −
              </button>
              <span className="count" aria-live="polite">{placement[a]}</span>
              <button className="round" aria-label={`Add a chip to ${ACTIVITY_LABEL[a]}`} disabled={left === 0} onClick={() => setPlacement({ ...placement, [a]: placement[a] + 1 })}>
                +
              </button>
            </div>
          );
        })}
      </div>

      {me.statement && (
        <div className={`sheet flat stack`} style={{ gap: 6 }}>
          <p className="small">
            {fires ? (
              <span className="badge">Your statement fires this term</span>
            ) : (
              <span className="badge outline">
                Put {GAME_CONFIG.statementThreshold} chips on {ACTIVITY_LABEL[me.statement.action]} to fire your statement
              </span>
            )}
          </p>
          <StatementText s={me.statement} />
          {me.rewritesLeft > 0 && !rewriting && (
            <button className="btn ghost" style={{ alignSelf: "flex-start" }} onClick={() => setRewriting(true)}>
              Rewrite it (once per game)
            </button>
          )}
          {rewriting && (
            <StatementBuilder
              me={me}
              state={state}
              saveLabel="Use my one rewrite"
              onSave={(st) => {
                send("setStatement", { statement: st });
                setRewriting(false);
              }}
            />
          )}
        </div>
      )}

      <div className="sticky-foot">
        <div className="narrow">
          <button
            className="btn primary block"
            disabled={left !== 0 || explorerNeedsPick}
            onClick={() => send("place", { placement, explorerDouble: me.role === "explorer" ? (explorerDouble as Activity) : null })}
          >
            {explorerNeedsPick ? "Choose what to double first" : left !== 0 ? `Place ${left} more` : "Lock in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: fight and support
// ---------------------------------------------------------------------------

function Fight({ me, state, send }: { me: Player; state: LiveState; send: Send }) {
  const bosses = aliveBosses(state);
  const mates = state.players.filter((p) => p.id !== me.id);
  const [giveTo, setGiveTo] = useState(mates[0]?.id ?? "");
  const [giveTok, setGiveTok] = useState<Token>("grade");
  const hasAny = TOKENS.some((t) => me.tokens[t] > 0);
  const bonuses = TOKENS.filter((t) => state.tokenBonus[t] > 0);

  return (
    <div className="stack">
      <div className="sheet stack" style={{ gap: 8 }}>
        <h2>Your tokens</h2>
        {hasAny ? (
          <div className="inv">
            {TOKENS.map((t) => (me.tokens[t] > 0 ? <Tok key={t} token={t} count={me.tokens[t]} /> : null))}
          </div>
        ) : (
          <p className="muted">No tokens left. Unspent tokens are lost at the end of the term.</p>
        )}
        {bonuses.length > 0 && (
          <p className="small">
            From statements this term:{" "}
            {bonuses.map((t) => (
              <span key={t} style={{ marginRight: 8 }}>
                <Tok token={t} /> +{state.tokenBonus[t]} damage
              </span>
            ))}
          </p>
        )}
      </div>

      {bosses.map((b) => {
        const sets = Math.min(...TOKENS.map((t) => me.tokens[t]));
        const missing = TOKENS.filter((t) => me.tokens[t] === 0);
        return (
          <section key={b.id}>
            <BossCard boss={b} current={b.arrivedTerm === state.term} />
            {b.special === "sets" ? (
              <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                <button className="btn primary block" disabled={sets === 0} onClick={() => send("attackSet", { bossId: b.id, count: 1 })}>
                  Spend a full set ({GAME_CONFIG.setDamage} damage)
                </button>
                {missing.length > 0 && (
                  <p className="small muted">
                    You're missing {missing.map((t) => TOKEN_LABEL[t]).join(", ")}. Ask a teammate to pass you one, or pass yours to whoever is closest to a set.
                  </p>
                )}
              </div>
            ) : (
              <div className="actions">
                {TOKENS.map((t) => (
                  <button key={t} className={`act ${t}`} disabled={me.tokens[t] === 0} onClick={() => send("attack", { bossId: b.id, token: t, count: 1 })}>
                    Hit with 1 {TOKEN_LABEL[t]}
                    <span>{tokenDamage(state, b, t)} damage</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <section className="sheet stack" style={{ gap: 10 }}>
        <h2>Support</h2>
        <button className="act health" disabled={me.tokens.health === 0 || me.energy >= GAME_CONFIG.maxEnergy} onClick={() => send("heal", { count: 1 })}>
          Rest: use 1 Health
          <span>+{GAME_CONFIG.healthRestore} Energy for you</span>
        </button>
        {mates.map((m) => (
          <div key={m.id} className="spread" style={{ borderTop: "1.5px dashed var(--rule)", paddingTop: 10 }}>
            <div>
              <strong>{m.name}</strong> <Pips value={m.energy} />
              {m.sittingOut && <span className="badge red" style={{ marginLeft: 6 }}>Burned out</span>}
            </div>
            <button
              className="act bond"
              style={{ minHeight: 0 }}
              disabled={me.tokens.bond === 0 || m.energy >= GAME_CONFIG.maxEnergy}
              onClick={() => send("bond", { targetId: m.id, count: 1 })}
            >
              Give 1 Bond
              <span>+{GAME_CONFIG.bondRestore} Energy</span>
            </button>
          </div>
        ))}
        <details>
          <summary>Pass a token to a teammate</summary>
          <div className="row" style={{ marginTop: 10 }}>
            <select className="input" style={{ flex: 1 }} value={giveTo} onChange={(e) => setGiveTo(e.target.value)} aria-label="Teammate">
              {mates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select className="input" style={{ flex: 1 }} value={giveTok} onChange={(e) => setGiveTok(e.target.value as Token)} aria-label="Token">
              {TOKENS.map((t) => (
                <option key={t} value={t}>
                  {TOKEN_LABEL[t]} ({me.tokens[t]})
                </option>
              ))}
            </select>
            <button className="btn" disabled={!giveTo || me.tokens[giveTok] === 0} onClick={() => send("give", { targetId: giveTo, token: giveTok, count: 1 })}>
              Pass 1
            </button>
          </div>
        </details>
      </section>

      <div className="sticky-foot">
        <div className="narrow">
          {me.sittingOut ? (
            <p className="muted" style={{ margin: "auto" }}>You're sitting out. You can still use tokens teammates pass you.</p>
          ) : me.done ? (
            <button className="btn block" onClick={() => send("done", { done: false })}>
              Waiting for the team… (tap to undo)
            </button>
          ) : (
            <button className="btn primary block" onClick={() => send("done", { done: true })}>
              I'm done this term
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------

function Over({ me, state, leave }: { me: Player; state: LiveState; leave: () => void }) {
  return (
    <div className="stack">
      <p className={`outcome ${state.outcome}`}>{state.outcome === "win" ? "Your team won." : "Your team lost."}</p>
      <p className="muted">Either way, the board has questions for your group.</p>
      <div className="sheet stack">
        <h3>Your statement in this game</h3>
        <StatementText s={me.statement} />
      </div>
      <div className="sheet stack">
        <h3>Now write a real one</h3>
        <p className="statement">
          This year, success for me is when I ____________, so that ____________ gets stronger.
        </p>
        <p className="small muted">Write it on the card your teacher gives you. It isn't saved in this app.</p>
      </div>
      <button className="btn ghost" onClick={leave}>
        Leave the game
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Phone({ game }: { game: Game }) {
  const s = game.state;
  const me = s?.players.find((p) => p.id === game.me?.playerId);

  if (!s || !me) {
    return (
      <main className="page">
        <div className="narrow stack">
          <ConnectionBanner status={game.status} />
          <p className="hand">Joining…</p>
        </div>
      </main>
    );
  }

  const phaseLabel = s.phase === "lobby" ? "Lobby" : s.phase === "over" ? "Game over" : `Term ${s.term} of ${GAME_CONFIG.terms}: ${s.phase === "place" ? "place chips" : "fight and support"}`;

  return (
    <main className="page">
      <div className="narrow">
        <header className="phone-head">
          <div className="spread">
            <div>
              <div className="hand" style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1 }}>
                {me.name}
              </div>
              <div className="small muted">{me.role ? `${ROLE_INFO[me.role].name} (${ROLE_INFO[me.role].moba})` : "No role yet"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {s.phase !== "lobby" && <Pips value={me.energy} />}
              <div className="small muted">{phaseLabel}</div>
            </div>
          </div>
          <ConnectionBanner status={game.status} />
        </header>

        {s.phase === "lobby" && <Lobby me={me} state={s} send={game.send} />}
        {s.phase === "place" && <Place me={me} state={s} send={game.send} />}
        {s.phase === "fight" && <Fight me={me} state={s} send={game.send} />}
        {s.phase === "over" && <Over me={me} state={s} leave={() => void game.leave()} />}
      </div>
      <Toast text={game.error} />
    </main>
  );
}
