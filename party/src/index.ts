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
  /** True when this player has a live microphone (listeners pull only then). */
  mic: boolean;
  /** The player's Realtime SFU session id — where their mic track lives. */
  voiceSession: string | null;
}

interface Env {
  Mountain: DurableObjectNamespace;
  /** Cloudflare Realtime SFU app credentials (wrangler secret / .dev.vars) */
  CALLS_APP_ID?: string;
  CALLS_APP_SECRET?: string;
}

// ---------------------------------------------------------------------------
// Realtime SFU proxy: the browser negotiates WebRTC with Cloudflare's SFU
// through us, so the app secret never ships to clients. Only the session and
// track endpoints needed by the game are forwarded.
// ---------------------------------------------------------------------------

const RTC_PATH = /^\/rtc\/(sessions\/new|sessions\/[a-zA-Z0-9]+\/(tracks\/new|tracks\/close|renegotiate))$/;

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  if (
    origin === "http://localhost:5173" ||
    origin === "http://127.0.0.1:5173" ||
    origin === "https://switchback-game.vercel.app" ||
    origin === "https://hiking-game.vercel.app" ||
    (origin.startsWith("https://") && origin.endsWith("-d-espositos-projects.vercel.app"))
  ) {
    return origin;
  }
  return null;
}

async function proxyRtc(request: Request, env: Env): Promise<Response> {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("forbidden origin", { status: 403 });
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (!env.CALLS_APP_ID || !env.CALLS_APP_SECRET) {
    return new Response("voice not configured", { status: 503, headers: corsHeaders(origin) });
  }
  const url = new URL(request.url);
  const m = RTC_PATH.exec(url.pathname);
  if (!m || (request.method !== "POST" && request.method !== "PUT")) {
    return new Response("not found", { status: 404, headers: corsHeaders(origin) });
  }
  const upstream = await fetch(
    `https://rtc.live.cloudflare.com/v1/apps/${env.CALLS_APP_ID}/${m[1]}`,
    {
      method: request.method,
      headers: {
        Authorization: `Bearer ${env.CALLS_APP_SECRET}`,
        "Content-Type": "application/json",
      },
      body: request.body,
    }
  );
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

/**
 * One shared mountain: every hiker holds one WebSocket to this room.
 * - position updates fan out to everyone else (sender excluded)
 * - the roster (join/leave/mic flags) keeps clients' player lists in sync
 * - voice signaling (offer/answer/ice) is unicast-routed between peers,
 *   never touching the position path
 */
/** A live screen share on one campsite TV. */
interface TvState {
  key: string;
  session: string;
  trackName: string;
}

export class Mountain extends Server<Env> {
  /** campId -> presenter. In-memory: if the DO restarts every socket drops
   * and presenters re-claim on reconnect, so durable storage buys nothing. */
  private tvs = new Map<string, TvState>();

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
      voiceSession: null,
    };
    conn.setState(state);

    // newcomer gets the current roster; everyone else learns about them
    const roster: PlayerState[] = [];
    for (const other of this.getConnections<PlayerState>()) {
      if (other.id !== conn.id && other.state) roster.push(other.state);
    }
    const tvs: Record<string, TvState> = {};
    for (const [campId, tv] of this.tvs) tvs[campId] = tv;
    conn.send(JSON.stringify({ t: "roster", players: roster, tvs }));
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
        const voiceSession = typeof m.session === "string" ? m.session : null;
        conn.setState({ ...s, mic: on, voiceSession });
        this.broadcast(
          JSON.stringify({ t: "mic", key: s.key, on, session: voiceSession }),
          [conn.id]
        );
        break;
      }
      case "tv": {
        // claim or release a campsite TV — one presenter per TV
        if (typeof m.campId !== "string") return;
        const current = this.tvs.get(m.campId);
        if (m.on === true) {
          if (typeof m.session !== "string" || typeof m.trackName !== "string") return;
          if (current && current.key !== s.key) {
            conn.send(JSON.stringify({ t: "tvBusy", campId: m.campId }));
            return;
          }
          const tv: TvState = { key: s.key, session: m.session, trackName: m.trackName };
          this.tvs.set(m.campId, tv);
          this.broadcast(JSON.stringify({ t: "tv", campId: m.campId, on: true, ...tv }));
        } else {
          if (!current || current.key !== s.key) return;
          this.tvs.delete(m.campId);
          this.broadcast(JSON.stringify({ t: "tv", campId: m.campId, on: false }));
        }
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
      // a vanished presenter frees their TV — nobody can stop it for them
      for (const [campId, tv] of this.tvs) {
        if (tv.key === conn.state.key) {
          this.tvs.delete(campId);
          this.broadcast(JSON.stringify({ t: "tv", campId, on: false }), [conn.id]);
        }
      }
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
    if (new URL(request.url).pathname.startsWith("/rtc/")) {
      return proxyRtc(request, env);
    }
    return (
      (await routePartykitRequest(request, env as unknown as Record<string, unknown>)) ??
      new Response("switchback-party: not a party route", { status: 404 })
    );
  },
};
