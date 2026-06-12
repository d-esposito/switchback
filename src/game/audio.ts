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
  private fire!: GainNode;
  private muted = false;
  /** user volume settings (0..1), pushed from the settings panel */
  private vols = { master: 1, ambience: 1, steps: 1 };
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

    // pink noise everywhere — white noise reads as harsh TV static
    const pinkBuf = this.makePinkNoise(ctx);

    // wind: pink noise → lowish bandpass (starts near-silent; update() fades it in)
    this.wind = this.noiseLayer(ctx, pinkBuf, "bandpass", 380, 0.02);
    // fire crackle bed: pink noise → low bandpass
    this.fire = this.noiseLayer(ctx, pinkBuf, "bandpass", 240, 0);

    // rain: pink noise → gentle lowpass whose cutoff slowly "breathes",
    // so it sounds like soft waves of rainfall instead of steady static
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = pinkBuf;
    rainSrc.loop = true;
    const rumbleCut = ctx.createBiquadFilter();
    rumbleCut.type = "highpass";
    rumbleCut.frequency.value = 160;
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 2100;
    soften.Q.value = 0.4;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.11;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 550;
    sweep.connect(sweepDepth);
    sweepDepth.connect(soften.frequency);
    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    rainSrc.connect(rumbleCut);
    rumbleCut.connect(soften);
    soften.connect(this.rain);
    this.rain.connect(this.master);
    rainSrc.start();
    sweep.start();

    this.scheduleBird();
    this.scheduleCricket();
    this.scheduleCrackle();
  }

  /** Pink (1/f) noise via the Paul Kellet filter — soft and bass-weighted. */
  private makePinkNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
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

  /**
   * One cricket chirp: a few rapid, fully-enveloped pulses. Crickets are
   * discrete events, never a continuous oscillator — a sustained sine reads
   * as ringing, not insects.
   */
  private cricketChirp(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const pulses = 3 + Math.floor(Math.random() * 3);
    const freq = 4000 + Math.random() * 500;
    for (let n = 0; n < pulses; n++) {
      const t0 = ctx.currentTime + n * 0.07;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.011, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.06);
    }
  }

  /**
   * One fire pop: a tiny noise burst through a randomized bandpass with a
   * sharp decay. Real crackle is discrete events, not a continuous bed.
   */
  private firePop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const pops = Math.random() < 0.25 ? 2 : 1;
    for (let i = 0; i < pops; i++) {
      const t0 = ctx.currentTime + i * 0.05 * Math.random();
      const src = ctx.createBufferSource();
      src.buffer = this.makeNoiseShort(ctx);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 900 + Math.random() * 2400;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      const peak = 0.015 + Math.random() * 0.045;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03 + Math.random() * 0.07);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(t0);
      src.stop(t0 + 0.15);
    }
  }

  private scheduleCrackle(): void {
    setTimeout(() => {
      if (this.ctx && this.params.nearFire && !this.muted) this.firePop();
      this.scheduleCrackle();
    }, 60 + Math.random() * 240);
  }

  private scheduleCricket(): void {
    setTimeout(() => {
      const p = this.params;
      if (this.ctx && p.night > 0.5 && p.rain < 0.2 && p.altitude < 0.45 && Math.random() < 0.8) {
        this.cricketChirp();
      }
      this.scheduleCricket();
    }, 900 + Math.random() * 2200);
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
    g.gain.setValueAtTime((surface === "snow" ? 0.05 : 0.075) * this.vols.steps, t0);
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
  setVolumes(v: { master: number; ambience: number; steps: number }): void {
    this.vols = v;
    if (this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(0.6 * v.master, this.ctx.currentTime, 0.1);
    }
  }

  update(p: AudioParams): void {
    this.params = p;
    const ctx = this.ctx;
    if (!ctx) return;
    // setTargetAtTime is safe under repeated calls (no overlapping ramp pile-up)
    const t = ctx.currentTime;
    const amb = this.vols.ambience;
    this.wind.gain.setTargetAtTime((0.025 + p.altitude * 0.11 + p.rain * 0.03) * amb, t, 0.25);
    this.rain.gain.setTargetAtTime(p.rain * 0.3 * amb, t, 0.25);
    // faint warm rumble under the crackle scheduler's discrete pops
    this.fire.gain.setTargetAtTime((p.nearFire ? 0.03 : 0) * amb, t, 0.25);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) {
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.6, this.ctx.currentTime + 0.15);
    }
  }
}

export const audio = new AudioEngine();
