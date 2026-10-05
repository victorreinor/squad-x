/**
 * All the sound is made on the spot with Web Audio, so the game ships no audio files: effects are short oscillator
 * and noise bursts, and the music is a small step sequencer. Browsers only start audio after a tap, so nothing plays
 * until `resume()` is called from one.
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
  | "plane"
  | "spikes"
  | "win"
  | "lose";

export type TrackName = "menu" | "battle";

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Chord roots of the battle loop, one per bar, and the lead melody as semitones above the root (null = rest). */
const BATTLE = {
  bpm: 150,
  roots: [45, 41, 48, 43],
  bass: [0, 0, 12, 0, 0, 7, 0, 12],
  lead: [
    [12, null, 15, null, 19, null, 15, null, 12, null, 15, 19, 24, null, 19, null],
    [12, null, 17, null, 21, null, 17, null, 12, null, 17, 21, 24, null, 21, null],
    [12, null, 16, null, 19, null, 16, null, 12, null, 16, 19, 24, null, 19, 16],
    [14, null, 17, null, 19, null, 17, null, 14, null, 19, 23, 26, null, 23, 19],
  ] as (number | null)[][],
};
/** A calmer loop for the menu: just the bass and a slow arpeggio. */
const MENU = { bpm: 96, roots: [48, 53, 55, 53], arp: [0, 7, 12, 16, 12, 7, 0, 7] };

const LOOKAHEAD_S = 0.25;
const SCHEDULER_MS = 80;
const PREF = "squad-x:muted";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private track: TrackName | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
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
    // a soft clipper at the very end: loud sounds that pile up saturate a little instead of crackling
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 1.6);
    shaper.curve = curve;
    this.master.connect(shaper).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.16;
    this.musicBus.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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
  /** An oscillator note with a quick attack and a decay to silence. */
  private tone(type: OscillatorType, freq: number, t: number, dur: number, gain: number, bus: AudioNode) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A note whose pitch glides from `f0` to `f1`: the body of a thump or a laser. */
  private slide(type: OscillatorType, f0: number, f1: number, t: number, dur: number, gain: number, bus: AudioNode) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A burst of filtered noise: hats, snares, the crack of a shot and the rumble of a blast. */
  private noiseHit(t: number, dur: number, freq: number, gain: number, bus: AudioNode, type: BiquadFilterType = "highpass") {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(bus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------------ effects
  /** Play one effect now. `power` (0 to 1) scales the loudness of the ones that depend on the size of the squad. */
  sfx(name: SfxName, power = 1) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const bus = this.sfxBus;
    const v = 0.35 + 0.65 * power;
    switch (name) {
      case "pistol":
        this.slide("square", 900, 320, t, 0.05, 0.1 * v, bus);
        this.noiseHit(t, 0.02, 5000, 0.07 * v, bus);
        break;
      case "rifle":
        this.slide("sawtooth", 700, 180, t, 0.06, 0.12 * v, bus);
        this.noiseHit(t, 0.03, 3500, 0.1 * v, bus);
        break;
      case "smg":
        this.slide("square", 620, 240, t, 0.04, 0.1 * v, bus);
        this.noiseHit(t, 0.02, 4500, 0.09 * v, bus);
        break;
      case "minigun":
        this.slide("sawtooth", 480, 120, t, 0.045, 0.12 * v, bus);
        this.noiseHit(t, 0.03, 2500, 0.12 * v, bus, "bandpass");
        break;
      case "moto":
        this.slide("square", 1100, 500, t, 0.05, 0.08, bus);
        break;
      case "cannon":
        this.slide("sine", 190, 45, t, 0.28, 0.5, bus);
        this.noiseHit(t, 0.2, 900, 0.3, bus, "lowpass");
        break;
      case "pop":
        this.slide("triangle", 460, 110, t, 0.08, 0.16, bus);
        this.noiseHit(t, 0.03, 3200, 0.07, bus);
        break;
      case "hurt":
        this.slide("sawtooth", 240, 80, t, 0.16, 0.22, bus);
        this.noiseHit(t, 0.08, 800, 0.15, bus, "lowpass");
        break;
      case "gateGood":
        [523, 659, 784, 1047].forEach((f, i) => this.tone("triangle", f, t + i * 0.055, 0.14, 0.2, bus));
        break;
      case "gateBad":
        this.slide("sawtooth", 320, 80, t, 0.32, 0.26, bus);
        this.noiseHit(t, 0.2, 500, 0.2, bus, "lowpass");
        break;
      case "weapon":
        this.noiseHit(t, 0.03, 2500, 0.25, bus);
        this.noiseHit(t + 0.09, 0.03, 2000, 0.25, bus);
        this.tone("square", 220, t + 0.14, 0.12, 0.18, bus);
        this.tone("square", 330, t + 0.2, 0.2, 0.18, bus);
        break;
      case "vehicle":
        this.slide("sawtooth", 70, 260, t, 0.5, 0.26, bus);
        this.noiseHit(t, 0.4, 500, 0.15, bus, "lowpass");
        break;
      case "recruit":
        [440, 554, 659].forEach((f, i) => this.tone("square", f, t + i * 0.06, 0.1, 0.16, bus));
        break;
      case "coin":
        this.tone("sine", 1319, t, 0.07, 0.22, bus);
        this.tone("sine", 1760, t + 0.07, 0.2, 0.22, bus);
        break;
      case "boom":
        this.slide("sine", 130, 32, t, 0.6, 0.9, bus);
        this.noiseHit(t, 0.5, 700, 0.55, bus, "lowpass");
        break;
      case "warning":
        [0, 0.18, 0.36].forEach((d) => this.tone("square", 760, t + d, 0.1, 0.16, bus));
        break;
      case "plane":
        // a droning bomber: two detuned saws sliding down, with a rush of air
        this.slide("sawtooth", 150, 88, t, 1.6, 0.14, bus);
        this.slide("sawtooth", 156, 92, t, 1.6, 0.12, bus);
        this.noiseHit(t, 1.4, 700, 0.18, bus, "bandpass");
        break;
      case "spikes":
        this.noiseHit(t, 0.12, 4500, 0.3, bus);
        this.slide("square", 520, 140, t, 0.2, 0.2, bus);
        break;
      case "slam":
        this.slide("sine", 110, 28, t, 0.7, 1, bus);
        this.noiseHit(t, 0.6, 600, 0.7, bus, "lowpass");
        this.noiseHit(t, 0.12, 2500, 0.3, bus);
        break;
      case "win":
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone("triangle", f, t + i * 0.1, 0.3, 0.26, bus));
        [523, 659, 784].forEach((f) => this.tone("square", f, t + 0.55, 0.7, 0.1, bus));
        break;
      case "lose":
        [392, 349, 311, 262].forEach((f, i) => this.tone("sawtooth", f, t + i * 0.24, 0.4, 0.2, bus));
        break;
    }
  }

  // ------------------------------------------------------------------ music
  /** Switch to `track` (no-op if it is already playing), or stop the music with null. */
  playMusic(track: TrackName | null) {
    if (track === null) return this.stopMusic();
    if (this.track === track && this.timer) return;
    this.stopMusic();
    this.track = track;
    this.step = 0;
    if (this.ensure()) this.startScheduler();
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
    const sixteenth = 60 / (this.track === "battle" ? BATTLE.bpm : MENU.bpm) / 4;
    // if the tab slept, don't try to play the backlog
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      if (this.track === "battle") this.battleStep(this.step, this.nextTime, sixteenth);
      else this.menuStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  private battleStep(step: number, t: number, dur: number) {
    const bar = Math.floor(step / 16) % BATTLE.roots.length;
    const i = step % 16;
    const root = BATTLE.roots[bar];
    const bus = this.musicBus;
    // driving eighth-note bass
    if (i % 2 === 0) this.tone("sawtooth", midiToHz(root + BATTLE.bass[i / 2]), t, dur * 1.7, 0.5, bus);
    const lead = BATTLE.lead[bar][i];
    if (lead !== null) {
      this.tone("square", midiToHz(root + lead), t, dur * 1.5, 0.2, bus);
      this.tone("square", midiToHz(root + lead) * 1.006, t, dur * 1.5, 0.14, bus);
    }
    if (i % 4 === 0) this.slide("sine", 160, 42, t, 0.16, 0.85, bus);
    if (i === 4 || i === 12) this.noiseHit(t, 0.11, 1800, 0.3, bus);
    if (i % 2 === 0) this.noiseHit(t, 0.03, 7500, i % 4 === 2 ? 0.12 : 0.07, bus);
  }

  private menuStep(step: number, t: number, dur: number) {
    const bar = Math.floor(step / 16) % MENU.roots.length;
    const i = step % 16;
    const root = MENU.roots[bar];
    const bus = this.musicBus;
    if (i % 8 === 0) this.tone("triangle", midiToHz(root - 12), t, dur * 7, 0.7, bus);
    if (i % 2 === 0) this.tone("triangle", midiToHz(root + MENU.arp[(i / 2) % MENU.arp.length]), t, dur * 3, 0.32, bus);
    if (i === 0 || i === 8) this.slide("sine", 110, 48, t, 0.12, 0.4, bus);
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(PREF) === "1";
  } catch {
    return false;
  }
}

export const audio = new AudioEngine();
