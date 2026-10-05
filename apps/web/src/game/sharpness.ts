/** the picture is never drawn with more than this many pixels per CSS pixel, however dense the screen */
const SHARPEST = 2;
/** nor with fewer than this: softer than one pixel per CSS pixel the cost is no longer in the pixels */
const SOFTEST = 1;
/** each step keeps this share of the pixels along each side: three steps take a dense screen from 2 to 1 */
const STEP = 0.5 ** (1 / 3);
/** the frames of this many seconds are averaged before deciding anything */
const WINDOW = 1;
/** an average frame longer than this is a device that is struggling (seconds): about 45 frames per second */
const SLOW_FRAME = 1 / 45;
/** and one shorter than this has time to spare (seconds): about 57 frames per second */
const SPARE_FRAME = 1 / 57;
/** a frame this long is a hidden tab or a hiccup, not the pace of the device (seconds) */
const HICCUP = 0.2;
/** how long a new scene is left alone: its first frames compile shaders (seconds) */
const WARM_UP = 1.5;
/** how long the frames must have time to spare before the picture gets sharper again (seconds), at first and at most */
const PATIENCE = 4;
const MOST_PATIENCE = 60;
/** a sharper picture that has to be taken back within this long was a step too far (seconds) */
const TOO_SOON = 20;

/**
 * Keeps a run smooth on a slow phone by drawing fewer pixels: when the frames take too long the picture gets a step
 * softer, and after a while of frames to spare it gets a step sharper again. Every time a sharper picture has to be
 * taken back, it waits twice as long before trying again, so a phone that cannot keep up settles instead of going
 * back and forth, while a passing slowdown is undone in a few seconds. What it learns lasts from one level to the
 * next (not across visits: a phone can be slow just today).
 */
class Sharpness {
  private ratio = 0;
  private patience = PATIENCE;
  /** seconds since the picture last got sharper */
  private sinceSharper = Infinity;
  private spare = 0;
  private time = 0;
  private frames = 0;
  private wait = 0;

  /** A scene is starting: the pixels per CSS pixel to draw it with. */
  start(): number {
    const top = Math.min(window.devicePixelRatio || 1, SHARPEST);
    this.ratio = this.ratio ? Math.min(this.ratio, top) : top;
    this.restart(WARM_UP);
    return this.ratio;
  }

  private restart(wait: number) {
    this.time = this.frames = 0;
    this.wait = wait;
  }

  /** Count one frame that took `dt` seconds. Returns the new pixels per CSS pixel when it is time to change, else null. */
  frame(dt: number): number | null {
    if (dt >= HICCUP) return null;
    this.sinceSharper += dt;
    if (this.wait > 0) {
      this.wait -= dt;
      return null;
    }
    this.time += dt;
    this.frames++;
    if (this.time < WINDOW) return null;
    const average = this.time / this.frames;
    this.time = this.frames = 0;

    const top = Math.min(window.devicePixelRatio || 1, SHARPEST);
    const softer = Math.max(Math.min(SOFTEST, top), this.ratio * STEP);
    const sharper = Math.min(top, this.ratio / STEP);
    // a step smaller than this is no step: the picture is already as soft, or as sharp, as it gets
    const real = 0.01;
    if (average > SLOW_FRAME && this.ratio - softer > real) {
      if (this.sinceSharper < TOO_SOON) this.patience = Math.min(MOST_PATIENCE, this.patience * 2);
      this.spare = 0;
      return this.change(softer);
    }
    this.spare = average < SPARE_FRAME ? this.spare + WINDOW : 0;
    if (this.spare >= this.patience && sharper - this.ratio > real) {
      this.spare = 0;
      this.sinceSharper = 0;
      return this.change(sharper);
    }
    return null;
  }

  private change(ratio: number): number {
    this.ratio = ratio;
    // resizing the picture costs a frame or two: do not count them
    this.restart(0.3);
    return ratio;
  }
}

/** The one the game uses. */
export const sharpness = new Sharpness();
