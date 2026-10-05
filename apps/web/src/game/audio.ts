/**
 * All the sound is made on the spot with Web Audio, so the game ships no audio files. Effects are layered the way a
 * recording sounds: a sharp transient, a body of filtered noise, a low thump in the chest and a tail that rings in a
 * room reverb built from noise, each a little different every time and panned to where it happens. The music is a
 * small step sequencer with three tracks: calm for the menu, driving for a run, darker for a boss fight, which grows
 * heavier when the boss is enraged. Browsers only start audio after a tap, so nothing plays until `resume()` is called
 * from one.
 */

export type SfxName =
  | "pistol"
  | "rifle"
  | "smg"
  | "minigun"
  | "moto"
  | "cannon"
  | "pop"
  | "hurt"
  | "gateGood"
  | "gateBad"
  | "weapon"
  | "vehicle"
  | "recruit"
  | "coin"
  | "boom"
  | "warning"
  | "slam"
  | "launch"
  | "roll"
  | "laser"
  | "freeze"
  | "meteor"
  | "roar"
  | "crackle"
  | "plane"
  | "spikes"
  | "win"
  | "lose";

export type TrackName = "menu" | "battle" | "boss";

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** `x` nudged up or down by up to `amount` of itself: no two shots or blasts sound exactly alike. */
const vary = (x: number, amount = 0.08) => x * (1 + (Math.random() - 0.5) * 2 * amount);

/** The menu: slow major-seventh chords under a soft plucked arpeggio. One chord root per bar. */
const MENU = { bpm: 84, roots: [48, 53, 50, 55], chord: [0, 4, 7, 11], arp: [0, 7, 11, 16, 12, 7, 4, 7] };

/** A run: drums, a driving bass and a lead over a minor progression. Lead notes are semitones above the root (null = rest). */
const BATTLE = {
  bpm: 140,
  roots: [45, 41, 48, 43],
  bass: [0, 0, 12, 0, 0, 7, 0, 12],
  chord: [0, 3, 7],
  lead: [
    [12, null, 15, null, 19, null, 15, null, 12, null, 15, 19, 24, null, 19, null],
    [12, null, 17, null, 21, null, 17, null, 12, null, 17, 21, 24, null, 21, null],
    [12, null, 16, null, 19, null, 16, null, 12, null, 16, 19, 24, null, 19, 16],
    [14, null, 17, null, 19, null, 17, null, 14, null, 19, 23, 26, null, 23, 19],
  ] as (number | null)[][],
};

/** A boss fight: a low ostinato on a dark, half-step progression, heavy drums and brass stabs; toms roll into every fourth bar. */
const BOSS = {
  bpm: 152,
  roots: [40, 41, 40, 38],
  ostinato: [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 8, 0, 7, 0],
  stab: [0, 3, 7],
};

const LOOKAHEAD_S = 0.25;
const SCHEDULER_MS = 80;
const PREF = "squad-x:muted";
/** how loud the effects, the music and the room reverb are in the mix */
const SFX_LEVEL = 0.75;
const MUSIC_LEVEL = 0.11;
/** seconds the old track takes to fade before the new one starts */
const CROSSFADE_S = 0.45;

/** How a burst of noise sounds: which noise, through which filter, sweeping from where to where, and how it starts. */
interface HissOpts {
  /** white noise for a crack or a hiss, brown for a rumble */
  buffer?: "white" | "brown";
  filter: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
  attack?: number;
  /** drive it through a soft distortion, for the crunch of a blast */
  crunch?: boolean;
}

/** How an oscillator note sounds: its attack, an optional sweeping filter and a detune (cents). */
interface VoiceOpts {
  attack?: number;
  filter?: BiquadFilterType;
  from?: number;
  to?: number;
  q?: number;
  detune?: number;
  crunch?: boolean;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  /** the room: a reverb fed by sends from the effects and the music */
  private reverb!: GainNode;
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private crunchCurve!: Float32Array<ArrayBuffer>;
  private track: TrackName | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  /** the boss is enraged: its track plays its heavier layer */
  private fury = false;
  /** one switch for everything: the player either wants sound or doesn't */
  muted = readMuted();

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    // a gentle compressor glues the layers together, and a soft clipper after it keeps a pile of blasts from crackling
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const shaper = ctx.createWaveShaper();
    shaper.curve = tanhCurve(1.6);
    this.master.connect(comp).connect(shaper).connect(ctx.destination);
    this.crunchCurve = tanhCurve(5);

    this.reverb = ctx.createGain();
    const room = ctx.createConvolver();
    room.buffer = roomImpulse(ctx, 1.7);
    const roomLevel = ctx.createGain();
    roomLevel.gain.value = 0.55;
    this.reverb.connect(room).connect(roomLevel).connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = SFX_LEVEL;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC_LEVEL;
    this.musicBus.connect(this.master);
    const musicRoom = ctx.createGain();
    musicRoom.gain.value = 0.18;
    this.musicBus.connect(musicRoom).connect(this.reverb);

    this.white = noiseBuffer(ctx, false);
    this.brown = noiseBuffer(ctx, true);
    return ctx;
  }

  /** Call from a tap or click: starts the audio context and any music that was waiting. */
  resume() {
    const ctx = this.ensure();
    if (ctx?.state === "suspended") void ctx.resume();
    if (this.track && !this.timer) this.startScheduler();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(PREF, muted ? "1" : "0");
    } catch {
      // private window: the choice just won't be remembered
    }
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  // ------------------------------------------------------------------ building blocks
  /**
   * Where a sound comes from: a gain that feeds the effects bus through a panner (-1 left to 1 right) and sends `wet`
   * of itself to the room. It is let go after `life` seconds, when everything plugged into it has finished.
   */
  private place(pan = 0, wet = 0.15, life = 2): { input: GainNode; panner: StereoPannerNode } {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    input.connect(panner).connect(this.sfxBus);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      panner.connect(send).connect(this.reverb);
    }
    window.setTimeout(() => input.disconnect(), (life + 0.5) * 1000);
    return { input, panner };
  }

  /** A filter for a layer, sweeping from `from` to `to` Hz over `dur`. */
  private sweep(type: BiquadFilterType, from: number, to: number | undefined, q: number | undefined, t: number, dur: number): BiquadFilterNode {
    const filter = this.ctx!.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    if (to !== undefined && to !== from) filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    if (q !== undefined) filter.Q.value = q;
    return filter;
  }

  /** A soft distortion, for the crunch of a blast or the bite of a laser. */
  private crunch(): WaveShaperNode {
    const shaper = this.ctx!.createWaveShaper();
    shaper.curve = this.crunchCurve;
    shaper.oversample = "2x";
    return shaper;
  }

  /** An envelope: silent, up to `gain` in `attack`, then an exponential fade to silence at `dur`. */
  private envelope(t: number, dur: number, gain: number, attack: number): GainNode {
    const env = this.ctx!.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(attack, dur * 0.9));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return env;
  }

  /** A burst of noise: the crack of a shot, the roar of a blast, the rumble of something rolling. */
  private hiss(t: number, dur: number, gain: number, dest: AudioNode, o: HissOpts) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = o.buffer === "brown" ? this.brown : this.white;
    let node: AudioNode = src.connect(this.sweep(o.filter, o.from, o.to, o.q, t, dur));
    if (o.crunch) node = node.connect(this.crunch());
    node.connect(this.envelope(t, dur, gain, o.attack ?? 0.002)).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** An oscillator note gliding from `f0` to `f1`: the thump of a blast, the body of a laser, a note of the music. */
  private voice(type: OscillatorType, f0: number, f1: number, t: number, dur: number, gain: number, dest: AudioNode, o: VoiceOpts = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    let node: AudioNode = osc;
    if (o.filter) node = node.connect(this.sweep(o.filter, o.from ?? 1000, o.to, o.q, t, dur));
    if (o.crunch) node = node.connect(this.crunch());
    node.connect(this.envelope(t, dur, gain, o.attack ?? 0.004)).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A gunshot: the crack of the round, the body of the blast through the barrel, a thump and a short tail in the room. */
  private gun(t: number, out: AudioNode, gain: number, crack: number, body: number, thump: [number, number], len: number, tail: number) {
    this.hiss(t, vary(0.022, 0.3), gain * 0.55, out, { filter: "highpass", from: vary(crack) });
    this.hiss(t, len, gain * 0.75, out, { filter: "bandpass", from: vary(body), to: body * 0.55, q: 0.9 });
    this.voice("sine", vary(thump[0], 0.06), thump[1], t, len * 1.1, gain * 0.6, out);
    if (tail) this.hiss(t + 0.008, tail, gain * 0.2, out, { buffer: "brown", filter: "lowpass", from: 900, to: 160 });
  }

  /** A few tiny cracks scattered over `spread` seconds: debris landing, fire crackling, ice snapping. */
  private ticks(t: number, n: number, spread: number, gain: number, out: AudioNode, freq: number) {
    for (let k = 0; k < n; k++) this.hiss(t + Math.random() * spread, vary(0.012, 0.5), gain * vary(1, 0.4), out, { filter: "highpass", from: vary(freq, 0.2) });
  }

  // ------------------------------------------------------------------ effects
  /**
   * Play one effect now. `power` (0 to 1) scales the loudness of the ones that depend on the size of the squad or the
   * blast; `pan` (-1 left to 1 right) is where on the road it happens.
   */
  sfx(name: SfxName, power = 1, pan = 0) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const v = 0.35 + 0.65 * power;
    switch (name) {
      case "pistol":
        this.gun(t, this.place(pan, 0.12, 0.6).input, 0.5 * v, 5200, 1700, [170, 70], 0.07, 0.16);
        break;
      case "rifle":
        this.gun(t, this.place(pan, 0.15, 0.8).input, 0.55 * v, 4300, 1150, [135, 50], 0.1, 0.3);
        break;
      case "smg":
        this.gun(t, this.place(pan, 0.12, 0.6).input, 0.5 * v, 5600, 1500, [150, 62], 0.06, 0.14);
        break;
      case "minigun": {
        const out = this.place(pan, 0.12, 0.6).input;
        this.gun(t, out, 0.52 * v, 4800, 1050, [125, 52], 0.05, 0.12);
        // the barrels spinning
        this.voice("sawtooth", 96, 90, t, 0.07, 0.08 * v, out, { filter: "lowpass", from: 700 });
        break;
      }
      case "moto":
        this.gun(t, this.place(pan, 0.12, 0.6).input, 0.4, 5000, 1450, [150, 65], 0.06, 0.12);
        break;
      case "cannon": {
        const out = this.place(pan, 0.4, 2).input;
        this.hiss(t, 0.05, 0.5, out, { filter: "highpass", from: 2400 });
        this.hiss(t, 0.3, 0.55, out, { filter: "bandpass", from: 600, to: 200, q: 0.8, crunch: true });
        this.voice("sine", 95, 28, t, 0.5, 0.9, out);
        this.hiss(t + 0.02, 1.1, 0.35, out, { buffer: "brown", filter: "lowpass", from: 500, to: 80 });
        break;
      }
      case "pop": {
        const out = this.place(pan, 0.08, 0.4).input;
        this.hiss(t, 0.06, 0.42 * v, out, { filter: "bandpass", from: vary(1100), q: 1.3 });
        this.voice("sine", vary(260), 110, t, 0.07, 0.3 * v, out);
        break;
      }
      case "hurt": {
        const out = this.place(pan, 0.1, 0.6).input;
        this.hiss(t, 0.02, 0.3 * v, out, { filter: "highpass", from: 2000 });
        this.hiss(t, 0.16, 0.5 * v, out, { buffer: "brown", filter: "lowpass", from: 900, to: 300 });
        this.voice("sine", 170, 60, t, 0.16, 0.45 * v, out);
        break;
      }
      case "gateGood": {
        const out = this.place(pan, 0.4, 1.5).input;
        [523, 659, 784, 1047].forEach((f, i) => {
          this.voice("sine", f, f, t + i * 0.06, 0.55, 0.16, out, { attack: 0.008 });
          this.voice("triangle", f * 2, f * 2, t + i * 0.06, 0.3, 0.04, out, { attack: 0.008 });
        });
        this.hiss(t, 0.5, 0.05, out, { filter: "highpass", from: 6000, attack: 0.05 });
        break;
      }
      case "gateBad": {
        const out = this.place(pan, 0.25, 1).input;
        this.voice("sawtooth", 220, 92, t, 0.5, 0.22, out, { filter: "lowpass", from: 900, to: 300 });
        this.voice("sine", 110, 50, t, 0.5, 0.4, out);
        this.hiss(t, 0.35, 0.2, out, { buffer: "brown", filter: "lowpass", from: 400 });
        break;
      }
      case "weapon": {
        // the click-clack of a new gun, then a chime
        const out = this.place(pan, 0.2, 1).input;
        this.hiss(t, 0.012, 0.4, out, { filter: "highpass", from: 3500 });
        this.hiss(t + 0.08, 0.012, 0.4, out, { filter: "highpass", from: 3000 });
        this.hiss(t + 0.15, 0.09, 0.35, out, { filter: "bandpass", from: 1300, q: 2 });
        this.voice("sine", 988, 988, t + 0.22, 0.4, 0.12, out);
        this.voice("sine", 1319, 1319, t + 0.28, 0.45, 0.1, out);
        break;
      }
      case "vehicle": {
        // an engine revving up
        const out = this.place(pan, 0.15, 1.2).input;
        this.voice("sawtooth", 55, 150, t, 0.75, 0.28, out, { filter: "lowpass", from: 300, to: 1400, attack: 0.05 });
        this.voice("sawtooth", 56, 152, t, 0.75, 0.2, out, { filter: "lowpass", from: 300, to: 1400, attack: 0.05, detune: 9 });
        this.hiss(t, 0.7, 0.22, out, { buffer: "brown", filter: "lowpass", from: 500, attack: 0.1 });
        break;
      }
      case "recruit": {
        const out = this.place(pan, 0.3, 1).input;
        [440, 554, 659].forEach((f, i) => this.voice("triangle", f, f, t + i * 0.07, 0.3, 0.15, out, { attack: 0.006 }));
        break;
      }
      case "coin": {
        const out = this.place(pan, 0.3, 1).input;
        this.voice("sine", 1319, 1319, t, 0.09, 0.18, out);
        this.voice("sine", 1760, 1760, t + 0.07, 0.4, 0.18, out);
        this.voice("triangle", 880, 880, t + 0.07, 0.3, 0.05, out);
        break;
      }
      case "boom": {
        // the push in the chest, the crack and roar of the blast, the rumble that follows and the debris coming down
        const out = this.place(pan, 0.45, 2.5).input;
        this.voice("sine", vary(80, 0.1), 24, t, 1, 0.95 * v, out);
        this.hiss(t, 0.9, 0.75 * v, out, { filter: "lowpass", from: vary(4000, 0.15), to: 220, crunch: true });
        this.hiss(t, 1.8, 0.7 * v, out, { buffer: "brown", filter: "lowpass", from: 900, to: 90, attack: 0.02 });
        this.ticks(t + 0.1, 7, 0.6, 0.12 * v, out, 3000);
        break;
      }
      case "slam": {
        const out = this.place(pan, 0.5, 2.5).input;
        this.hiss(t, 0.07, 0.5, out, { filter: "highpass", from: 1200 });
        this.voice("sine", 66, 20, t, 1.2, 1.1, out);
        this.hiss(t, 1.6, 0.9, out, { buffer: "brown", filter: "lowpass", from: 500, to: 60, crunch: true });
        this.hiss(t, 0.5, 0.35, out, { filter: "bandpass", from: 320, q: 1 });
        this.ticks(t + 0.15, 6, 0.7, 0.1, out, 2400);
        break;
      }
      case "launch": {
        // the ignition, then the rocket tearing away with a rising whoosh
        const out = this.place(pan, 0.3, 1.5).input;
        this.hiss(t, 0.05, 0.45, out, { filter: "highpass", from: 2500 });
        this.voice("sine", 120, 45, t, 0.22, 0.6, out);
        this.hiss(t, 0.85, 0.55, out, { filter: "bandpass", from: 450, to: 2600, q: 1.4, attack: 0.12 });
        this.hiss(t, 0.95, 0.4, out, { buffer: "brown", filter: "lowpass", from: 700, to: 380, attack: 0.04 });
        break;
      }
      case "roll": {
        // heavy kegs rolling: a rumble that wobbles as they turn over, and a clunk on every turn
        const out = this.place(pan, 0.2, 2.2).input;
        const wobble = ctx.createGain();
        wobble.gain.value = 0.6;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 7.5;
        const depth = ctx.createGain();
        depth.gain.value = 0.4;
        lfo.connect(depth).connect(wobble.gain);
        wobble.connect(out);
        lfo.start(t);
        lfo.stop(t + 2);
        this.hiss(t, 1.9, 0.6, wobble, { buffer: "brown", filter: "lowpass", from: 260, attack: 0.2 });
        for (let k = 0; k < 6; k++) {
          const at = t + 0.1 + k * 0.28 + Math.random() * 0.05;
          this.voice("sine", vary(95), 60, at, 0.1, 0.32, out);
          this.hiss(at, 0.04, 0.16, out, { filter: "bandpass", from: 650, q: 1.5 });
        }
        break;
      }
      case "laser": {
        // a falling, buzzing beam with a sizzle and a thump where it hits
        const out = this.place(pan, 0.35, 1.5).input;
        this.voice("sawtooth", 2600, 140, t, 0.5, 0.3, out, { filter: "bandpass", from: 2200, to: 300, q: 3, crunch: true });
        this.voice("sawtooth", 2640, 143, t, 0.5, 0.22, out, { filter: "bandpass", from: 2200, to: 300, q: 3, crunch: true });
        this.hiss(t, 0.38, 0.28, out, { filter: "highpass", from: 3500 });
        this.voice("sine", 140, 40, t + 0.05, 0.35, 0.55, out);
        break;
      }
      case "freeze": {
        // ice closing in: glassy snaps over a cold hiss, and a dull whoomp underneath
        const out = this.place(pan, 0.45, 1.5).input;
        for (let k = 0; k < 16; k++) {
          const f = 2400 + Math.random() * 3200;
          this.voice("sine", f, f * 0.98, t + Math.random() * 0.45, vary(0.12, 0.4), vary(0.08, 0.4), out, { attack: 0.002 });
        }
        this.hiss(t, 0.7, 0.32, out, { filter: "highpass", from: 6000, to: 2500, attack: 0.03 });
        this.hiss(t, 0.05, 0.3, out, { filter: "bandpass", from: 3200, q: 4 });
        this.voice("sine", 220, 70, t, 0.3, 0.4, out);
        break;
      }
      case "meteor": {
        // something big falling out of the sky: a roar that grows as it comes, the same length as the warning on the road
        const out = this.place(pan, 0.3, 1.8).input;
        this.hiss(t, 1.4, 0.6, out, { buffer: "brown", filter: "lowpass", from: 200, to: 1400, attack: 1.15 });
        this.hiss(t, 1.4, 0.18, out, { filter: "bandpass", from: 800, to: 2400, q: 1, attack: 1.1 });
        this.voice("sine", 1500, 360, t + 0.1, 1.3, 0.1, out, { attack: 0.3 });
        break;
      }
      case "roar": {
        // the boss enraged: a growl of two beating saws through a dirty filter, a breath and a low drone under it
        const out = this.place(pan, 0.4, 2).input;
        this.voice("sawtooth", 84, 70, t, 1.4, 0.28, out, { filter: "lowpass", from: 1000, to: 500, attack: 0.12, crunch: true });
        this.voice("sawtooth", 88, 73, t, 1.4, 0.24, out, { filter: "lowpass", from: 1000, to: 500, attack: 0.12, crunch: true });
        this.hiss(t, 1.3, 0.3, out, { buffer: "brown", filter: "bandpass", from: 450, q: 1.2, attack: 0.1 });
        this.voice("sine", 55, 45, t, 1.4, 0.3, out, { attack: 0.1 });
        break;
      }
      case "crackle": {
        const out = this.place(pan, 0.15, 0.8).input;
        this.ticks(t, 5, 0.35, 0.14 * v, out, 2500);
        this.hiss(t, 0.4, 0.12 * v, out, { buffer: "brown", filter: "lowpass", from: 400, attack: 0.05 });
        break;
      }
      case "warning": {
        // an alarm: three two-tone beeps
        const out = this.place(pan, 0.2, 1).input;
        for (let k = 0; k < 3; k++) {
          const f = k % 2 ? 700 : 880;
          this.voice("triangle", f, f, t + k * 0.16, 0.14, 0.22, out, { attack: 0.01 });
          this.voice("sine", f / 2, f / 2, t + k * 0.16, 0.14, 0.12, out, { attack: 0.01 });
        }
        break;
      }
      case "plane": {
        // the bomber flying over from left to right: an engine drone that drops in pitch as it passes, and the wind of it
        const { input: out, panner } = this.place(-0.8, 0.25, 3);
        panner.pan.setValueAtTime(-0.8, t);
        panner.pan.linearRampToValueAtTime(0.8, t + 2.5);
        this.hiss(t, 2.5, 0.45, out, { buffer: "brown", filter: "lowpass", from: 600, attack: 1 });
        this.voice("sawtooth", 120, 104, t, 2.5, 0.16, out, { filter: "lowpass", from: 700, attack: 1 });
        this.voice("sawtooth", 122.5, 106, t, 2.5, 0.13, out, { filter: "lowpass", from: 700, attack: 1 });
        break;
      }
      case "spikes": {
        // steel: a scrape, a ringing and a thud
        const out = this.place(pan, 0.3, 1).input;
        this.hiss(t, 0.12, 0.4, out, { filter: "highpass", from: 3500 });
        this.hiss(t, 0.4, 0.3, out, { filter: "bandpass", from: 2900, q: 14 });
        this.voice("sine", 140, 60, t, 0.14, 0.35, out);
        break;
      }
      case "win": {
        const out = this.place(0, 0.45, 2.5).input;
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
          this.voice("triangle", f, f, t + i * 0.1, 0.6, 0.18, out, { attack: 0.01 });
          this.voice("sine", f, f, t + i * 0.1, 0.6, 0.1, out, { attack: 0.01 });
        });
        for (const f of [523, 659, 784]) this.voice("sawtooth", f, f, t + 0.55, 1.5, 0.06, out, { filter: "lowpass", from: 1800, attack: 0.05 });
        break;
      }
      case "lose": {
        const out = this.place(0, 0.4, 2.5).input;
        [392, 349, 311, 262].forEach((f, i) => {
          this.voice("sawtooth", f, f, t + i * 0.26, 0.5, 0.16, out, { filter: "lowpass", from: 900, attack: 0.02 });
          this.voice("sine", f, f, t + i * 0.26, 0.5, 0.1, out, { attack: 0.02 });
        });
        this.voice("sine", 131, 120, t + 1, 1.5, 0.25, out, { attack: 0.1 });
        break;
      }
    }
  }

  // ------------------------------------------------------------------ music
  /**
   * Switch to `track` (no-op if it is already playing), or stop the music with null. A track that is playing fades out
   * before the new one starts on its first beat.
   */
  playMusic(track: TrackName | null) {
    if (track === null) return this.stopMusic();
    if (this.track === track && this.timer) return;
    const ctx = this.ctx;
    const playing = !!ctx && !!this.timer;
    this.stopMusic();
    this.track = track;
    this.fury = false;
    this.step = 0;
    if (!this.ensure()) return;
    if (!playing) {
      this.startScheduler();
      return;
    }
    this.musicBus.gain.setTargetAtTime(0.0001, this.ctx!.currentTime, CROSSFADE_S / 4);
    window.setTimeout(() => {
      if (this.track !== track) return;
      this.musicBus.gain.setTargetAtTime(MUSIC_LEVEL, this.ctx!.currentTime, 0.05);
      // a tap may have woken the audio (and the new track) during the fade
      if (!this.timer) this.startScheduler();
    }, CROSSFADE_S * 1000);
  }

  /** The boss is enraged (or calm again): its track adds (or drops) its heavier layer. */
  setFury(on: boolean) {
    this.fury = on;
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.track = null;
  }

  private startScheduler() {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    this.nextTime = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), SCHEDULER_MS);
    this.schedule();
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.track || ctx.state !== "running") return;
    const bpm = this.track === "battle" ? BATTLE.bpm : this.track === "boss" ? BOSS.bpm : MENU.bpm;
    const sixteenth = 60 / bpm / 4;
    // if the tab slept, don't try to play the backlog
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      if (this.track === "battle") this.battleStep(this.step, this.nextTime, sixteenth);
      else if (this.track === "boss") this.bossStep(this.step, this.nextTime, sixteenth);
      else this.menuStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  // the drum kit and the instruments, all on the music bus
  private kick(t: number, gain: number) {
    this.voice("sine", 150, 42, t, 0.24, gain, this.musicBus);
    this.hiss(t, 0.01, gain * 0.25, this.musicBus, { filter: "highpass", from: 3000 });
  }

  private snare(t: number, gain: number) {
    this.hiss(t, 0.17, gain * 0.7, this.musicBus, { filter: "bandpass", from: 1900, q: 0.6 });
    this.voice("triangle", 200, 165, t, 0.09, gain * 0.4, this.musicBus);
  }

  private hat(t: number, gain: number, open = false) {
    this.hiss(t, open ? 0.13 : 0.035, gain, this.musicBus, { filter: "highpass", from: 8000 });
  }

  private tom(t: number, f: number, gain: number) {
    this.voice("sine", f, f * 0.6, t, 0.3, gain, this.musicBus);
    this.hiss(t, 0.08, gain * 0.25, this.musicBus, { buffer: "brown", filter: "lowpass", from: 700 });
  }

  /** A warm bass: two detuned saws under a low filter that closes as the note goes on. */
  private bass(t: number, note: number, dur: number, gain: number) {
    const f = midiToHz(note);
    this.voice("sawtooth", f, f, t, dur, gain, this.musicBus, { filter: "lowpass", from: 900, to: 380 });
    this.voice("sawtooth", f, f, t, dur, gain * 0.7, this.musicBus, { filter: "lowpass", from: 900, to: 380, detune: 7 });
  }

  /** Slow chords: each note two detuned saws behind a soft filter, fading in. */
  private pad(t: number, notes: number[], dur: number, gain: number) {
    for (const n of notes) {
      const f = midiToHz(n);
      this.voice("sawtooth", f, f, t, dur, gain, this.musicBus, { filter: "lowpass", from: 1100, attack: dur * 0.3, detune: -6 });
      this.voice("sawtooth", f, f, t, dur, gain, this.musicBus, { filter: "lowpass", from: 1100, attack: dur * 0.3, detune: 6 });
    }
  }

  /** A plucked note: a triangle with a fast decay and a quiet octave above. */
  private pluck(t: number, note: number, dur: number, gain: number) {
    const f = midiToHz(note);
    this.voice("triangle", f, f, t, dur, gain, this.musicBus);
    this.voice("sine", f * 2, f * 2, t, dur * 0.5, gain * 0.25, this.musicBus);
  }

  /** The lead line: a saw and a triangle together through a bright filter. */
  private lead(t: number, note: number, dur: number, gain: number) {
    const f = midiToHz(note);
    this.voice("sawtooth", f, f, t, dur, gain * 0.6, this.musicBus, { filter: "lowpass", from: 2600, to: 1400 });
    this.voice("triangle", f, f, t, dur, gain, this.musicBus);
  }

  /** A brass stab for the boss: detuned saws through a filter that snaps open and shuts. */
  private stab(t: number, notes: number[], gain: number) {
    for (const n of notes) {
      const f = midiToHz(n);
      this.voice("sawtooth", f, f, t, 0.28, gain, this.musicBus, { filter: "lowpass", from: 2600, to: 450, detune: -8 });
      this.voice("sawtooth", f, f, t, 0.28, gain, this.musicBus, { filter: "lowpass", from: 2600, to: 450, detune: 8 });
    }
  }

  private menuStep(step: number, t: number, dur: number) {
    const bar = Math.floor(step / 16) % MENU.roots.length;
    const i = step % 16;
    const root = MENU.roots[bar];
    if (i === 0) {
      this.pad(t, MENU.chord.map((n) => root + n), dur * 16, 0.07);
      this.bass(t, root - 12, dur * 14, 0.22);
    }
    if (i % 2 === 0) this.pluck(t, root + 12 + MENU.arp[(i / 2) % MENU.arp.length], dur * 3, 0.13);
    if (i === 8) this.hat(t, 0.04, true);
  }

  private battleStep(step: number, t: number, dur: number) {
    const bar = Math.floor(step / 16) % BATTLE.roots.length;
    const i = step % 16;
    const root = BATTLE.roots[bar];
    if (i === 0) this.pad(t, BATTLE.chord.map((n) => root + 12 + n), dur * 16, 0.035);
    if (i % 2 === 0) this.bass(t, root - 12 + BATTLE.bass[i / 2], dur * 1.8, 0.28);
    const lead = BATTLE.lead[bar][i];
    if (lead !== null) this.lead(t, root + lead, dur * 1.6, 0.11);
    if (i % 4 === 0) this.kick(t, 0.8);
    if (i === 4 || i === 12) this.snare(t, 0.4);
    if (i % 2 === 0) this.hat(t, i % 4 === 2 ? 0.1 : 0.06);
  }

  private bossStep(step: number, t: number, dur: number) {
    const bar = Math.floor(step / 16) % BOSS.roots.length;
    const i = step % 16;
    const root = BOSS.roots[bar];
    const fury = this.fury;
    if (i === 0) this.pad(t, [root + 12, root + 13, root + 19], dur * 16, 0.03);
    this.bass(t, root - 12 + BOSS.ostinato[i] + (fury && i % 4 === 2 ? 12 : 0), dur * 0.9, 0.24);
    // the kick doubles up when the boss is enraged
    if (i % 4 === 0 || (i % 4 === 3 && i !== 15) || (fury && i % 2 === 0)) this.kick(t, 0.85);
    if (i === 4 || i === 12) this.snare(t, 0.45);
    if (fury ? true : i % 2 === 0) this.hat(t, i % 4 === 2 ? 0.09 : 0.05);
    if (i === 2 || i === 10 || (fury && (i === 6 || i === 14))) this.stab(t, BOSS.stab.map((n) => root + 24 + n), 0.05);
    // a roll of toms into the next round of the loop
    if (bar === 3 && i >= 12) this.tom(t, [180, 150, 120, 95][i - 12], 0.4);
  }
}

/** A soft-clipping curve: `drive` is how hard it bends the loud parts. */
function tanhCurve(drive: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * drive);
  return curve;
}

/** Two seconds of noise: white, or brown (each sample a little walk from the last), which rumbles. */
function noiseBuffer(ctx: BaseAudioContext, brown: boolean): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (!brown) data[i] = white;
    else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

/** The response of a room: `seconds` of stereo noise fading out, a little darker as it goes, for the reverb. */
function roomImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      const fade = (1 - i / length) ** 3;
      // high frequencies die first: the noise is smoothed more as the tail goes on
      smooth += (Math.random() * 2 - 1 - smooth) * (0.9 - 0.75 * (i / length));
      data[i] = smooth * fade;
    }
  }
  return impulse;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(PREF) === "1";
  } catch {
    return false;
  }
}

export const audio = new AudioEngine();
