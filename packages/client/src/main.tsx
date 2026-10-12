import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/kalam/400.css";
import "@fontsource/kalam/700.css";
import "./styles.css";

import { createRoot } from "react-dom/client";
import { Board } from "./Board";
import { Home } from "./Home";
import { useGame } from "./net";
import { Phone } from "./Phone";
import { Toast } from "./ui";

/** /join/ABCD from the QR code pre-fills the code. */
function codeFromUrl(): string {
  const m = window.location.pathname.match(/^\/join\/([A-Za-z]{4})\/?$/);
  return m ? m[1]!.toUpperCase() : "";
}

function App() {
  const game = useGame();

  if (game.me?.isHost) return <Board game={game} />;
  if (game.me) return <Phone game={game} />;
  if (game.status === "connecting" && !game.state) {
    return (
      <main className="page margined">
        <p className="hand">Connecting…</p>
        <Toast text={game.error} />
      </main>
    );
  }
  return (
    <>
      <Home game={game} initialCode={codeFromUrl()} />
      <Toast text={game.error} />
    </>
  );
}

// No StrictMode: its double-run of effects in development would open two connections on resume.
createRoot(document.getElementById("root")!).render(<App />);
