import type { ReactNode } from "react";
import { ACTIVITIES, ACTIVITY_LABEL, ACTIVITY_TOKEN, GAME_CONFIG, ROLES, ROLE_INFO, TOKENS, TOKEN_LABEL } from "@nsc/shared";
import { Battery, BossDoodle, DoodleDefs, StatementText, Tok, TokenChip } from "./ui";

const C = GAME_CONFIG;

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "A boss arrives",
    body: <>Each term brings a new boss. Bosses you didn't beat stay in the fight.</>,
  },
  {
    title: "Split your time",
    body: (
      <>
        You get one Time chip per point of Energy, up to {C.chipsPerTerm}. Put them on activities. Each chip makes one token, or two on the activity your role
        doubles. Study is the only activity that costs Energy ({C.studyEnergyCost} per chip).
      </>
    ),
  },
  {
    title: "Statements fire",
    body: <>If you put {C.statementThreshold} or more chips on your statement's action, it fires for the team.</>,
  },
  {
    title: "Fight and support",
    body: (
      <>
        Spend tokens on a boss, or on keeping people going: a <Tok token="bond" /> gives a teammate +{C.bondRestore} Energy, and a <Tok token="health" /> gives
        you +{C.healthRestore}. You can also pass tokens to a teammate.
      </>
    ),
  },
  {
    title: "End of term",
    body: <>Everyone loses {C.drainPerTerm} Energy, and unspent tokens are lost. Use them or give them away.</>,
  },
];

export function HowToPlay() {
  return (
    <main className="page margined how">
      <DoodleDefs />
      <div className="how-wrap stack" style={{ gap: 36 }}>
        <header className="stack" style={{ gap: 10 }}>
          <a className="back" href="/">
            ← Back to the start
          </a>
          <h1>How to play</h1>
          <p className="lead-text">
            No Solo Carry is a co-op game for {C.minPlayers} to {C.maxPlayers} players, about what success really means. Everyone plays on their own phone, and one
            shared board screen shows the bosses and the team. You win or lose together. Grades alone won't do it.
          </p>
        </header>

        <section className="stack" style={{ gap: 14 }}>
          <h2>The goal</h2>
          <p>Beat four bosses in {C.terms} terms. There are no individual scores.</p>
          <div className="how-bosses">
            {C.bosses.map((b) => (
              <div key={b.id} className="how-boss">
                <BossDoodle id={b.id} />
                <b>{b.name}</b>
                <span>{b.blurb}</span>
                {b.weakness ? (
                  <span className="weak-line">
                    Weak spot: <TokenChip token={b.weakness} /> {TOKEN_LABEL[b.weakness]}
                  </span>
                ) : (
                  <span className="weak-line">Only full sets</span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="stack" style={{ gap: 14 }}>
          <h2>Before you start</h2>
          <div className="how-card stack" style={{ gap: 12 }}>
            <h3>1. Pick a role</h3>
            <p>Each role doubles one activity. Only one person per role.</p>
            <ul className="how-roles">
              {ROLES.map((r) => {
                const info = ROLE_INFO[r];
                return (
                  <li key={r}>
                    <b>{info.name}</b>
                    <span>{info.doubles ? `doubles ${ACTIVITY_LABEL[info.doubles]}` : "doubles a different activity each term"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="how-card stack" style={{ gap: 12 }}>
            <h3>2. Write your Success Statement</h3>
            <p>You build it from two choices. For example:</p>
            <p className="how-example">
              <StatementText s={{ action: "friends", target: { kind: "role", role: "grinder" } }} />
            </p>
            <p>
              The target is either a teammate's role (they get +{C.roleTargetRestore} Energy when it fires) or a token type (that token hits +{C.tokenTargetBonus} harder for
              everyone that term). It can never be yourself. You can rewrite it once per game.
            </p>
          </div>
        </section>

        <section className="stack" style={{ gap: 14 }}>
          <h2>Each term</h2>
          <ol className="how-steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <b>{s.title}</b>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="how-card stack" style={{ gap: 10 }}>
            <h3>What each activity makes</h3>
            <div className="how-map">
              {ACTIVITIES.map((a) => (
                <div key={a}>
                  <span>{ACTIVITY_LABEL[a]}</span>
                  <span aria-hidden="true">→</span>
                  <Tok token={ACTIVITY_TOKEN[a]} />
                </div>
              ))}
            </div>
            <p className="muted small">A token hitting a boss's weak spot does double damage.</p>
          </div>
        </section>

        <section className="stack" style={{ gap: 14 }}>
          <h2>Energy</h2>
          <div className="how-card how-energy">
            <Battery value={1} />
            <p>
              Energy is your battery. It sets how many chips you get, so a tired player gets less done. At 0 you burn out and sit out the next term. Teammates can bring
              you back with Bond. On the board, a tired player's note says <b>Could use support</b>.
            </p>
          </div>
        </section>

        <section className="stack" style={{ gap: 14 }}>
          <h2>Results Day</h2>
          <div className="how-card how-energy">
            <div className="setrow">
              {TOKENS.map((t) => (
                <TokenChip key={t} token={t} />
              ))}
            </div>
            <p>
              The last boss ignores single tokens. It only takes full sets: one Grade, one Health, one Bond and one Interest together, for {C.setDamage} damage. Pass
              tokens around so someone can make a set.
            </p>
          </div>
        </section>

        <section className="stack" style={{ gap: 12 }}>
          <h2>Ready?</h2>
          <div className="row">
            <a className="btn primary" href="/">
              Join a game
            </a>
            <a className="btn" href="/">
              Host a game
            </a>
          </div>
          <p className="muted small">To host, open a board screen on the start page. Players join with the 4-letter code it shows.</p>
        </section>
      </div>
    </main>
  );
}
