// Fully synthesized ambience — no audio assets. Wind, rain, crickets and
// birdsong are filtered noise / oscillators whose gains follow game state.

interface AudioParams {
  /** 0 (valley) .. 1 (summit) */
  altitude: number;
  rain: number;
  night: number; // 0 day .. 1 night
  nearFire: boolean;
  inForest: boolean;
  moving: boolean;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private wind!: GainNode;
  private rain!: GainNode;
  private crickets!: GainNode;
  private fire!: GainNode;
  private muted = false;
  private params: AudioParams = {
    altitude: 0, rain: 0, night: 0, nearFire: false, inForest: false, moving: false,
  };

  /** Create the graph — must be called after a user gesture. */
  ensure(): void {
    if (this.ctx) {
      // browsers may start (or leave) the context suspended until a gesture
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state === "suspended") void ctx.resume();

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    const noiseBuf = this.makeNoise(ctx);

    // wind: noise → lowish bandpass
    this.wind = this.noiseLayer(ctx, noiseBuf, "bandpass", 380, 0.6);
    // rain: noise → highpass hiss
    this.rain = this.noiseLayer(ctx, noiseBuf, "highpass", 1900, 0);
    // fire crackle bed: noise → low bandpass, pops added by scheduler
    this.fire = this.noiseLayer(ctx, noiseBuf, "bandpass", 240, 0);

    // crickets: pulsing high chirp
    this.crickets = ctx.createGain();
    this.crickets.gain.value = 0;
    const cricketOsc = ctx.createOscillator();
    cricketOsc.frequency.value = 4250;
    const pulse = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(pulse.gain);
    pulse.gain.value = 0.5;
    cricketOsc.connect(pulse);
    pulse.connect(this.crickets);
    this.crickets.connect(this.master);
    cricketOsc.start();
    lfo.start();

    this.scheduleBird();
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private noiseLayer(
    ctx: AudioContext,
    buf: AudioBuffer,
    type: BiquadFilterType,
    freq: number,
    gain: number
  ): GainNode {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
    return g;
  }

  /** One synthesized bird chirp: a few quick descending whistles. */
  private chirp(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2400 + Math.random() * 1600;
    for (let n = 0; n < notes; n++) {
      const t0 = ctx.currentTime + n * 0.14;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(base + Math.random() * 300, t0);
      osc.frequency.exponentialRampToValueAtTime(base * 0.8, t0 + 0.09);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.045, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.12);
    }
  }

  private scheduleBird(): void {
    setTimeout(() => {
      const p = this.params;
      const dayness = 1 - p.night;
      if (this.ctx && dayness > 0.5 && p.rain < 0.25 && (p.inForest || Math.random() < 0.4)) {
        this.chirp();
      }
      this.scheduleBird();
    }, 2500 + Math.random() * 6000);
  }

  /** Short filtered tick per footfall. */
  footstep(surface: "grass" | "rock" | "snow"): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoiseShort(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = surface === "rock" ? 2400 : surface === "snow" ? 500 : 900;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(surface === "snow" ? 0.05 : 0.075, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.08);
  }

  private shortNoise: AudioBuffer | null = null;
  private makeNoiseShort(ctx: AudioContext): AudioBuffer {
    if (this.shortNoise) return this.shortNoise;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.shortNoise = buf;
    return buf;
  }

  /** Smoothly retarget the ambient layer gains. Call ~4×/second. */
  update(p: AudioParams): void {
    this.params = p;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.3;
    this.wind.gain.linearRampToValueAtTime(0.025 + p.altitude * 0.11 + p.rain * 0.03, t);
    this.rain.gain.linearRampToValueAtTime(p.rain * 0.14, t);
    this.crickets.gain.linearRampToValueAtTime(
      p.night * (p.rain > 0.2 ? 0 : 0.012) * (p.altitude < 0.4 ? 1 : 0.3),
      t
    );
    this.fire.gain.linearRampToValueAtTime(p.nearFire ? 0.12 : 0, t);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) {
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.6, this.ctx.currentTime + 0.15);
    }
  }
}

export const audio = new AudioEngine();
