// Proximity voice chat: a WebRTC mesh where each pair of nearby hikers holds
// one peer connection, with Convex as the signaling channel. Volume falls off
// with distance; the mic transmits only while V is held (or open-mic is on).

export const VOICE_RANGE = 28; // silent beyond this many meters
const CONNECT_DIST = 32; // start a connection inside this
const DISCONNECT_DIST = 42; // tear down outside this (hysteresis)

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export type SignalSender = (to: string, kind: string, payload: string) => void;

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
  pendingIce: RTCIceCandidateInit[];
  hasRemote: boolean;
  initiator: boolean;
}

class VoiceManager {
  private myId = "";
  private mic: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private analyserCtx: AudioContext | null = null;
  private levelBuf = new Uint8Array(256);
  private transmitting = false;
  private openMic = false;
  sendSignal: SignalSender = () => {};

  get enabled(): boolean {
    return this.mic !== null;
  }

  setMyId(id: string): void {
    this.myId = id;
  }

  /** Request the microphone. Must be called from a user gesture. */
  async enable(): Promise<boolean> {
    if (this.mic) return true;
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.applyTransmit();
      // existing connections were receive-only; renegotiate with our track
      for (const [id, peer] of this.peers) {
        for (const track of this.mic.getTracks()) {
          peer.pc.addTrack(track, this.mic);
        }
        void this.renegotiate(id, peer);
      }
      return true;
    } catch {
      return false;
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

  /** True when the mic track is actually live to peers. */
  isLive(): boolean {
    return this.enabled && (this.transmitting || this.openMic);
  }

  private applyTransmit(): void {
    const on = this.transmitting || this.openMic;
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  private async renegotiate(id: string, peer: Peer): Promise<void> {
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.sendSignal(id, "offer", JSON.stringify(offer));
  }

  private createPeer(id: string, initiator: boolean): Peer {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audio = new Audio();
    audio.autoplay = true;
    audio.volume = 0;

    const peer: Peer = { pc, audio, analyser: null, pendingIce: [], hasRemote: false, initiator };

    if (this.mic) {
      for (const track of this.mic.getTracks()) pc.addTrack(track, this.mic);
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal(id, "ice", JSON.stringify(e.candidate.toJSON()));
    };
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0];
      // browsers may block autoplay until a gesture; retried in resumePlayback()
      void audio.play().catch(() => {});
      try {
        this.analyserCtx ??= new AudioContext();
        const src = this.analyserCtx.createMediaStreamSource(e.streams[0]);
        const analyser = this.analyserCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser); // analysis only — playback stays on the element
        peer.analyser = analyser;
      } catch {
        peer.analyser = null;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.closePeer(id);
    };

    this.peers.set(id, peer);
    if (initiator) void this.renegotiate(id, peer);
    return peer;
  }

  async handleSignal(from: string, kind: string, payload: string): Promise<void> {
    let peer = this.peers.get(from);
    try {
      if (kind === "offer") {
        peer ??= this.createPeer(from, false);
        await peer.pc.setRemoteDescription(JSON.parse(payload));
        peer.hasRemote = true;
        for (const c of peer.pendingIce) await peer.pc.addIceCandidate(c);
        peer.pendingIce = [];
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.sendSignal(from, "answer", JSON.stringify(answer));
      } else if (kind === "answer" && peer) {
        await peer.pc.setRemoteDescription(JSON.parse(payload));
        peer.hasRemote = true;
        for (const c of peer.pendingIce) await peer.pc.addIceCandidate(c);
        peer.pendingIce = [];
      } else if (kind === "ice" && peer) {
        const candidate = JSON.parse(payload) as RTCIceCandidateInit;
        if (peer.hasRemote) await peer.pc.addIceCandidate(candidate);
        else peer.pendingIce.push(candidate);
      }
    } catch {
      // a glared/raced handshake — drop the pair; proximity loop will retry
      this.closePeer(from);
    }
  }

  /**
   * Reconcile connections with who is nearby and set distance-based volume.
   * Call a few times per second with fresh positions.
   */
  updateProximity(
    self: { x: number; z: number },
    remotes: { deviceId: string; x: number; z: number }[]
  ): void {
    const seen = new Set<string>();
    for (const r of remotes) {
      const d = Math.hypot(r.x - self.x, r.z - self.z);
      seen.add(r.deviceId);
      const peer = this.peers.get(r.deviceId);
      if (!peer && d < CONNECT_DIST) {
        // deterministic initiator avoids both sides offering at once
        if (this.myId < r.deviceId) this.createPeer(r.deviceId, true);
      } else if (peer) {
        if (d > DISCONNECT_DIST) {
          this.closePeer(r.deviceId);
        } else {
          const v = Math.max(0, 1 - d / VOICE_RANGE);
          peer.audio.volume = Math.pow(v, 1.6);
        }
      }
    }
    for (const id of [...this.peers.keys()]) {
      if (!seen.has(id)) this.closePeer(id);
    }
  }

  /** Voice activity per connected peer, 0..1-ish RMS. */
  levels(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, peer] of this.peers) {
      if (!peer.analyser) continue;
      peer.analyser.getByteTimeDomainData(this.levelBuf);
      let sum = 0;
      for (let i = 0; i < this.levelBuf.length; i++) {
        const x = (this.levelBuf[i] - 128) / 128;
        sum += x * x;
      }
      out[id] = Math.sqrt(sum / this.levelBuf.length);
    }
    return out;
  }

  /** Retry audio playback after a user gesture (autoplay policies). */
  resumePlayback(): void {
    if (this.analyserCtx?.state === "suspended") void this.analyserCtx.resume();
    for (const peer of this.peers.values()) {
      if (peer.audio.paused && peer.audio.srcObject) void peer.audio.play().catch(() => {});
    }
  }

  connectedCount(): number {
    return this.peers.size;
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.close();
    peer.audio.srcObject = null;
    this.peers.delete(id);
  }
}

export const voice = new VoiceManager();
