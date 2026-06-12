// Proximity voice over the Cloudflare Realtime SFU. Every player holds at
// most ONE WebRTC connection — to Cloudflare's edge — publishing their mic
// once and pulling only the tracks of nearby speakers. The app secret stays
// on the party worker, which proxies the SFU's HTTPS API under /rtc/*.
//
// "Proximity" = which tracks we pull, and per-track volume by distance.

import { getPresenceKey } from "../lib/ids";

export const VOICE_RANGE = 28; // silent beyond this many meters
const PULL_DIST = 32; // start pulling a speaker inside this
const DROP_DIST = 42; // stop pulling outside this (hysteresis)
const FAIL_BACKOFF_MS = 30_000;

interface Pull {
  key: string;
  session: string;
  mid: string | null;
  /** muted — exists only because Chrome won't decode a WebRTC track without
   * a media element consumer; actual playback goes through WebAudio */
  audio: HTMLAudioElement;
  gain: GainNode | null;
  analyser: AnalyserNode | null;
}

interface RemoteVoice {
  deviceId: string;
  x: number;
  z: number;
  mic: boolean;
  voiceSession: string | null;
}

interface TracksResponse {
  sessionDescription?: { type: "offer" | "answer"; sdp: string };
  requiresImmediateRenegotiation?: boolean;
  tracks?: { mid?: string; trackName?: string; sessionId?: string; error?: unknown }[];
  errorCode?: string;
}

function rtcBase(): string {
  const host = import.meta.env.VITE_PARTY_HOST as string;
  const scheme =
    host.startsWith("127.") || host.startsWith("localhost") ? "http" : "https";
  return `${scheme}://${host}/rtc`;
}

async function api(path: string, method: "POST" | "PUT", body?: unknown): Promise<TracksResponse> {
  const res = await fetch(rtcBase() + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rtc ${path} -> ${res.status}`);
  return (await res.json()) as TracksResponse;
}

class VoiceManager {
  /**
   * Our track is named by presence key, derived directly so publishing works
   * no matter when enable() runs (the login screen calls it before any game
   * component has mounted — an external setter broke that once).
   */
  private get myKey(): string {
    return getPresenceKey();
  }
  private mic: MediaStream | null = null;
  private pc: RTCPeerConnection | null = null;
  private sessionId: string | null = null;
  private published = false;
  private pulls = new Map<string, Pull>();
  private midStreams = new Map<string, MediaStream>();
  private failedAt = new Map<string, number>();
  private analyserCtx: AudioContext | null = null;
  private levelBuf = new Uint8Array(1024);
  private smoothedLevels = new Map<string, number>();
  private lastLevelsAt = 0;
  private transmitting = false;
  /** user voice-chat volume (0..1) from settings */
  userVolume = 1;
  private openMic = false;
  /** all SFU signaling ops run one at a time — WebRTC hates concurrent offers */
  private queue: Promise<void> = Promise.resolve();
  /** called when our published mic state changes, to update the roster */
  onMicState: (on: boolean, session: string | null) => void = () => {};

  get enabled(): boolean {
    return this.mic !== null;
  }

  get session(): string | null {
    return this.sessionId;
  }

  private run<T>(op: () => Promise<T>): Promise<T> {
    const result = this.queue.then(op);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async ensureConnection(): Promise<RTCPeerConnection> {
    if (this.pc && this.sessionId) return this.pc;
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    });
    pc.ontrack = (e) => {
      if (e.transceiver.mid) {
        this.midStreams.set(
          e.transceiver.mid,
          e.streams[0] ?? new MediaStream([e.track])
        );
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.teardown();
    };
    const res = (await api("/sessions/new", "POST")) as unknown as { sessionId: string };
    this.pc = pc;
    this.sessionId = res.sessionId;
    return pc;
  }

  /** Request the microphone and publish it once. Call from a user gesture. */
  async enable(): Promise<boolean> {
    if (this.mic) return true;
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      return false;
    }
    this.applyTransmit();
    try {
      await this.run(() => this.publish());
      this.onMicState(true, this.sessionId);
      return true;
    } catch {
      return false;
    }
  }

  private async publish(): Promise<void> {
    if (this.published) return;
    const pc = await this.ensureConnection();
    const track = this.mic!.getAudioTracks()[0];
    const tx = pc.addTransceiver(track, { direction: "sendonly" });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await api(`/sessions/${this.sessionId}/tracks/new`, "POST", {
      sessionDescription: { type: "offer", sdp: offer.sdp },
      tracks: [{ location: "local", mid: tx.mid, trackName: this.myKey }],
    });
    if (res.sessionDescription) {
      await pc.setRemoteDescription(res.sessionDescription);
    }
    this.published = true;
  }

  private async pull(key: string, session: string): Promise<void> {
    const pc = await this.ensureConnection();
    const res = await api(`/sessions/${this.sessionId}/tracks/new`, "POST", {
      tracks: [{ location: "remote", sessionId: session, trackName: key }],
    });
    const track = res.tracks?.[0];
    if (!track || track.error || !track.mid) {
      throw new Error("pull failed for " + key);
    }
    if (res.requiresImmediateRenegotiation && res.sessionDescription) {
      await pc.setRemoteDescription(res.sessionDescription);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await api(`/sessions/${this.sessionId}/renegotiate`, "PUT", {
        sessionDescription: { type: "answer", sdp: answer.sdp },
      });
    }

    const stream = this.midStreams.get(track.mid);
    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = true; // playback happens in WebAudio below — one clock
    if (stream) {
      audio.srcObject = stream;
      void audio.play().catch(() => {});
    }
    let gain: GainNode | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      if (stream) {
        this.analyserCtx ??= new AudioContext();
        const ctx = this.analyserCtx;
        const src = ctx.createMediaStreamSource(stream);
        gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(ctx.destination);
        analyser = ctx.createAnalyser();
        // ~21ms window — instantaneous RMS over a few ms flickers on syllables
        analyser.fftSize = 1024;
        src.connect(analyser);
        if (ctx.state === "suspended") void ctx.resume();
      }
    } catch {
      gain = null;
      analyser = null;
      // fall back to element playback if WebAudio routing fails
      audio.muted = false;
      audio.volume = 0;
    }
    this.pulls.set(key, { key, session, mid: track.mid, audio, gain, analyser });
  }

  private async unpull(key: string): Promise<void> {
    const p = this.pulls.get(key);
    if (!p) return;
    this.pulls.delete(key);
    p.gain?.disconnect();
    p.analyser?.disconnect();
    p.audio.srcObject = null;
    if (p.mid) this.midStreams.delete(p.mid);
    if (!this.pc || !this.sessionId || !p.mid) return;
    try {
      // force: the SFU must stop forwarding immediately — a silently failed
      // graceful close leaves an orphaned stream billing egress to nobody
      const res = await api(`/sessions/${this.sessionId}/tracks/close`, "PUT", {
        tracks: [{ mid: p.mid }],
        force: true,
      });
      if (res.requiresImmediateRenegotiation && res.sessionDescription) {
        await this.pc.setRemoteDescription(res.sessionDescription);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await api(`/sessions/${this.sessionId}/renegotiate`, "PUT", {
          sessionDescription: { type: "answer", sdp: answer.sdp },
        });
      }
    } catch (err) {
      console.warn("[voice] track close failed — egress may leak:", err);
    }
  }

  setPtt(held: boolean): void {
    this.transmitting = held;
    this.applyTransmit();
  }

  setOpenMic(open: boolean): void {
    this.openMic = open;
    this.applyTransmit();
  }

  isLive(): boolean {
    return this.enabled && (this.transmitting || this.openMic);
  }

  private applyTransmit(): void {
    const on = this.transmitting || this.openMic;
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  /**
   * Reconcile pulled tracks with who is nearby and speaking-capable, and set
   * per-track volume by distance. Call a few times per second.
   */
  updateProximity(self: { x: number; z: number }, remotes: RemoteVoice[]): void {
    const now = Date.now();
    const seen = new Set<string>();
    for (const r of remotes) {
      seen.add(r.deviceId);
      const d = Math.hypot(r.x - self.x, r.z - self.z);
      const pull = this.pulls.get(r.deviceId);
      const speakable = r.mic && r.voiceSession !== null;
      const backedOff = now - (this.failedAt.get(r.deviceId) ?? 0) < FAIL_BACKOFF_MS;

      if (pull && (!speakable || d > DROP_DIST || pull.session !== r.voiceSession)) {
        void this.run(() => this.unpull(r.deviceId));
      } else if (!pull && speakable && d < PULL_DIST && !backedOff) {
        const session = r.voiceSession!;
        void this.run(() =>
          this.pull(r.deviceId, session).catch(() => {
            this.failedAt.set(r.deviceId, Date.now());
            this.pulls.delete(r.deviceId);
          })
        );
      } else if (pull) {
        const v = Math.pow(Math.max(0, 1 - d / VOICE_RANGE), 1.6) * this.userVolume;
        if (pull.gain && this.analyserCtx) {
          // smoothed ramp — hard volume steps every tick sound like dropouts
          pull.gain.gain.setTargetAtTime(v, this.analyserCtx.currentTime, 0.15);
        } else {
          pull.audio.volume = v;
        }
      }
    }
    for (const key of [...this.pulls.keys()]) {
      if (!seen.has(key)) void this.run(() => this.unpull(key));
    }
  }

  /**
   * Voice activity per pulled speaker, 0..~1. Fast attack, ~450ms release:
   * the level jumps when someone speaks and decays smoothly through the
   * micro-pauses between words, so indicators don't strobe.
   */
  levels(): Record<string, number> {
    const now = performance.now();
    const dt = this.lastLevelsAt ? Math.min(1, (now - this.lastLevelsAt) / 1000) : 0.2;
    this.lastLevelsAt = now;
    const release = Math.exp(-dt / 0.45);

    const out: Record<string, number> = {};
    for (const [key, p] of this.pulls) {
      let instant = 0;
      if (p.analyser) {
        p.analyser.getByteTimeDomainData(this.levelBuf);
        let sum = 0;
        for (let i = 0; i < this.levelBuf.length; i++) {
          const x = (this.levelBuf[i] - 128) / 128;
          sum += x * x;
        }
        instant = Math.sqrt(sum / this.levelBuf.length);
      }
      const smoothed = Math.max(instant, (this.smoothedLevels.get(key) ?? 0) * release);
      this.smoothedLevels.set(key, smoothed);
      out[key] = smoothed;
    }
    for (const key of [...this.smoothedLevels.keys()]) {
      if (!this.pulls.has(key)) this.smoothedLevels.delete(key);
    }
    return out;
  }

  /** Retry audio playback after a user gesture (autoplay policies). */
  resumePlayback(): void {
    if (this.analyserCtx?.state === "suspended") void this.analyserCtx.resume();
    for (const p of this.pulls.values()) {
      if (p.audio.paused && p.audio.srcObject) void p.audio.play().catch(() => {});
    }
  }

  connectedCount(): number {
    return this.pulls.size;
  }

  /** Drop the SFU connection entirely; proximity ticks will rebuild it. */
  private teardown(): void {
    for (const p of this.pulls.values()) {
      p.gain?.disconnect();
      p.analyser?.disconnect();
      p.audio.srcObject = null;
    }
    this.pulls.clear();
    this.midStreams.clear();
    this.pc?.close();
    this.pc = null;
    this.sessionId = null;
    const wasPublished = this.published;
    this.published = false;
    if (wasPublished && this.mic) {
      // re-publish on a fresh session so others can keep hearing us
      void this.run(() => this.publish()).then(
        () => this.onMicState(true, this.sessionId),
        () => this.onMicState(false, null)
      );
    }
  }
}

export const voice = new VoiceManager();
