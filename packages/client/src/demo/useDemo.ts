import { useCallback, useMemo, useRef, useState } from "react";
import {
  attack,
  attackSet,
  bond,
  give,
  heal,
  setDone,
  setStatement,
  submitPlacement,
  type ClientMessages,
  type GameState,
  type Result,
} from "@nsc/shared";
import type { Game, LiveState } from "../net";
import { ALLY, DEMO_CODE, botsReact, initialDemoState, jumpToResults } from "./script";
import type { TourAdvance } from "./tour";

export type DemoAction = Extract<TourAdvance, { on: "action" }>["action"];

/** Your phone's messages, run through the rules engine as the Ally. */
function applyAsAlly<K extends keyof ClientMessages>(s: GameState, type: K, payload: ClientMessages[K]): Result {
  const m = payload as Record<string, unknown>;
  switch (type) {
    case "setStatement":
      return setStatement(s, ALLY, m.statement as never);
    case "place":
      return submitPlacement(s, ALLY, { placement: (m.placement ?? {}) as never, explorerDouble: (m.explorerDouble ?? null) as never });
    case "attack":
      return attack(s, ALLY, m.bossId as string, m.token as never, m.count as number);
    case "attackSet":
      return attackSet(s, ALLY, m.bossId as string, m.count as number);
    case "heal":
      return heal(s, ALLY, m.count as number);
    case "bond":
      return bond(s, ALLY, m.targetId as string, m.count as number);
    case "give":
      return give(s, ALLY, m.targetId as string, m.token as never, m.count as number);
    case "done":
      return setDone(s, ALLY, Boolean(m.done));
    default:
      return { ok: false, error: "That isn't part of the demo." };
  }
}

/** Which tour action a successful message counts as. */
function tourAction(type: keyof ClientMessages, payload: unknown): DemoAction | null {
  if (type === "done") return (payload as { done?: boolean }).done ? "done" : null;
  if (type === "place" || type === "attack" || type === "bond" || type === "attackSet") return type;
  return null;
}

/**
 * Runs the demo game locally. Returns two views of it, shaped like the real
 * network hook, so the normal Board and Phone screens render it unchanged.
 */
export function useDemo(onAction: (a: DemoAction) => void) {
  const [state, setState] = useState<GameState>(initialDemoState);
  const stateRef = useRef(state);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flash = useCallback((msg: string) => {
    setError(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setError(null), 4200);
  }, []);

  const commit = useCallback((next: GameState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const sendAsAlly = useCallback(
    <K extends keyof ClientMessages>(type: K, payload: ClientMessages[K]) => {
      if (type === "ping") return;
      const r = applyAsAlly(stateRef.current, type, payload);
      if (!r.ok) return flash(r.error);
      commit(botsReact(r.state));
      const a = tourAction(type, payload);
      if (a) onAction(a);
    },
    [commit, flash, onAction],
  );

  const jump = useCallback(() => {
    commit(jumpToResults(stateRef.current));
    onAction("jump");
  }, [commit, onAction]);

  const restart = useCallback(() => {
    setError(null);
    commit(initialDemoState());
  }, [commit]);

  const live: LiveState = useMemo(() => ({ ...state, code: DEMO_CODE }), [state]);
  const noop = async () => {};

  const base = { state: live, status: "connected" as const, error, host: noop, join: noop, leave: noop, flash };
  const board: Game = { ...base, me: { playerId: null, isHost: true }, send: () => {} };
  const phone: Game = { ...base, me: { playerId: ALLY, isHost: false }, send: sendAsAlly };

  return { board, phone, jump, restart, state };
}
