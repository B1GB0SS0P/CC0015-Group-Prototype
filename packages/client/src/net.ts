import { Client, type Room } from "@colyseus/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROOM_NAME, type ClientMessages, type GameState, type ServerMessages } from "@nsc/shared";

export type LiveState = GameState & { code: string };
export type Status = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

interface SavedSession {
  kind: "host" | "player";
  code: string;
  token: string;
  hostKey?: string;
  name?: string;
}

/** Each tab remembers its own seat. The host's own player seat (in the side panel) uses a second key. */
export const SESSION_KEY = "nsc-session";
export const SEAT_SESSION_KEY = "nsc-session-seat";
/** Free hosts sleep after 15 minutes without incoming messages, which ends the game. */
const KEEPALIVE_MS = 60_000;

/**
 * Production: the game server also serves this page, so it's the same origin.
 * Development: Vite runs on 5173 and the game server on 2567 on the same machine,
 * so reuse the page's hostname (works for phones joining over your Wi-Fi too).
 */
function serverUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  if (import.meta.env.DEV) return `${window.location.protocol}//${window.location.hostname}:2567`;
  return window.location.origin;
}

function loadSession(key: string): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

function saveSession(key: string, s: SavedSession | null) {
  try {
    if (s) sessionStorage.setItem(key, JSON.stringify(s));
    else sessionStorage.removeItem(key);
  } catch {
    // Private mode or storage blocked: refresh-to-resume just won't work.
  }
}

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/not found|invalid room|room .* not/i.test(msg)) return "No game with that code. Check the board screen. If the server restarted, the host needs to open a new board.";
  if (/failed to fetch|network|ECONNREFUSED|websocket/i.test(msg)) return "Can't reach the game server. Check your connection and try again.";
  return msg || "Something went wrong.";
}

/**
 * One connection to one room. Colyseus reconnects automatically after short
 * drops; a saved token lets a refreshed page resume, and as a last resort a
 * player rejoins their seat by name (the board by its host key).
 */
export function useGame(storageKey: string = SESSION_KEY) {
  const [state, setState] = useState<LiveState | null>(null);
  const [me, setMe] = useState<{ playerId: string | null; isHost: boolean } | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const clientRef = useRef<Client | null>(null);
  const sessionRef = useRef<SavedSession | null>(null);
  const kickedRef = useRef(false);

  const client = useCallback(() => {
    if (!clientRef.current) clientRef.current = new Client(serverUrl());
    return clientRef.current;
  }, []);

  const flash = useCallback((msg: string) => {
    setError(msg);
    window.clearTimeout((flash as unknown as { t?: number }).t);
    (flash as unknown as { t?: number }).t = window.setTimeout(() => setError(null), 4200);
  }, []);

  const attach = useCallback(
    (room: Room, base: Omit<SavedSession, "token">) => {
      roomRef.current = room;
      sessionRef.current = { ...base, token: room.reconnectionToken };
      saveSession(storageKey, sessionRef.current);
      kickedRef.current = false;
      room.onMessage("state", (s: ServerMessages["state"]) => setState(s));
      room.onMessage("welcome", (w: ServerMessages["welcome"]) => {
        setMe({ playerId: w.playerId, isHost: w.isHost });
        sessionRef.current = { ...sessionRef.current!, code: w.code, hostKey: w.hostKey ?? sessionRef.current?.hostKey, token: room.reconnectionToken };
        saveSession(storageKey, sessionRef.current);
      });
      room.onMessage("error", (e: ServerMessages["error"]) => flash(e.message));
      room.onMessage("kicked", (k: ServerMessages["kicked"]) => {
        kickedRef.current = true;
        flash(k.message);
      });
      room.onDrop(() => setStatus("reconnecting"));
      room.onReconnect(() => {
        setStatus("connected");
        if (sessionRef.current) {
          sessionRef.current = { ...sessionRef.current, token: room.reconnectionToken };
          saveSession(storageKey, sessionRef.current);
        }
      });
      room.onLeave(() => {
        if (roomRef.current !== room) return;
        if (kickedRef.current) {
          // Removed by the host: back to the start screen, and don't try to rejoin.
          roomRef.current = null;
          saveSession(storageKey, null);
          setState(null);
          setMe(null);
          setStatus("idle");
        } else setStatus("closed");
      });
      setStatus("connected");
    },
    [flash, storageKey],
  );

  // Keep-alive while connected, so a quiet debrief doesn't let the server fall asleep.
  useEffect(() => {
    if (status !== "connected") return;
    const t = window.setInterval(() => roomRef.current?.send("ping", {}), KEEPALIVE_MS);
    return () => window.clearInterval(t);
  }, [status]);

  const host = useCallback(async () => {
    setStatus("connecting");
    try {
      const room = await client().create(ROOM_NAME, { host: true });
      attach(room, { kind: "host", code: room.roomId });
    } catch (e) {
      setStatus("idle");
      flash(errorText(e));
    }
  }, [attach, client, flash]);

  const join = useCallback(
    async (code: string, name: string) => {
      setStatus("connecting");
      try {
        const room = await client().joinById(code.trim().toUpperCase(), { name: name.trim() });
        attach(room, { kind: "player", code: room.roomId, name: name.trim() });
      } catch (e) {
        setStatus("idle");
        flash(errorText(e));
      }
    },
    [attach, client, flash],
  );

  /** On page load: pick up where this tab left off, if anywhere. */
  useEffect(() => {
    const saved = loadSession(storageKey);
    if (!saved) return;
    let cancelled = false;
    setStatus("connecting");
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      // After a refresh the server may not have noticed the old tab's socket close yet,
      // so the first attempts can be refused. Retry briefly before giving up.
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        if (attempt > 0) await wait(700 * attempt);
        try {
          const room = await client().reconnect(saved.token);
          if (!cancelled) attach(room, saved);
          return;
        } catch {
          // Token not usable (yet, or any more); try taking the seat back directly.
        }
        try {
          const room =
            saved.kind === "host"
              ? await client().joinById(saved.code, { host: true, hostKey: saved.hostKey })
              : await client().joinById(saved.code, { name: saved.name });
          if (!cancelled) attach(room, saved);
          return;
        } catch {
          // Seat still held by the old connection; retry.
        }
      }
      saveSession(storageKey, null);
      if (!cancelled) setStatus("idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [attach, client, storageKey]);

  const send = useCallback(<K extends keyof ClientMessages>(type: K, payload: ClientMessages[K]) => {
    roomRef.current?.send(type, payload);
  }, []);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    saveSession(storageKey, null);
    setState(null);
    setMe(null);
    setStatus("idle");
    try {
      await room?.leave(true);
    } catch {
      // Already gone.
    }
  }, [storageKey]);

  return { state, me, status, error, host, join, send, leave, flash };
}

export type Game = ReturnType<typeof useGame>;
