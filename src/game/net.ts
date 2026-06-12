// The hot multiplayer path: one WebSocket per tab to the Mountain room
// (a PartyServer Durable Object on Cloudflare). Positions fan out here at
// ~12.5 Hz; voice signaling rides the same socket. Convex keeps everything
// durable (profiles, inventory, registers, cairns, world clock).

import { PartySocket } from "partysocket";
import { useGame, type Colors, type Profile } from "./store";
import { getPresenceKey } from "../lib/ids";

// This module owns a live socket — hot-swapping it would orphan the
// connection on a stale instance. Invalidate on any hot update so Vite
// escalates to a full page reload instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => import.meta.hot?.invalidate());
}

export interface RemoteState {
  key: string;
  name: string;
  colors: Colors;
  hatStyle: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  anim: string;
  mic: boolean;
  /** SFU session id of this player's published mic track (null = silent). */
  voiceSession: string | null;
}

type SignalHandler = (from: string, kind: string, payload: string) => void;

class Net {
  private socket: PartySocket | null = null;
  /** Live remote players. Mutated in place; positions are read per-frame. */
  readonly roster = new Map<string, RemoteState>();
  /** Increments on every (re)connect — used to re-announce state like mic. */
  openCount = 0;
  onSignal: SignalHandler = () => {};

  get key(): string {
    return getPresenceKey();
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(profile: Profile, spawn: { x: number; y: number; z: number }): void {
    if (this.socket) return;
    this.socket = new PartySocket({
      host: import.meta.env.VITE_PARTY_HOST as string,
      party: "mountain",
      room: "mountain",
      query: {
        key: this.key,
        name: profile.name,
        colors: JSON.stringify(profile.colors),
        hatStyle: profile.hatStyle,
        x: String(spawn.x),
        y: String(spawn.y),
        z: String(spawn.z),
      },
    });

    this.socket.addEventListener("message", (e) => {
      if (import.meta.env.DEV) {
        const w = window as unknown as { __netMsgs?: number };
        w.__netMsgs = (w.__netMsgs ?? 0) + 1;
      }
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(e.data as string);
      } catch {
        return;
      }
      switch (m.t) {
        case "roster":
          // fresh snapshot (initial connect or reconnect)
          this.roster.clear();
          for (const p of m.players as RemoteState[]) {
            if (p.key !== this.key) this.roster.set(p.key, p);
          }
          this.bumpRoster();
          break;
        case "join": {
          const p = m.p as RemoteState;
          if (p.key !== this.key) {
            this.roster.set(p.key, p);
            this.bumpRoster();
          }
          break;
        }
        case "leave":
          if (this.roster.delete(m.key as string)) this.bumpRoster();
          break;
        case "pos": {
          const p = this.roster.get(m.key as string);
          if (p) {
            p.x = m.x as number;
            p.y = m.y as number;
            p.z = m.z as number;
            p.rotY = m.rotY as number;
            p.anim = m.anim as string;
            // no React update — RemoteHiker reads this in useFrame
          }
          break;
        }
        case "mic": {
          const p = this.roster.get(m.key as string);
          if (p) {
            p.mic = m.on === true;
            p.voiceSession = typeof m.session === "string" ? m.session : null;
          }
          break;
        }
        case "sig":
          this.onSignal(m.from as string, m.kind as string, m.payload as string);
          break;
      }
    });

    this.socket.addEventListener("open", () => {
      this.openCount += 1;
    });
    // a reconnecting socket gets a fresh roster from the server on open;
    // stale entries are cleared by the roster snapshot handler above
    this.socket.addEventListener("close", () => {
      // keep the last roster — partysocket reconnects automatically
    });
  }

  private bumpRoster(): void {
    const s = useGame.getState();
    s.setRosterVersion(s.rosterVersion + 1);
    s.setOnlineCount(this.roster.size + 1);
  }

  sendPos(x: number, y: number, z: number, rotY: number, anim: string): void {
    if (!this.connected) return;
    this.socket!.send(JSON.stringify({ t: "pos", x, y, z, rotY, anim }));
  }

  sendMic(on: boolean, session: string | null): void {
    if (!this.connected) return;
    this.socket!.send(JSON.stringify({ t: "mic", on, session }));
  }

  sendSignal(to: string, kind: string, payload: string): void {
    if (!this.connected) return;
    this.socket!.send(JSON.stringify({ t: "sig", to, kind, payload }));
  }
}

export const net = new Net();
