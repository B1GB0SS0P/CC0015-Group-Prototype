import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { ROOM_NAME } from "@nsc/shared";
import { GameRoom } from "./GameRoom";

const PORT = Number(process.env.PORT ?? 2567);

// The built client (packages/client/dist) is served from the same origin,
// so one Render web service hosts both the page and the WebSocket server.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = [path.resolve(here, "../../client/dist"), path.resolve(here, "../client/dist")].find((p) => existsSync(p));

const server = defineServer({
  transport: new WebSocketTransport({ pingInterval: 5000, pingMaxRetries: 3 }),
  rooms: {
    [ROOM_NAME]: defineRoom(GameRoom),
  },
  express: (app) => {
    app.get("/health", (_req, res) => {
      res.json({ ok: true });
    });
    if (clientDist) {
      app.use(express.static(clientDist, { index: "index.html", maxAge: "1h" }));
      // Client-side routes (e.g. /join/ABCD) fall back to the app shell.
      app.get(/^\/(?!matchmake|health).*/, (_req, res) => {
        res.sendFile(path.join(clientDist, "index.html"));
      });
    }
  },
});

await server.listen(PORT);
console.log(`No Solo Carry server on :${PORT}${clientDist ? ` (serving ${clientDist})` : " (client not built; run the Vite dev server)"}`);
