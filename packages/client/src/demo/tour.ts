/**
 * Guided demo: each step highlights one element (by data-tour id),
 * shows a caption, and advances on Next or on a specific player action.
 * Written to fit a ~3 minute demo.
 */

export type TourAdvance =
  | { on: "next" }
  | { on: "action"; action: "place" | "attack" | "bond" | "done" | "jump" | "attackSet" };

export interface TourStep {
  id: string;
  /** data-tour attribute of the element to highlight. Null = centred caption, no highlight. */
  target: string | null;
  title: string;
  /** Shown on screen. Keep to 1–2 short sentences. */
  caption: string;
  /** Talking point for the presenter. Not shown on screen. */
  say: string;
  advance: TourAdvance;
}

export const TOUR: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "No Solo Carry",
    caption: "A co-op game. Four bosses, one team. You win or lose together.",
    say: "Each student joins on their phone, and the board goes on the projector. I'm playing the Ally, and the rest of my team are bots.",
    advance: { on: "next" },
  },
  {
    id: "statements",
    target: "team",
    title: "Success Statements",
    caption: "Every statement helps a teammate or the team. None of them can target yourself.",
    say: "This is the core of the game. Your success only works when it's aimed beyond yourself.",
    advance: { on: "next" },
  },
  {
    id: "boss",
    target: "boss-current",
    title: "Term 1: Comparison",
    caption: "\"I got an A. How about you?\" It's weak to Bond: time with friends.",
    say: "The bosses come straight from Person A's story: Comparison, Burnout, Fear of Failure and Results Day.",
    advance: { on: "next" },
  },
  {
    id: "chips",
    target: "place",
    title: "Spend your time",
    caption: "One chip per Energy. Study gives Grades but costs Energy. Put 2 on Friends to fire my statement.",
    say: "This is the time trade-off students face every week. Place 2 on Friends, 1 on Rest and 1 on Interest, then lock in.",
    advance: { on: "action", action: "place" },
  },
  {
    id: "fired",
    target: "log",
    title: "Statements fire",
    caption: "My statement fired: the Grinder gets Energy back.",
    say: "I chose to show up for friends so the Grinder gets stronger. Helping them is my definition of success.",
    advance: { on: "next" },
  },
  {
    id: "grinder",
    target: "player-grinder",
    title: "The Grinder",
    caption: "The Grinder studies the most and burns out the fastest.",
    say: "Less Energy means fewer chips next term. Grinding alone makes you less effective. That's Person A.",
    advance: { on: "next" },
  },
  {
    id: "attack",
    target: "attack",
    title: "Hit the weakness",
    caption: "Bond does extra damage to Comparison.",
    say: "Comparison is beaten by connection, not by more grades. Hit it with Bond.",
    advance: { on: "action", action: "attack" },
  },
  {
    id: "support",
    target: "support",
    title: "Or support a teammate",
    caption: "Spend Bond to restore 2 of a teammate's Energy.",
    say: "Support is a strategy here, not a side thing. Give Bond to the Grinder.",
    advance: { on: "action", action: "bond" },
  },
  {
    id: "done",
    target: "done",
    title: "End of term",
    caption: "Everyone loses 1 Energy each term. Unspent tokens disappear.",
    say: "School wears you down every term. Teams that don't look after each other run out of chips.",
    advance: { on: "action", action: "done" },
  },
  {
    id: "jump",
    target: "jump",
    title: "Skip ahead",
    caption: "Jump to the final boss.",
    say: "Let's fast-forward to Results Day.",
    advance: { on: "action", action: "jump" },
  },
  {
    id: "results",
    target: "boss-current",
    title: "Results Day",
    caption: "Single tokens do nothing. It only takes a full set.",
    say: "A full set is one Grade, one Health, one Bond and one Interest. Grades alone can't win.",
    advance: { on: "next" },
  },
  {
    id: "set",
    target: "set",
    title: "The whole you",
    caption: "Grades, rest, friends and interests, together.",
    say: "My teammates passed me what I was missing. Spend the full set.",
    advance: { on: "action", action: "attackSet" },
  },
  {
    id: "close",
    target: null,
    title: "Nobody carries alone",
    caption: "Success isn't a grade you earn alone. It's a purpose you pursue with others.",
    say: "A Grinder playing alone loses. That's Person A. That's the reframe we want students to leave with.",
    advance: { on: "next" },
  },
];