import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/kalam/400.css";
import "@fontsource/kalam/700.css";
import "./styles.css";

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "./Board";
import { Home } from "./Home";
import { HowToPlay } from "./HowToPlay";
import { SEAT_SESSION_KEY, SESSION_KEY, useGame } from "./net";
import { Phone } from "./Phone";
import { Toast } from "./ui";

/** /join/ABCD from the QR code pre-fills the code. */
function codeFromUrl(): string {
  const m = window.location.pathname.match(/^\/join\/([A-Za-z]{4})\/?$/);
  return m ? m[1]!.toUpperCase() : "";
}

const params = new URLSearchParams(window.location.search);
/** The host's own hand, shown in a panel beside the board: /join/ABCD?seat=1&name=Sam */
const seatMode = params.get("seat") === "1";

function App() {
  const game = useGame(seatMode ? SEAT_SESSION_KEY : SESSION_KEY);

  // Seat mode joins by itself with the name the board passed in.
  const tried = useRef(false);
  const seatName = params.get("name") ?? "";
  const code = codeFromUrl();
  useEffect(() => {
    if (!seatMode || tried.current || game.me || game.status !== "idle" || !code || !seatName) return;
    tried.current = true;
    void game.join(code, seatName);
  }, [game, code, seatName]);

  if (game.me?.isHost) return <Board game={game} />;
  if (game.me) return <Phone game={game} />;
  if (seatMode || (game.status === "connecting" && !game.state)) {
    return (
      <main className="page">
        <p className="hand">{game.status === "idle" && tried.current ? "Couldn't join. Close this panel and try again." : "Connecting…"}</p>
        <Toast text={game.error} />
      </main>
    );
  }
  return (
    <>
      <Home game={game} initialCode={code} />
      <Toast text={game.error} />
    </>
  );
}

const root = createRoot(document.getElementById("root")!);
// No StrictMode: its double-run of effects in development would open two connections on resume.
root.render(window.location.pathname.replace(/\/$/, "") === "/how-to-play" ? <HowToPlay /> : <App />);
