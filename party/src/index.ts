import {
  Server,
  routePartykitRequest,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";

interface Colors {
  skin: string;
  shirt: string;
  pants: string;
  hat: string;
  pack: string;
}

/** Per-connection player state, stored as the connection attachment. */
interface PlayerState {
  key: string;
  name: string;
  colors: Colors;
  hatStyle: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  anim: string;
  /** True when this player has a live microphone (voice peers connect only then). */
  mic: boolean;
}

interface Env {
  Mountain: DurableObjectNamespace;
}

/**
 * One shared mountain: every hiker holds one WebSocket to this room.
 * - position updates fan out to everyone else (sender excluded)
 * - the roster (join/leave/mic flags) keeps clients' player lists in sync
 * - voice signaling (offer/answer/ice) is unicast-routed between peers,
 *   never touching the position path
 */
export class Mountain extends Server<Env> {
  onConnect(conn: Connection<PlayerState>, ctx: ConnectionContext): void {
    const q = new URL(ctx.request.url).searchParams;
    let colors: Colors;
    try {
      colors = JSON.parse(q.get("colors") ?? "");
    } catch {
      colors = { skin: "#e8b58c", shirt: "#d8542f", pants: "#4a4137", hat: "#2e4053", pack: "#b3552e" };
    }
    const state: PlayerState = {
      key: q.get("key") ?? conn.id,
      name: (q.get("name") ?? "Hiker").slice(0, 24),
      colors,
      hatStyle: q.get("hatStyle") ?? "cap",
      x: Number(q.get("x") ?? 0),
      y: Number(q.get("y") ?? 0),
      z: Number(q.get("z") ?? 0),
      rotY: 0,
      anim: "idle",
      mic: false,
    };
    conn.setState(state);

    // newcomer gets the current roster; everyone else learns about them
    const roster: PlayerState[] = [];
    for (const other of this.getConnections<PlayerState>()) {
      if (other.id !== conn.id && other.state) roster.push(other.state);
    }
    conn.send(JSON.stringify({ t: "roster", players: roster }));
    this.broadcast(JSON.stringify({ t: "join", p: state }), [conn.id]);
  }

  onMessage(conn: Connection<PlayerState>, message: WSMessage): void {
    if (typeof message !== "string") return;
    const s = conn.state;
    if (!s) return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }

    switch (m.t) {
      case "pos": {
        const next: PlayerState = {
          ...s,
          x: num(m.x, s.x),
          y: num(m.y, s.y),
          z: num(m.z, s.z),
          rotY: num(m.rotY, s.rotY),
          anim: typeof m.anim === "string" ? m.anim : s.anim,
        };
        conn.setState(next);
        this.broadcast(
          JSON.stringify({
            t: "pos",
            key: s.key,
            x: next.x,
            y: next.y,
            z: next.z,
            rotY: next.rotY,
            anim: next.anim,
          }),
          [conn.id]
        );
        break;
      }
      case "mic": {
        const on = m.on === true;
        conn.setState({ ...s, mic: on });
        this.broadcast(JSON.stringify({ t: "mic", key: s.key, on }), [conn.id]);
        break;
      }
      case "sig": {
        // voice signaling: route to the one connection with the target key
        if (typeof m.to !== "string") return;
        for (const other of this.getConnections<PlayerState>()) {
          if (other.state?.key === m.to) {
            other.send(
              JSON.stringify({ t: "sig", from: s.key, kind: m.kind, payload: m.payload })
            );
            break;
          }
        }
        break;
      }
    }
  }

  onClose(conn: Connection<PlayerState>): void {
    if (conn.state) {
      this.broadcast(JSON.stringify({ t: "leave", key: conn.state.key }), [conn.id]);
    }
  }

  onError(conn: Connection<PlayerState>, error: unknown): void {
    // partyserver invokes onClose after errors itself — just log
    console.error("connection error", conn.state?.key, error);
  }
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env as unknown as Record<string, unknown>)) ??
      new Response("switchback-party: not a party route", { status: 404 })
    );
  },
};
