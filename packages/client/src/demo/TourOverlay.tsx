import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DemoAction } from "./useDemo";
import type { TourStep } from "./tour";

/** Space around the highlighted element, in px. */
const PAD = 12;
/** Gap between the highlight and the caption card, and the card's margin from the screen edge. */
const GAP = 22;
const EDGE = 16;

const ACTION_HINT: Record<DemoAction, string> = {
  place: "Place your chips and press Lock in to continue.",
  attack: "Hit the boss to continue.",
  bond: "Give a Bond to continue.",
  done: "Press “I'm done this term” to continue.",
  jump: "Press “Jump to Results Day” to continue.",
  attackSet: "Spend a full set to continue.",
};

type Box = { x: number; y: number; w: number; h: number };

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Visible elements for a target. A target can be several elements (e.g. the chip trays and Lock in). */
function targets(id: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/** One box around all of a target's elements, padded and kept on screen. */
function measure(id: string): Box | null {
  const els = targets(id);
  if (els.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    x1 = Math.min(x1, r.left);
    y1 = Math.min(y1, r.top);
    x2 = Math.max(x2, r.right);
    y2 = Math.max(y2, r.bottom);
  }
  x1 = Math.max(4, x1 - PAD);
  y1 = Math.max(4, y1 - PAD);
  x2 = Math.min(window.innerWidth - 4, x2 + PAD);
  y2 = Math.min(window.innerHeight - 4, y2 + PAD);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Where the caption card goes: beside, below or above the highlight, whichever fits first. */
function placeCard(box: Box, cw: number, ch: number): { left: number; top: number } {
  const W = window.innerWidth, H = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), W - EDGE - cw);
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), H - EDGE - ch);
  const midY = clampY(box.y + box.h / 2 - ch / 2);
  const midX = clampX(box.x + box.w / 2 - cw / 2);
  const options = [
    { left: box.x - GAP - cw, top: midY, ok: box.x - GAP - cw >= EDGE },
    { left: box.x + box.w + GAP, top: midY, ok: box.x + box.w + GAP + cw <= W - EDGE },
    { left: midX, top: box.y - GAP - ch, ok: box.y - GAP - ch >= EDGE },
    { left: midX, top: box.y + box.h + GAP, ok: box.y + box.h + GAP + ch <= H - EDGE },
  ];
  const fit = options.find((o) => o.ok);
  if (fit) return { left: fit.left, top: fit.top };
  // Nothing fits beside it: use the corner farthest from the highlight.
  const left = box.x + box.w / 2 > W / 2 ? EDGE : W - EDGE - cw;
  const top = box.y + box.h / 2 > H / 2 ? EDGE : H - EDGE - ch;
  return { left, top };
}

export function TourOverlay({
  step,
  index,
  total,
  revisit,
  onNext,
  onBack,
}: {
  step: TourStep;
  index: number;
  total: number;
  /** Already done this step once (came back to it): offer Next instead of waiting for the action. */
  revisit: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Track the target every frame: it moves with resizes, scrolling and game updates.
  useEffect(() => {
    setBox(null);
    if (!step.target) return;
    const id = step.target;
    let raf = 0;
    let last = "";
    let scrolled = false;
    const tick = () => {
      if (!scrolled) {
        // Scroll the first in-flow element into view (fixed footers are always visible).
        const first = targets(id).find((el) => getComputedStyle(el).position !== "fixed");
        if (first) {
          // Centre it, so it isn't left under the phone's fixed footer.
          first.scrollIntoView({ block: "center", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
          scrolled = true;
        }
      }
      const b = measure(id);
      const key = b ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}` : "none";
      if (key !== last) {
        last = key;
        setBox(b);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !box) return setPos(null);
    setPos(placeCard(box, card.offsetWidth, card.offsetHeight));
  }, [box, step]);

  const centred = !box;
  const last = index === total - 1;

  return (
    <div className="tour">
      {box ? <div className="tour-hole" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} /> : <div className="tour-dim" />}
      <div
        ref={cardRef}
        className={`tour-card${centred ? " center" : ""}`}
        style={centred ? undefined : pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
        role="dialog"
        aria-live="polite"
        aria-label={`Tour step ${index + 1} of ${total}: ${step.title}`}
      >
        <div className="tour-count">
          Step {index + 1} of {total}
        </div>
        <h2>{step.title}</h2>
        <p className="tour-caption">{step.caption}</p>
        <div className="tour-actions">
          {index > 0 ? (
            <button className="btn ghost" onClick={onBack}>
              Back
            </button>
          ) : (
            <span />
          )}
          {step.advance.on === "next" || revisit ? (
            <button className="btn primary" onClick={onNext}>
              {last ? "Finish" : "Next"}
            </button>
          ) : (
            <span className="tour-hint">{ACTION_HINT[step.advance.action]}</span>
          )}
        </div>
        <p className="tour-keys">→ or Space: next · ←: back · Esc: hide · P: presenter notes</p>
      </div>
    </div>
  );
}

/** The presenter's talking points. Only shown when toggled with P. */
export function PresenterNotes({ step, next, index, total }: { step: TourStep; next?: TourStep; index: number; total: number }) {
  return (
    <aside className="presenter" aria-label="Presenter notes">
      <div className="presenter-head">
        <span>Presenter notes</span>
        <span>
          {index + 1} / {total} · P to hide
        </span>
      </div>
      <b>{step.title}</b>
      <p className="say">{step.say}</p>
      {next && <p className="presenter-next">Next: {next.title}</p>}
    </aside>
  );
}
