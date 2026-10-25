import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "../Board";
import { Phone } from "../Phone";
import { TOUR } from "./tour";
import { PresenterNotes, TourOverlay } from "./TourOverlay";
import { useDemo, type DemoAction } from "./useDemo";

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");

/**
 * /demo: the board and the Ally's phone side by side, three bot teammates,
 * and a guided tour on top. Runs entirely in the browser.
 */
export function Demo() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [notes, setNotes] = useState(false);
  // The furthest step reached. Steps before it were already done, so they get a Next button
  // even if they normally wait for an action (you can't redo "I'm done" after going back).
  const [furthest, setFurthest] = useState(0);
  const indexRef = useRef(index);
  indexRef.current = index;
  const furthestRef = useRef(furthest);
  furthestRef.current = furthest;
  useEffect(() => setFurthest((f) => Math.max(f, index)), [index]);

  // An action step moves on when you do that action on the phone (or press Jump).
  const onAction = useCallback((a: DemoAction) => {
    const step = TOUR[indexRef.current];
    if (step?.advance.on === "action" && step.advance.action === a) setIndex((i) => Math.min(i + 1, TOUR.length - 1));
  }, []);
  const demo = useDemo(onAction);

  const step = TOUR[index]!;
  const next = useCallback(() => {
    const cur = TOUR[indexRef.current]!;
    if (cur.advance.on !== "next" && indexRef.current >= furthestRef.current) return;
    if (indexRef.current === TOUR.length - 1) setVisible(false);
    else setIndex((i) => i + 1);
  }, []);
  // Back moves the tour only; the game stays as it is.
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        setVisible((v) => !v);
      } else if (e.key === "p" || e.key === "P") {
        setNotes((n) => !n);
      } else if (visible && (e.key === "ArrowRight" || e.key === " ")) {
        e.preventDefault();
        next();
      } else if (visible && e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    // Stop Space from also pressing whatever button has focus.
    const up = (e: KeyboardEvent) => {
      if (visible && e.key === " " && !isTyping(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [visible, next, back]);

  const controls = (
    <>
      <button data-tour="jump" className="btn primary" onClick={demo.jump} disabled={demo.state.term >= 4 || demo.state.phase === "over"}>
        Jump to Results Day
      </button>
      <button
        className="btn"
        onClick={() => {
          demo.restart();
          setIndex(0);
          setFurthest(0);
          setVisible(true);
        }}
      >
        Restart demo
      </button>
      {!visible && (
        <button className="btn" onClick={() => setVisible(true)}>
          Show tour
        </button>
      )}
      <a className="btn ghost" href="/">
        Exit demo
      </a>
    </>
  );

  return (
    <div className="demo-screen">
      <div className="demo-board">
        <Board game={demo.board} controls={controls} />
      </div>
      <aside className="demo-phone" aria-label="Alex's phone (you play the Ally)">
        <div className="demo-phone-scroll">
          <Phone game={demo.phone} />
        </div>
      </aside>
      {visible && <TourOverlay step={step} index={index} total={TOUR.length} revisit={index < furthest} onNext={next} onBack={back} />}
      {notes && <PresenterNotes step={step} next={TOUR[index + 1]} index={index} total={TOUR.length} />}
    </div>
  );
}
