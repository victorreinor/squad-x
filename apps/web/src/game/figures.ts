import * as THREE from "three";
import type { BossKind, EnemyKind, WeaponKind } from "@squadx/engine";
import type { FigureSpec, PartSpec, Role } from "./crowd";
import { BOSS_NAME } from "./names";

/**
 * Every character of the game, built from simple shapes. A figure stands with its feet at the origin, about 1.35 tall,
 * facing -z; the game turns it around for enemies. Pieces are listed by role so the limbs can swing when it runs.
 */

export type V3 = [number, number, number];
export interface Opt {
  role?: Role;
  rot?: V3;
  scale?: V3;
  glow?: boolean;
  ink?: boolean;
  skip?: PartSpec["skip"];
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();

/** Move, turn and stretch a shape into body space. */
function place(geo: THREE.BufferGeometry, at: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
  M.compose(new THREE.Vector3(...at), Q.setFromEuler(E.set(...rot)), new THREE.Vector3(...scale));
  geo.applyMatrix4(M);
  return geo;
}

const part = (geo: THREE.BufferGeometry, at: V3, color: number, o: Opt): PartSpec => ({ geo: place(geo, at, o.rot, o.scale), color, role: o.role ?? "static", glow: o.glow, ink: o.ink, skip: o.skip });

/**
 * How far a round shape may stray from the true curve (body units). 0 keeps the number of sides each shape was written
 * with, which is what the gallery wants: there a figure fills the screen. In a run a figure is a few dozen pixels
 * tall, so a shape only needs the sides that keep it within the slack: eyes, hands and spikes get a fraction of the
 * triangles, while helmets and heads keep nearly all of theirs.
 */
let slack = 0;

/** Build figures with their round shapes cut for `value` of slack (see `slack`). */
export function cut<T>(value: number, build: () => T): T {
  const before = slack;
  slack = value;
  try {
    return build();
  } finally {
    slack = before;
  }
}

/** How many sides a round shape of radius `r` gets: the `written` number, or fewer when fewer stay within the slack. */
function sides(r: number, written: number, least = 5): number {
  if (!slack) return written;
  const needed = Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - slack / r)));
  return Math.max(Math.min(least, written), Math.min(written, needed));
}

/** the radius a shape ends up with once `scale` stretches it */
const stretched = (r: number, o: Opt) => r * Math.max(...(o.scale ?? [1]).map(Math.abs));

/** a box: width, height, depth */
export const B = (size: V3, at: V3, color: number, o: Opt = {}) => part(new THREE.BoxGeometry(...size), at, color, o);
/** a sphere, or an egg with `scale` */
export const S = (r: number, at: V3, color: number, o: Opt = {}) => {
  const around = sides(stretched(r, o), 14);
  return part(new THREE.SphereGeometry(r, around, Math.max(3, Math.round(around * 0.7))), at, color, o);
};
/** a cylinder along y (use `rot` to lay it down): top radius, bottom radius, height */
export const C = (rt: number, rb: number, h: number, at: V3, color: number, o: Opt = {}) => part(new THREE.CylinderGeometry(rt, rb, h, sides(stretched(Math.max(rt, rb), o), 12)), at, color, o);
/** a cone pointing up: radius, height */
export const K = (r: number, h: number, at: V3, color: number, o: Opt = {}) => part(new THREE.ConeGeometry(r, h, sides(stretched(r, o), 10, 4)), at, color, o);
/** the top of a sphere: helmets, hoods */
export const H = (r: number, at: V3, color: number, o: Opt = {}) => {
  const around = sides(stretched(r, o), 16);
  return part(new THREE.SphereGeometry(r, around, Math.max(3, Math.round(around * 0.6)), 0, Math.PI * 2, 0, Math.PI * 0.55), at, color, o);
};
/** a capsule: torsos */
export const CAP = (r: number, len: number, at: V3, color: number, o: Opt = {}) => {
  const around = sides(stretched(r, o), 10);
  return part(new THREE.CapsuleGeometry(r, len, Math.max(2, Math.round(around * 0.4)), around), at, color, o);
};

/** a torus lying with its hole along x (a wheel seen from the side): ring radius, tube radius */
export const T = (r: number, tube: number, at: V3, color: number, o: Opt = {}) => part(new THREE.TorusGeometry(r, tube, sides(tube, 10), sides(r, 20, 8)), at, color, { ...o, rot: o.rot ?? [0, Math.PI / 2, 0] });

export const PI = Math.PI;
/** a cylinder lying along z, pointing at the enemy */
export const alongZ: V3 = [PI / 2, 0, 0];

const PIVOTS: FigureSpec["pivots"] = { legL: [-0.1, 0.5, 0], legR: [0.1, 0.5, 0], armL: [-0.27, 1, 0], armR: [0.27, 1, 0] };

// ------------------------------------------------------------------ weapons

/** The pieces of a weapon, placed where the squad holds it: out in front, at about chest height. */
export function weaponParts(weapon: WeaponKind): PartSpec[] {
  const steel = 0x2b2f3a;
  const wood = 0x8a5a2e;
  const hand = 0xf0c09a;
  const g = { role: "gun" as Role };
  if (weapon === "pistol") {
    return [
      B([0.05, 0.065, 0.22], [0.04, 0.9, -0.42], steel, g),
      B([0.045, 0.12, 0.06], [0.04, 0.83, -0.35], 0x3a3f4c, { ...g, rot: [-0.25, 0, 0] }),
      C(0.016, 0.016, 0.1, [0.04, 0.9, -0.58], 0x1a1c22, { ...g, rot: alongZ }),
      S(0.06, [0.04, 0.86, -0.36], hand, { ...g, skip: "fine" }),
    ];
  }
  if (weapon === "smg") {
    return [
      B([0.07, 0.1, 0.28], [0.04, 0.9, -0.38], 0x3a4a68, g),
      B([0.05, 0.22, 0.07], [0.04, 0.76, -0.4], steel, g),
      C(0.022, 0.022, 0.26, [0.04, 0.91, -0.64], steel, { ...g, rot: alongZ }),
      C(0.04, 0.04, 0.2, [0.04, 0.91, -0.78], 0x1a1c22, { ...g, rot: alongZ }),
      B([0.05, 0.05, 0.2], [0.04, 0.9, -0.1], steel, g),
      B([0.05, 0.08, 0.05], [0.04, 0.83, -0.28], steel, { ...g, skip: "fine" }),
      S(0.06, [0.04, 0.84, -0.3], hand, { ...g, skip: "fine" }),
    ];
  }
  if (weapon === "minigun") {
    const barrels: PartSpec[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      barrels.push(C(0.017, 0.017, 0.5, [0.04 + Math.cos(a) * 0.05, 0.92 + Math.sin(a) * 0.05, -0.8], 0x4a4f5c, { ...g, rot: alongZ }));
    }
    return [
      C(0.09, 0.09, 0.34, [0.04, 0.92, -0.42], 0x3a3f4c, { ...g, rot: alongZ }),
      C(0.075, 0.075, 0.04, [0.04, 0.92, -0.6], 0xd8a420, { ...g, rot: alongZ }),
      C(0.075, 0.075, 0.04, [0.04, 0.92, -1.0], 0xd8a420, { ...g, rot: alongZ }),
      ...barrels,
      B([0.16, 0.16, 0.16], [0.04, 0.76, -0.3], 0xd8a420, g),
      B([0.04, 0.12, 0.05], [0.04, 0.82, -0.12], steel, { ...g, skip: "fine" }),
      S(0.06, [0.04, 0.84, -0.3], hand, { ...g, skip: "fine" }),
    ];
  }
  // rifle
  return [
    B([0.07, 0.1, 0.34], [0.04, 0.9, -0.32], steel, g),
    C(0.022, 0.022, 0.5, [0.04, 0.92, -0.72], steel, { ...g, rot: alongZ }),
    B([0.08, 0.09, 0.22], [0.04, 0.9, -0.58], wood, g),
    B([0.07, 0.14, 0.22], [0.04, 0.86, -0.06], wood, g),
    B([0.05, 0.17, 0.07], [0.04, 0.78, -0.36], steel, { ...g, rot: [0.3, 0, 0] }),
    B([0.03, 0.05, 0.03], [0.04, 0.97, -0.52], 0x1a1c22, { ...g, skip: "fine" }),
    S(0.06, [0.04, 0.85, -0.52], hand, { ...g, skip: "fine" }),
  ];
}

// ------------------------------------------------------------------ faces

/** An angry face on a head whose centre is at `(0, y, 0)` with the given radius: eyes, brows, a mouth, maybe teeth. */
function angryFace(y: number, r: number, eye: number, o: { teeth?: boolean; mouth?: number; brow?: number } = {}): PartSpec[] {
  const front = -r * 0.92;
  const parts: PartSpec[] = [];
  for (const side of [-1, 1]) {
    parts.push(S(r * 0.24, [side * r * 0.4, y + r * 0.12, front], 0xffffff));
    parts.push(S(r * 0.13, [side * r * 0.4, y + r * 0.1, front - r * 0.12], eye, { glow: true, ink: false }));
    parts.push(B([r * 0.56, r * 0.16, r * 0.2], [side * r * 0.42, y + r * 0.5, front + r * 0.05], 0x1a1216, { rot: [0, 0, -side * (o.brow ?? 0.5)], ink: false }));
  }
  parts.push(B([r * (o.mouth ?? 0.62), r * 0.24, r * 0.16], [0, y - r * 0.4, front + r * 0.05], 0x2a0e12, { ink: false }));
  if (o.teeth) {
    for (const x of [-0.2, -0.07, 0.07, 0.2]) parts.push(B([r * 0.1, r * 0.16, r * 0.08], [x * r * 1.2, y - r * 0.3, front - r * 0.02], 0xfff4dc, { ink: false }));
  }
  return parts;
}

/** The legs and boots, in `pants` and `boots` colours; `w` is how thick they are. */
function legs(pants: number, boots: number, w = 1, bare = false): PartSpec[] {
  const parts: PartSpec[] = [];
  for (const [role, x] of [["legL", -0.1], ["legR", 0.1]] as const) {
    parts.push(B([0.17 * w, 0.38, 0.19 * w], [x, 0.31, 0], pants, { role }));
    parts.push(B([0.19 * w, 0.14, 0.28 * w], [x, 0.08, -0.04], bare ? 0xc99a78 : boots, { role }));
  }
  return parts;
}

/** An arm hanging from the shoulder: sleeve and hand. `w` is how thick it is. */
function arms(sleeve: number, skin: number, w = 1, long = 1): PartSpec[] {
  const parts: PartSpec[] = [];
  for (const [role, x] of [["armL", -0.27], ["armR", 0.27]] as const) {
    parts.push(B([0.11 * w, 0.32 * long, 0.11 * w], [x, 1 - 0.18 * long, 0], sleeve, { role }));
    parts.push(S(0.07 * w, [x, 1 - 0.38 * long, 0], skin, { role, skip: "fine" }));
  }
  return parts;
}

// ------------------------------------------------------------------ the squad

/** A soldier seen mostly from behind: big helmet, vest with plates, backpack with a bedroll, belt, boots and a rifle. */
export function soldierFigure(weapon: WeaponKind = "pistol"): FigureSpec {
  const vest = 0x55803a;
  const plates = 0x2f4a26;
  const pack = 0x8c7b4a;
  const skin = 0xf0c09a;
  const parts: PartSpec[] = [
    ...legs(0x4b6b34, 0x2b2622),
    // knee pads
    B([0.15, 0.1, 0.06], [-0.1, 0.38, -0.11], plates, { role: "legL", skip: "front" }),
    B([0.15, 0.1, 0.06], [0.1, 0.38, -0.11], plates, { role: "legR", skip: "front" }),
    // torso: vest, plates front and back, belt and pouches
    CAP(0.23, 0.2, [0, 0.8, 0], vest),
    B([0.36, 0.3, 0.1], [0, 0.84, -0.2], plates, { skip: "front" }),
    B([0.34, 0.3, 0.06], [0, 0.84, 0.23], plates, { skip: "fine" }),
    B([0.52, 0.08, 0.34], [0, 0.56, 0], 0x2d2a22),
    B([0.1, 0.12, 0.08], [-0.17, 0.54, -0.19], pack, { skip: "front" }),
    B([0.1, 0.12, 0.08], [0.17, 0.54, -0.19], pack, { skip: "front" }),
    // backpack with a rolled mat on top: the soldier's signature from behind
    B([0.34, 0.42, 0.22], [0, 0.82, 0.34], pack),
    C(0.1, 0.1, 0.44, [0, 1.1, 0.34], 0x6f6d4a, { rot: [0, 0, PI / 2] }),
    B([0.2, 0.15, 0.08], [0, 0.7, 0.48], plates),
    // a canteen and a shovel strapped to the pack
    C(0.07, 0.07, 0.16, [0.19, 0.7, 0.4], 0x3d5a8a, { rot: [0, 0, PI / 2], skip: "fine" }),
    C(0.02, 0.02, 0.5, [-0.2, 0.8, 0.46], 0x6a4a2a, { skip: "fine" }),
    B([0.12, 0.14, 0.03], [-0.2, 0.52, 0.46], 0x8a8f98, { skip: "fine" }),
    S(0.13, [-0.27, 1, 0], vest),
    S(0.13, [0.27, 1, 0], vest),
    // head and a big helmet with a brim
    C(0.08, 0.09, 0.1, [0, 1.03, 0], skin, { skip: "fine" }),
    S(0.2, [0, 1.15, 0], skin),
    // a determined face for when the soldier is seen from the front
    S(0.03, [-0.075, 1.15, -0.19], 0x1b1b2a, { ink: false, skip: "front" }),
    S(0.03, [0.075, 1.15, -0.19], 0x1b1b2a, { ink: false, skip: "front" }),
    B([0.08, 0.02, 0.03], [-0.075, 1.2, -0.19], 0x3a2a1a, { rot: [0, 0, -0.25], ink: false, skip: "front" }),
    B([0.08, 0.02, 0.03], [0.075, 1.2, -0.19], 0x3a2a1a, { rot: [0, 0, 0.25], ink: false, skip: "front" }),
    B([0.07, 0.02, 0.03], [0, 1.08, -0.19], 0x8a3a2a, { ink: false, skip: "front" }),
    H(0.29, [0, 1.17, 0], 0x4a7a32),
    C(0.31, 0.31, 0.04, [0, 1.13, 0], 0x35582a),
    S(0.07, [0.14, 1.31, 0.12], 0x3a6228, { scale: [1, 0.5, 1], skip: "fine" }),
    S(0.07, [-0.12, 1.33, 0.02], 0x5f8f42, { scale: [1, 0.5, 1], skip: "fine" }),
    S(0.06, [0.0, 1.38, -0.1], 0x3a6228, { scale: [1, 0.5, 1], skip: "fine" }),
    S(0.05, [-0.02, 1.28, 0.2], 0x6a9a4a, { scale: [1, 0.5, 1], skip: "fine" }),
    B([0.07, 0.02, 0.04], [0.0, 1.43, 0.0], 0xd8c04a, { skip: "fine" }),
    ...arms(vest, skin),
    ...weaponParts(weapon),
  ];
  return { parts, pivots: PIVOTS, legSwing: 0.95, armL: { base: 1.0, swing: 0.08 }, armR: { base: 1.12, swing: 0.08 }, kick: 0.03 };
}

/** the slack of a figure drawn at the size of a run, and of the squad once it is drawn small (body units) */
const RUN_SLACK = 0.006;
const FAR_SLACK = 0.02;

/** The pieces a run draws: never the ones only seen from the front (the squad runs away from the camera), and, with `far`, not the fine ones either. */
const seenInRun = (parts: PartSpec[], far: boolean) => parts.filter((p) => p.skip !== "front" && !(far && p.skip === "fine"));

/** The soldier as a run draws it. `far` is the light version for a big squad, whose soldiers are drawn small. */
export function runSoldier(weapon: WeaponKind, far = false): FigureSpec {
  const figure = cut(far ? FAR_SLACK : RUN_SLACK, () => soldierFigure(weapon));
  return { ...figure, parts: seenInRun(figure.parts, far) };
}

/** The weapon as a run draws it in the squad's hands (see `runSoldier`). */
export const runGun = (weapon: WeaponKind, far = false): PartSpec[] => seenInRun(cut(far ? FAR_SLACK : RUN_SLACK, () => weaponParts(weapon)), far);

// ------------------------------------------------------------------ the enemies

/** What each enemy looks like and how big it is drawn. */
export interface EnemyLook {
  figure: () => FigureSpec;
  scale: number;
  /** how far it leans into the run (radians) */
  lean: number;
  capacity: number;
}

/** A raider gone feral: green skin, torn red shirt, wild hair, glowing eyes, arms out in front. */
function runnerFigure(): FigureSpec {
  const skin = 0x86b05c;
  const shirt = 0xa83a2c;
  const parts: PartSpec[] = [
    ...legs(0x3b3340, 0x2a2226),
    CAP(0.22, 0.2, [0, 0.8, 0], shirt),
    B([0.12, 0.18, 0.04], [-0.12, 0.6, -0.2], 0x8a2a22),
    B([0.1, 0.22, 0.04], [0.04, 0.58, -0.2], 0x8a2a22),
    B([0.1, 0.16, 0.04], [0.16, 0.62, -0.19], 0x8a2a22),
    B([0.46, 0.07, 0.3], [0, 0.56, 0], 0x4a3a2a),
    S(0.13, [-0.26, 1, 0], shirt),
    S(0.13, [0.26, 1, 0], shirt),
    C(0.08, 0.09, 0.1, [0, 1.03, 0], skin),
    S(0.21, [0, 1.15, 0], skin),
    ...[-0.12, -0.04, 0.05, 0.13].map((x, i) => K(0.045, 0.14 + (i % 2) * 0.05, [x, 1.36, 0.03 - i * 0.02], 0x1a1216, { rot: [0, 0, x * 2.2] })),
    ...angryFace(1.16, 0.21, 0xffe14a, { teeth: true }),
    ...arms(skin, skin, 1.05),
  ];
  return { parts, pivots: PIVOTS, legSwing: 0.9, armL: { base: 1.4, swing: 0.3 }, armR: { base: 1.4, swing: 0.3 } };
}

/** Thin, pale and fast: long arms, a red mohawk, orange eyes and a wide mouth. */
function sprinterFigure(): FigureSpec {
  const skin = 0xd8e0b0;
  const cloth = 0x26222e;
  const parts: PartSpec[] = [
    ...legs(0x1c1a22, 0x2a2226, 0.8),
    CAP(0.17, 0.26, [0, 0.82, 0], cloth),
    B([0.2, 0.06, 0.04], [0, 0.82, -0.17], 0xd23a3a),
    B([0.4, 0.06, 0.26], [0, 0.58, 0], 0x3a3340),
    S(0.1, [-0.22, 1.02, 0], cloth),
    S(0.1, [0.22, 1.02, 0], cloth),
    C(0.07, 0.08, 0.1, [0, 1.06, 0], skin),
    S(0.19, [0, 1.18, 0], skin, { scale: [0.92, 1.08, 1] }),
    ...[-0.1, -0.05, 0, 0.05, 0.1].map((z, i) => K(0.04, 0.2 - Math.abs(z) * 0.5, [0, 1.4 - Math.abs(z) * 0.3, z + 0.02], 0xd23a3a, { rot: [i * 0.05 - 0.1, 0, 0] })),
    ...angryFace(1.19, 0.19, 0xff9a2a, { teeth: true, mouth: 0.8, brow: 0.6 }),
    ...arms(skin, skin, 0.85, 1.3),
  ];
  return { parts, pivots: { ...PIVOTS, armL: [-0.22, 1, 0], armR: [0.22, 1, 0] }, legSwing: 1.1, armL: { base: 1.5, swing: 0.5 }, armR: { base: 1.5, swing: 0.5 } };
}

/** A hulking brute: bare red chest with leather straps, horned iron helmet, spiked shoulders and a spiked club. */
function bruteFigure(): FigureSpec {
  const skin = 0xb85a3a;
  const iron = 0x6a6f7a;
  const spikes = (x: number): PartSpec[] => [-1, 0, 1].map((k) => K(0.05, 0.16, [x + k * 0.07, 1.2, k * 0.05], 0xc8ccd4, { rot: [0, 0, -k * 0.5] }));
  const parts: PartSpec[] = [
    ...legs(0x4a3a2a, 0x2a2018, 1.3),
    CAP(0.3, 0.2, [0, 0.82, 0], skin),
    B([0.08, 0.6, 0.06], [0, 0.84, -0.27], 0x3a2a1c, { rot: [0, 0, 0.6] }),
    B([0.08, 0.6, 0.06], [0, 0.84, -0.27], 0x3a2a1c, { rot: [0, 0, -0.6] }),
    B([0.66, 0.1, 0.4], [0, 0.55, 0], 0x3a2a1c),
    S(0.08, [0, 0.55, -0.22], 0xf4ecd8),
    S(0.17, [-0.38, 1.02, 0], iron),
    S(0.17, [0.38, 1.02, 0], iron),
    ...spikes(-0.38),
    ...spikes(0.38),
    S(0.19, [0, 1.15, 0.0], skin),
    H(0.25, [0, 1.3, 0.02], iron),
    K(0.06, 0.3, [-0.25, 1.5, 0], 0xf4ecd8, { rot: [0, 0, 0.7] }),
    K(0.06, 0.3, [0.25, 1.5, 0], 0xf4ecd8, { rot: [0, 0, -0.7] }),
    ...angryFace(1.15, 0.19, 0xff3a2a, { teeth: true, mouth: 0.8, brow: 0.7 }),
    K(0.03, 0.12, [-0.06, 1.1, -0.2], 0xfff4dc, { rot: [0, 0, 3.4] }),
    K(0.03, 0.12, [0.06, 1.1, -0.2], 0xfff4dc, { rot: [0, 0, 3.4] }),
    ...arms(skin, skin, 1.55, 1.1),
    // the club is in the right hand and swings with it
    C(0.07, 0.14, 0.9, [0.4, 0.55, 0], 0x6a4a2a, { role: "armR" }),
    ...[0, 1, 2, 3].map((i) => K(0.035, 0.12, [0.4 + (i % 2 ? 0.11 : -0.11), 0.78 + i * 0.07, 0], 0xc8ccd4, { role: "armR", rot: [0, 0, i % 2 ? -1.5 : 1.5] })),
  ];
  return { parts, pivots: { ...PIVOTS, armL: [-0.38, 1, 0], armR: [0.38, 1, 0] }, legSwing: 0.7, armL: { base: 0.4, swing: 0.6 }, armR: { base: 0.3, swing: 0.5 } };
}

/** A riot trooper: dark helmet with a glowing red visor, body armour, a big shield in front and a baton. */
function shieldFigure(): FigureSpec {
  const steel = 0x3d4a66;
  const parts: PartSpec[] = [
    ...legs(0x2a3246, 0x1c2030, 1.1),
    CAP(0.25, 0.2, [0, 0.8, 0], steel),
    B([0.38, 0.32, 0.1], [0, 0.84, -0.22], 0x8fa0c0),
    B([0.5, 0.08, 0.34], [0, 0.56, 0], 0x1c2030),
    S(0.15, [-0.28, 1, 0], 0x5d6b86),
    S(0.15, [0.28, 1, 0], 0x5d6b86),
    C(0.08, 0.09, 0.1, [0, 1.03, 0], 0xe6ab88),
    S(0.2, [0, 1.15, 0], 0xe6ab88),
    H(0.3, [0, 1.17, 0], 0x2f3a52),
    B([0.34, 0.2, 0.1], [0, 1.1, -0.2], 0x2f3a52),
    B([0.28, 0.06, 0.04], [0, 1.15, -0.25], 0xff3030, { glow: true, ink: false }),
    ...arms(steel, 0x2a3246, 1.1),
    // the shield, held out in front and low enough to leave the visor showing, with a frame and a hazard X
    B([0.86, 0.72, 0.08], [-0.05, 0.62, -0.46], 0x9fb4d8),
    B([0.9, 0.06, 0.1], [-0.05, 0.99, -0.46], 0x5d7092),
    B([0.9, 0.06, 0.1], [-0.05, 0.25, -0.46], 0x5d7092),
    B([0.06, 0.72, 0.1], [-0.5, 0.62, -0.46], 0x5d7092),
    B([0.06, 0.72, 0.1], [0.4, 0.62, -0.46], 0x5d7092),
    B([0.5, 0.07, 0.04], [-0.05, 0.62, -0.52], 0xf2c94c, { rot: [0, 0, 0.7] }),
    B([0.5, 0.07, 0.04], [-0.05, 0.62, -0.52], 0xf2c94c, { rot: [0, 0, -0.7] }),
    C(0.03, 0.03, 0.5, [0.34, 0.7, -0.15], 0x1a1c22, { role: "armR" }),
  ];
  return { parts, pivots: PIVOTS, legSwing: 0.55, armL: { base: 1.3, swing: 0 }, armR: { base: 0.5, swing: 0.35 } };
}

/** A suicide bomber: goggles, a crazy grin and a vest of dynamite with a lit fuse. */
function bomberFigure(): FigureSpec {
  const skin = 0xe3b58f;
  const parts: PartSpec[] = [
    ...legs(0x3a3a46, 0x2a2428),
    CAP(0.22, 0.2, [0, 0.8, 0], 0x9a7b4f),
    B([0.46, 0.07, 0.3], [0, 0.56, 0], 0x4a3a2a),
    // the dynamite: red sticks with yellow bands across the chest, wires and a detonator
    ...[0.9, 0.78, 0.66].flatMap((y) => [
      C(0.05, 0.05, 0.38, [0, y, -0.24], 0xd23a3a, { rot: [0, 0, PI / 2] }),
      C(0.056, 0.056, 0.05, [-0.1, y, -0.24], 0xf2c94c, { rot: [0, 0, PI / 2] }),
      C(0.056, 0.056, 0.05, [0.1, y, -0.24], 0xf2c94c, { rot: [0, 0, PI / 2] }),
    ]),
    B([0.1, 0.1, 0.06], [0.2, 0.58, -0.2], 0x2a2a30),
    C(0.012, 0.012, 0.18, [0, 1.02, -0.24], 0x1a1a1a),
    S(0.04, [0, 1.12, -0.24], 0xff9a2a, { glow: true, ink: false }),
    S(0.13, [-0.26, 1, 0], 0x9a7b4f),
    S(0.13, [0.26, 1, 0], 0x9a7b4f),
    C(0.08, 0.09, 0.1, [0, 1.03, 0], skin),
    S(0.2, [0, 1.15, 0], skin),
    ...[-0.1, -0.03, 0.05, 0.12].map((x, i) => K(0.05, 0.13, [x, 1.34, 0.02 - i * 0.02], 0x1a1216, { rot: [0, 0, x * 2] })),
    // goggles with amber lenses and a strap
    C(0.075, 0.075, 0.06, [-0.08, 1.19, -0.19], 0xffb830, { rot: alongZ, glow: true }),
    C(0.075, 0.075, 0.06, [0.08, 1.19, -0.19], 0xffb830, { rot: alongZ, glow: true }),
    C(0.205, 0.205, 0.05, [0, 1.19, 0], 0x2a2a30),
    B([0.2, 0.09, 0.05], [0, 1.07, -0.19], 0x2a0e12, { ink: false }),
    ...[-0.06, -0.02, 0.02, 0.06].map((x) => B([0.03, 0.04, 0.03], [x, 1.1, -0.215], 0xfff4dc, { ink: false })),
    ...arms(skin, skin),
  ];
  return { parts, pivots: PIVOTS, legSwing: 1.0, armL: { base: 0.9, swing: 0.7 }, armR: { base: 0.9, swing: 0.7 } };
}

/** A hooded sniper: a purple cloak, a dark face with two cyan eyes and a long rifle with a scope. */
function shooterFigure(): FigureSpec {
  const cloth = 0x3f2a5e;
  const parts: PartSpec[] = [
    ...legs(0x1a1224, 0x120c1a),
    CAP(0.23, 0.2, [0, 0.8, 0], cloth),
    C(0.3, 0.36, 0.4, [0, 0.46, 0], 0x33224d),
    B([0.5, 0.74, 0.1], [0, 0.78, 0.26], 0x2a1c40),
    B([0.5, 0.08, 0.34], [0, 0.56, 0], 0x1a1224),
    S(0.14, [-0.27, 1, 0], cloth),
    S(0.14, [0.27, 1, 0], cloth),
    S(0.26, [0, 1.16, 0.02], cloth),
    K(0.17, 0.32, [0, 1.4, 0.1], cloth, { rot: [-0.5, 0, 0] }),
    B([0.2, 0.16, 0.1], [0, 1.13, -0.18], 0x120a1c, { ink: false }),
    S(0.032, [-0.052, 1.16, -0.23], 0x6ae8ff, { glow: true, ink: false }),
    S(0.032, [0.052, 1.16, -0.23], 0x6ae8ff, { glow: true, ink: false }),
    ...arms(cloth, 0x1a1224),
    // a long sniper rifle with a scope
    B([0.07, 0.1, 0.5], [0.04, 0.9, -0.4], 0x1a1c22, { role: "gun" }),
    C(0.02, 0.02, 0.8, [0.04, 0.92, -1.0], 0x1a1c22, { role: "gun", rot: alongZ }),
    C(0.035, 0.035, 0.26, [0.04, 1.0, -0.42], 0x0e0f14, { role: "gun", rot: alongZ }),
    B([0.07, 0.14, 0.2], [0.04, 0.86, -0.04], 0x5a3a22, { role: "gun" }),
  ];
  return { parts, pivots: PIVOTS, legSwing: 0.6, armL: { base: 1.1, swing: 0.04 }, armR: { base: 1.2, swing: 0.04 } };
}

/** Every enemy but the boss: how it looks, how big it is and how far it leans into the run. */
export const ENEMY_LOOKS: Record<Exclude<EnemyKind, "boss">, EnemyLook> = {
  runner: { figure: runnerFigure, scale: 1, lean: 0.18, capacity: 200 },
  sprinter: { figure: sprinterFigure, scale: 0.95, lean: 0.55, capacity: 140 },
  brute: { figure: bruteFigure, scale: 1.5, lean: 0.06, capacity: 50 },
  shield: { figure: shieldFigure, scale: 1.2, lean: 0, capacity: 50 },
  bomber: { figure: bomberFigure, scale: 1.05, lean: 0.25, capacity: 50 },
  shooter: { figure: shooterFigure, scale: 1.1, lean: 0, capacity: 30 },
};

/** An enemy as a run draws it: the bigger it is drawn, the less slack its round shapes get. */
export const runEnemy = (kind: Exclude<EnemyKind, "boss">): FigureSpec => cut(RUN_SLACK / ENEMY_LOOKS[kind].scale, ENEMY_LOOKS[kind].figure);

// ------------------------------------------------------------------ the bosses

const BOSS_PIVOTS: FigureSpec["pivots"] = { legL: [-0.17, 0.55, 0], legR: [0.17, 0.55, 0], armL: [-0.5, 1.12, 0], armR: [0.5, 1.12, 0] };

/** Thick legs and big boots for a boss, with an optional stripe down the outside. */
function bossLegs(pants: number, boots: number, trim?: number, w = 1): PartSpec[] {
  const parts: PartSpec[] = [];
  for (const [role, x] of [["legL", -0.18], ["legR", 0.18]] as const) {
    parts.push(CAP(0.14 * w, 0.28, [x, 0.38, 0], pants, { role }));
    parts.push(B([0.32 * w, 0.18, 0.44], [x, 0.09, -0.07], boots, { role }));
    parts.push(B([0.3 * w, 0.1, 0.16], [x, 0.2, -0.24], boots, { role }));
    if (trim) parts.push(B([0.04, 0.46, 0.26], [x + 0.15 * Math.sign(x) * w, 0.38, 0], trim, { role }));
  }
  return parts;
}

/** Rounded arms with a cuff and a big fist or glove, for a boss. */
function bossArms(sleeve: number, fist: number, cuff?: number, w = 1): PartSpec[] {
  const parts: PartSpec[] = [];
  for (const [role, x] of [["armL", -0.5], ["armR", 0.5]] as const) {
    parts.push(CAP(0.14 * w, 0.22, [x, 0.86, 0], sleeve, { role }));
    parts.push(S(0.19 * w, [x, 0.58, 0], fist, { role }));
    if (cuff) parts.push(C(0.17 * w, 0.17 * w, 0.07, [x, 0.68, 0], cuff, { role }));
  }
  return parts;
}

/** The General (the bridge): a gold-trimmed red coat with a sash and medals, a horned golden helmet, a grim moustache, a cape and a saber. */
function generalFigure(): FigureSpec {
  const coat = 0xb32a2a;
  const coatDark = 0x8a1c1c;
  const gold = 0xe0b13a;
  const white = 0xf2efe6;
  const skin = 0xe6ab88;
  const parts: PartSpec[] = [
    ...bossLegs(0x241c28, 0x120e18, gold),
    // coat: a thick body, skirts front and back, high collar
    CAP(0.4, 0.3, [0, 0.94, 0], coat),
    S(0.36, [0, 0.82, -0.04], coat, { scale: [1.1, 0.95, 0.95] }),
    B([0.58, 0.3, 0.12], [0, 0.55, -0.3], coat),
    B([0.5, 0.46, 0.1], [0, 0.46, 0.34], coatDark),
    B([0.1, 0.4, 0.46], [-0.31, 0.5, 0], coatDark),
    B([0.1, 0.4, 0.46], [0.31, 0.5, 0], coatDark),
    B([0.6, 0.05, 0.14], [0, 0.4, -0.34], gold),
    C(0.22, 0.27, 0.12, [0, 1.24, 0], coatDark),
    // white shirt, lapels, buttons, sash and medals
    B([0.2, 0.46, 0.06], [0, 1.0, -0.4], white),
    B([0.13, 0.46, 0.06], [-0.16, 1.0, -0.39], coatDark, { rot: [0, 0, 0.32] }),
    B([0.13, 0.46, 0.06], [0.16, 1.0, -0.39], coatDark, { rot: [0, 0, -0.32] }),
    ...[0.88, 0.76, 0.64].flatMap((y) => [S(0.04, [-0.08, y, -0.43], gold), S(0.04, [0.08, y, -0.43], gold)]),
    B([0.12, 0.84, 0.05], [0, 0.94, -0.42], 0x2a4a9a, { rot: [0, 0, 0.7] }),
    ...[0, 1, 2].map((i) => S(0.055, [-0.22 - i * 0.02, 1.05 - i * 0.1, -0.41], gold)),
    S(0.075, [0.2, 1.1, -0.41], gold),
    B([0.66, 0.1, 0.52], [0, 0.62, 0], 0x14101a),
    B([0.2, 0.16, 0.06], [0, 0.62, -0.28], gold),
    // rounded epaulettes with fringe
    S(0.22, [-0.54, 1.2, 0], gold, { scale: [1.2, 0.45, 1] }),
    S(0.22, [0.54, 1.2, 0], gold, { scale: [1.2, 0.45, 1] }),
    ...[-1, 1].flatMap((side) => [-2, -1, 0, 1, 2].map((k) => C(0.012, 0.012, 0.2, [side * 0.54 + k * 0.07, 1.04, 0], gold))),
    // the cape with folds and a gold edge
    B([0.7, 0.96, 0.06], [0, 0.98, 0.44], coatDark),
    B([0.14, 1.0, 0.07], [-0.24, 0.96, 0.46], 0x6e1414),
    B([0.14, 0.9, 0.07], [0.12, 0.98, 0.46], 0x6e1414),
    B([0.72, 0.05, 0.08], [0, 1.47, 0.43], gold),
    // head: a heavy jaw, a moustache and thick brows under a horned golden helmet
    C(0.13, 0.15, 0.12, [0, 1.3, 0], skin),
    S(0.27, [0, 1.46, 0], skin, { scale: [1.05, 1.02, 1] }),
    S(0.2, [0, 1.34, -0.08], skin, { scale: [1.25, 0.7, 1] }),
    K(0.05, 0.12, [0, 1.42, -0.27], 0xd9966f, { rot: [-PI / 2, 0, 0] }),
    ...angryFace(1.47, 0.27, 0xff2a2a, { teeth: true, mouth: 0.8, brow: 0.7 }),
    C(0.045, 0.045, 0.3, [-0.12, 1.37, -0.29], 0x14101a, { rot: [0, 0, 1.35] }),
    C(0.045, 0.045, 0.3, [0.12, 1.37, -0.29], 0x14101a, { rot: [0, 0, -1.35] }),
    K(0.04, 0.2, [-0.27, 1.27, -0.27], 0x14101a, { rot: [0, 0, PI] }),
    K(0.04, 0.2, [0.27, 1.27, -0.27], 0x14101a, { rot: [0, 0, PI] }),
    H(0.33, [0, 1.66, 0], gold),
    C(0.34, 0.34, 0.06, [0, 1.6, 0], 0xb88a22),
    C(0.09, 0.12, 0.3, [-0.34, 1.78, 0], 0xf4ecd8, { rot: [0, 0, 0.7] }),
    C(0.09, 0.12, 0.3, [0.34, 1.78, 0], 0xf4ecd8, { rot: [0, 0, -0.7] }),
    K(0.09, 0.4, [-0.5, 2.0, 0], 0xf4ecd8, { rot: [0, 0, 0.8] }),
    K(0.09, 0.4, [0.5, 2.0, 0], 0xf4ecd8, { rot: [0, 0, -0.8] }),
    ...[-0.12, -0.04, 0.04, 0.12].map((z) => K(0.06, 0.34 - Math.abs(z), [0, 2.0, z * 2], 0xd23a3a)),
    ...bossArms(coat, white, gold),
    // a big saber in the right hand
    C(0.035, 0.035, 0.3, [0.5, 0.58, -0.06], gold, { role: "armR" }),
    B([0.28, 0.05, 0.06], [0.5, 0.74, -0.06], gold, { role: "armR" }),
    B([0.07, 1.2, 0.025], [0.5, 1.34, -0.06], 0xdfe6f0, { role: "armR" }),
  ];
  return { parts, pivots: BOSS_PIVOTS, legSwing: 0.32, armL: { base: 0.7, swing: 0.25 }, armR: { base: 0.45, swing: 0.25 } };
}

/** The Warlord (the desert): a bronze breastplate with spiked pauldrons, a fur collar, a skull helmet with ram horns, a ragged cloak and a huge axe. */
function warlordFigure(): FigureSpec {
  const bronze = 0xb5762a;
  const bronzeDark = 0x8f5a1c;
  const bone = 0xe8dcc0;
  const cloth = 0x6b4a2a;
  const skin = 0xb8825a;
  const spikes = (x: number): PartSpec[] => [-1, 0, 1].flatMap((k) => [K(0.06, 0.26, [x + k * 0.1, 1.42, k * 0.08], 0xd8c8a0, { rot: [0, 0, -k * 0.5] })]);
  const parts: PartSpec[] = [
    ...bossLegs(cloth, 0x3a2614, undefined, 1.1),
    ...[-0.18, 0.18].map((x) => B([0.32, 0.16, 0.34], [x, 0.62, -0.02], bronze)),
    // loincloth panels
    B([0.3, 0.4, 0.05], [-0.12, 0.5, -0.32], 0x8a2f22),
    B([0.3, 0.46, 0.05], [0.14, 0.48, -0.32], 0x6b2218),
    // chest: bare skin under a bronze breastplate with a skull emblem
    CAP(0.4, 0.26, [0, 0.94, 0], skin),
    S(0.44, [0, 1.0, -0.06], bronze, { scale: [1.15, 0.9, 0.78] }),
    B([0.5, 0.06, 0.08], [0, 0.82, -0.39], bronzeDark),
    B([0.5, 0.06, 0.08], [0, 1.0, -0.4], bronzeDark),
    S(0.1, [0, 0.92, -0.44], bone),
    B([0.06, 0.05, 0.03], [-0.03, 0.9, -0.54], 0x14101a),
    B([0.06, 0.05, 0.03], [0.03, 0.9, -0.54], 0x14101a),
    B([0.62, 0.11, 0.5], [0, 0.6, 0], 0x4a2f16),
    // huge pauldrons with spikes and a fur collar
    S(0.26, [-0.58, 1.2, 0], bronze),
    S(0.26, [0.58, 1.2, 0], bronze),
    ...spikes(-0.58),
    ...spikes(0.58),
    ...[-3, -2, -1, 0, 1, 2, 3].map((k) => S(0.12, [k * 0.1, 1.28 - Math.abs(k) * 0.025, 0.08 - Math.abs(k) * 0.02], 0xc9b48a)),
    // the ragged cloak behind
    B([0.6, 0.9, 0.06], [0, 0.82, 0.38], cloth),
    ...[-0.22, -0.07, 0.08, 0.23].map((x, i) => B([0.12, 0.34 + (i % 2) * 0.12, 0.06], [x, 0.3, 0.4], cloth)),
    // the head: a skull helmet with glowing sockets, teeth and ram horns
    C(0.14, 0.16, 0.12, [0, 1.3, 0], skin),
    S(0.28, [0, 1.48, 0], bone, { scale: [1, 1.05, 1] }),
    S(0.19, [0, 1.34, -0.1], bone, { scale: [1.2, 0.6, 0.9] }),
    S(0.075, [-0.1, 1.5, -0.24], 0x14101a),
    S(0.075, [0.1, 1.5, -0.24], 0x14101a),
    S(0.04, [-0.1, 1.5, -0.29], 0xff7a1a, { glow: true, ink: false }),
    S(0.04, [0.1, 1.5, -0.29], 0xff7a1a, { glow: true, ink: false }),
    K(0.05, 0.1, [0, 1.42, -0.29], 0x14101a, { rot: [-PI / 2, 0, 0] }),
    ...[-0.09, -0.03, 0.03, 0.09].map((x) => B([0.045, 0.1, 0.05], [x, 1.3, -0.27], 0x2a1a10, { ink: false })),
    C(0.08, 0.11, 0.4, [-0.3, 1.66, 0], 0xd8c8a0, { rot: [0, 0, 0.9] }),
    C(0.08, 0.11, 0.4, [0.3, 1.66, 0], 0xd8c8a0, { rot: [0, 0, -0.9] }),
    C(0.06, 0.08, 0.3, [-0.52, 1.78, 0], 0xd8c8a0, { rot: [0, 0, 1.9] }),
    C(0.06, 0.08, 0.3, [0.52, 1.78, 0], 0xd8c8a0, { rot: [0, 0, -1.9] }),
    K(0.06, 0.2, [-0.68, 1.7, 0], 0xd8c8a0, { rot: [0, 0, 2.8] }),
    K(0.06, 0.2, [0.68, 1.7, 0], 0xd8c8a0, { rot: [0, 0, -2.8] }),
    ...bossArms(skin, skin, 0x4a2f16, 1.15),
    // the double-bladed axe in the right hand
    C(0.045, 0.045, 1.4, [0.5, 0.9, -0.06], 0x4a2f16, { role: "armR" }),
    B([0.46, 0.42, 0.05], [0.8, 1.52, -0.06], 0xb8bcc6, { role: "armR" }),
    B([0.46, 0.42, 0.05], [0.2, 1.52, -0.06], 0xb8bcc6, { role: "armR" }),
    S(0.08, [0.5, 1.52, -0.06], 0x5a5f6a, { role: "armR" }),
  ];
  return { parts, pivots: BOSS_PIVOTS, legSwing: 0.3, armL: { base: 0.55, swing: 0.25 }, armR: { base: 0.25, swing: 0.2 } };
}

/** The Mech (the city): a steel robot of panels and pistons with a glowing core, a scanning visor, shoulder cannons and hazard stripes. */
function mechFigure(): FigureSpec {
  const steel = 0x5f6a7a;
  const steelLight = 0x7d8aa0;
  const dark = 0x2f3644;
  const hazard = 0xf2c94c;
  const panel = (x: number, y: number, z: number, w: number, h: number): PartSpec => B([w, h, 0.02], [x, y, z], dark, { ink: false });
  const parts: PartSpec[] = [
    ...bossLegs(steel, dark, hazard, 1.15),
    ...[-0.18, 0.18].flatMap((x) => [C(0.08, 0.08, 0.34, [x, 0.66, -0.06], dark), S(0.14, [x, 0.56, 0], steelLight, { role: "static" })]),
    // pelvis, torso with layered plates and a glowing core
    B([0.7, 0.2, 0.5], [0, 0.72, 0], dark),
    B([0.86, 0.66, 0.58], [0, 1.08, 0], steel),
    B([0.74, 0.16, 0.6], [0, 1.46, 0], steelLight),
    B([0.88, 0.07, 0.6], [0, 0.82, 0], hazard),
    B([0.5, 0.34, 0.08], [0, 1.1, -0.33], dark),
    S(0.13, [0, 1.1, -0.38], 0x6ae8ff, { glow: true, ink: false }),
    ...[-0.2, 0.2].map((x) => B([0.07, 0.26, 0.04], [x, 1.1, -0.38], 0xff7a1a, { glow: true, ink: false })),
    panel(-0.3, 1.34, -0.3, 0.2, 0.14),
    panel(0.3, 1.34, -0.3, 0.2, 0.14),
    panel(-0.34, 0.95, -0.3, 0.16, 0.2),
    panel(0.34, 0.95, -0.3, 0.16, 0.2),
    // back: a power pack with exhaust stacks and a tiny blinking light
    B([0.56, 0.6, 0.18], [0, 1.1, 0.38], dark),
    C(0.07, 0.08, 0.5, [-0.18, 1.62, 0.4], 0x1a1c22),
    C(0.07, 0.08, 0.5, [0.18, 1.62, 0.4], 0x1a1c22),
    S(0.04, [0, 1.42, 0.5], 0xff3030, { glow: true, ink: false }),
    // the head: a boxy dome with a long glowing visor and an antenna
    C(0.14, 0.18, 0.12, [0, 1.56, 0], dark),
    B([0.46, 0.38, 0.44], [0, 1.78, 0], steel),
    B([0.5, 0.08, 0.48], [0, 1.99, 0], steelLight),
    B([0.4, 0.1, 0.04], [0, 1.8, -0.23], 0xff3030, { glow: true, ink: false }),
    B([0.1, 0.1, 0.04], [0, 1.8, -0.245], 0xffffff, { glow: true, ink: false }),
    C(0.012, 0.012, 0.4, [0.18, 2.2, 0.1], dark),
    S(0.04, [0.18, 2.42, 0.1], 0xff3030, { glow: true, ink: false }),
    // shoulder cannons with glowing muzzles
    S(0.24, [-0.6, 1.3, 0], dark),
    S(0.24, [0.6, 1.3, 0], dark),
    C(0.1, 0.1, 0.7, [-0.6, 1.46, -0.3], 0x1a1c22, { rot: alongZ }),
    C(0.1, 0.1, 0.7, [0.6, 1.46, -0.3], 0x1a1c22, { rot: alongZ }),
    C(0.12, 0.12, 0.08, [-0.6, 1.46, -0.68], hazard, { rot: alongZ }),
    C(0.12, 0.12, 0.08, [0.6, 1.46, -0.68], hazard, { rot: alongZ }),
    S(0.06, [-0.6, 1.46, -0.74], 0xff9a2a, { glow: true, ink: false }),
    S(0.06, [0.6, 1.46, -0.74], 0xff9a2a, { glow: true, ink: false }),
    ...bossArms(steel, dark, hazard, 1.2),
    // claws on the hands
    ...[-0.5, 0.5].flatMap((x) => [-0.08, 0, 0.08].map((k) => K(0.035, 0.16, [x + k, 0.42, -0.08], 0xc4ccd8, { rot: [PI, 0, 0], role: x < 0 ? "armL" : "armR" }))),
  ];
  return { parts, pivots: BOSS_PIVOTS, legSwing: 0.28, armL: { base: 0.8, swing: 0.2 }, armR: { base: 0.8, swing: 0.2 } };
}

/** The Yeti (the snow): a shaggy mound of white fur with ice crystals down its back, an icicle beard, claws and glowing blue eyes. */
function yetiFigure(): FigureSpec {
  const fur = 0xf4f9ff;
  const furShade = 0xc8d8ea;
  const furDeep = 0xaec4dc;
  const ice = 0x8fd8ff;
  const tufts = (cx: number, cy: number, cz: number, n: number, spread: number): PartSpec[] =>
    Array.from({ length: n }, (_, i) => K(0.07, 0.22, [cx + Math.sin(i * 2.4) * spread, cy + Math.cos(i * 1.7) * spread * 0.6, cz + Math.cos(i * 3.1) * spread * 0.4], i % 2 ? fur : furShade, { rot: [Math.sin(i) * 0.6, 0, Math.cos(i * 1.3) * 0.7] }));
  const parts: PartSpec[] = [
    ...bossLegs(fur, 0x6a8aaa, undefined, 1.3),
    ...[-0.18, 0.18].map((x) => S(0.2, [x, 0.55, 0], furShade)),
    // body: layered fur, a lighter belly, tufts
    S(0.5, [0, 0.94, 0.04], fur, { scale: [1.1, 1.12, 0.98] }),
    S(0.32, [0, 0.82, -0.2], furShade, { scale: [1.2, 1, 0.8] }),
    S(0.28, [-0.3, 1.14, -0.12], fur),
    S(0.28, [0.3, 1.14, -0.12], fur),
    ...tufts(0, 1.2, -0.3, 8, 0.4),
    ...tufts(0, 0.7, -0.3, 6, 0.35),
    S(0.28, [-0.52, 1.22, 0], fur),
    S(0.28, [0.52, 1.22, 0], fur),
    ...tufts(-0.52, 1.46, 0, 4, 0.14),
    ...tufts(0.52, 1.46, 0, 4, 0.14),
    // ice crystals growing down the back
    ...[-0.34, -0.14, 0.1, 0.32].map((x, i) => K(0.1, 0.5 + (i % 2) * 0.2, [x, 1.42 + (i % 2) * 0.05, 0.34], ice, { rot: [-0.5, 0, x * 0.8] })),
    ...[-0.2, 0.2].map((x) => K(0.08, 0.36, [x, 1.02, 0.44], ice, { rot: [-1.0, 0, 0] })),
    // head: a big furry brow, a dark face, fangs and an icicle beard
    S(0.3, [0, 1.46, -0.02], fur),
    S(0.2, [0, 1.4, -0.22], 0x24365a, { scale: [1.1, 0.9, 0.8] }),
    S(0.055, [-0.1, 1.45, -0.36], 0x6ae8ff, { glow: true, ink: false }),
    S(0.055, [0.1, 1.45, -0.36], 0x6ae8ff, { glow: true, ink: false }),
    B([0.22, 0.05, 0.05], [-0.1, 1.53, -0.34], 0x0e1626, { rot: [0, 0, -0.5], ink: false }),
    B([0.22, 0.05, 0.05], [0.1, 1.53, -0.34], 0x0e1626, { rot: [0, 0, 0.5], ink: false }),
    B([0.24, 0.1, 0.06], [0, 1.31, -0.37], 0x1a0a0e, { ink: false }),
    ...[-0.09, -0.03, 0.03, 0.09].map((x) => K(0.028, 0.13, [x, 1.34, -0.4], 0xffffff, { rot: [0, 0, PI], ink: false })),
    ...[-0.12, -0.04, 0.04, 0.12].map((x, i) => K(0.04, 0.2 + (i % 2) * 0.1, [x, 1.2, -0.3], ice, { rot: [0, 0, PI] })),
    K(0.08, 0.38, [-0.22, 1.82, -0.02], ice, { rot: [0, 0, 0.5] }),
    K(0.08, 0.38, [0.22, 1.82, -0.02], ice, { rot: [0, 0, -0.5] }),
    K(0.06, 0.28, [0, 1.88, -0.02], ice),
    // huge arms, hands and claws
    ...bossArms(fur, furShade, undefined, 1.25),
    ...[-0.5, 0.5].flatMap((x) => [S(0.16, [x, 0.8, 0], fur, { role: x < 0 ? "armL" : "armR" }), ...[-0.09, 0, 0.09].map((k) => K(0.04, 0.16, [x + k, 0.42, -0.1], ice, { rot: [PI, 0, 0], role: x < 0 ? "armL" : "armR" }))]),
  ];
  return { parts, pivots: BOSS_PIVOTS, legSwing: 0.28, armL: { base: 0.7, swing: 0.3 }, armR: { base: 0.7, swing: 0.3 } };
}

/** The Demon (the volcano): muscled charcoal skin split by glowing lava, bat wings, long curved horns, a flaming mane, fangs and burning eyes. */
function demonFigure(): FigureSpec {
  const rock = 0x2a2024;
  const rockLight = 0x3d2c32;
  const horn = 0x140e10;
  const lava = 0xff6a1a;
  const crack = (at: V3, size: V3, rot: V3 = [0, 0, 0], role: Role = "static"): PartSpec => B(size, at, lava, { glow: true, ink: false, rot, role });
  const parts: PartSpec[] = [
    ...bossLegs(rock, horn, undefined, 1.2),
    crack([-0.18, 0.42, -0.17], [0.04, 0.36, 0.02], [0, 0, 0.2], "legL"),
    crack([0.18, 0.42, -0.17], [0.04, 0.34, 0.02], [0, 0, -0.2], "legR"),
    // muscled torso: chest, abs, lava veins
    S(0.42, [0, 1.0, 0], rock, { scale: [1.18, 1, 0.85] }),
    S(0.2, [-0.22, 1.1, -0.28], rockLight),
    S(0.2, [0.22, 1.1, -0.28], rockLight),
    ...[0.9, 0.76, 0.62].flatMap((y) => [S(0.1, [-0.1, y, -0.34], rockLight), S(0.1, [0.1, y, -0.34], rockLight)]),
    crack([0, 1.0, -0.4], [0.05, 0.56, 0.03], [0, 0, 0.12]),
    crack([-0.2, 0.96, -0.4], [0.04, 0.34, 0.03], [0, 0, -0.55]),
    crack([0.2, 0.98, -0.4], [0.04, 0.36, 0.03], [0, 0, 0.55]),
    B([0.62, 0.1, 0.5], [0, 0.62, 0], horn),
    S(0.08, [0, 0.62, -0.28], lava, { glow: true, ink: false }),
    // shoulders with spikes
    S(0.26, [-0.58, 1.24, 0], rock),
    S(0.26, [0.58, 1.24, 0], rock),
    ...[-0.58, 0.58].flatMap((x) => [-1, 0, 1].map((k) => K(0.06, 0.32, [x + k * 0.1, 1.5, k * 0.08], horn, { rot: [0, 0, -k * 0.5] }))),
    // bat wings on the back, with a glowing edge
    ...[-1, 1].flatMap((side) => [
      B([0.9, 0.05, 0.6], [side * 0.7, 1.45, 0.42], 0x4a1a1a, { rot: [0.2, side * -0.5, side * 0.4] }),
      B([0.06, 0.06, 0.9], [side * 0.45, 1.62, 0.4], horn, { rot: [0.2, side * -0.5, side * 0.2] }),
      B([0.9, 0.03, 0.06], [side * 0.82, 1.5, 0.74], lava, { glow: true, ink: false, rot: [0.2, side * -0.5, side * 0.4] }),
    ]),
    // head: horned brow, burning eyes, a wide jaw of fangs and a mane of flames
    C(0.13, 0.15, 0.12, [0, 1.36, 0], rock),
    S(0.27, [0, 1.54, 0], rock, { scale: [1, 1.05, 1] }),
    S(0.2, [0, 1.42, -0.1], rock, { scale: [1.2, 0.7, 0.9] }),
    S(0.08, [-0.1, 1.57, -0.23], 0xffe14a, { glow: true, ink: false }),
    S(0.08, [0.1, 1.57, -0.23], 0xffe14a, { glow: true, ink: false }),
    B([0.22, 0.06, 0.06], [-0.1, 1.66, -0.22], 0x0a0608, { rot: [0, 0, -0.6], ink: false }),
    B([0.22, 0.06, 0.06], [0.1, 1.66, -0.22], 0x0a0608, { rot: [0, 0, 0.6], ink: false }),
    B([0.3, 0.12, 0.06], [0, 1.37, -0.25], 0x1a0508, { ink: false }),
    ...[-0.11, -0.04, 0.04, 0.11].map((x) => K(0.034, 0.15, [x, 1.42, -0.28], 0xfff4dc, { rot: [0, 0, PI], ink: false })),
    ...[-0.1, 0.1].map((x) => K(0.034, 0.12, [x, 1.34, -0.28], 0xfff4dc, { ink: false })),
    C(0.08, 0.12, 0.46, [-0.28, 1.84, 0], horn, { rot: [0, 0, 0.6] }),
    C(0.08, 0.12, 0.46, [0.28, 1.84, 0], horn, { rot: [0, 0, -0.6] }),
    C(0.06, 0.09, 0.34, [-0.5, 2.1, 0], horn, { rot: [0, 0, 1.1] }),
    C(0.06, 0.09, 0.34, [0.5, 2.1, 0], horn, { rot: [0, 0, -1.1] }),
    K(0.06, 0.34, [-0.68, 2.2, 0], lava, { glow: true, ink: false, rot: [0, 0, 1.7] }),
    K(0.06, 0.34, [0.68, 2.2, 0], lava, { glow: true, ink: false, rot: [0, 0, -1.7] }),
    ...[-0.2, -0.07, 0.07, 0.2].map((x, i) => K(0.09, 0.5 + (i % 2) * 0.24, [x, 1.9, 0.22], lava, { glow: true, ink: false, rot: [-0.4, 0, x * 0.6] })),
    ...bossArms(rock, horn, undefined, 1.2),
    crack([-0.5, 0.92, -0.14], [0.04, 0.32, 0.02], [0, 0, 0.1], "armL"),
    crack([0.5, 0.92, -0.14], [0.04, 0.32, 0.02], [0, 0, -0.1], "armR"),
    ...[-0.5, 0.5].flatMap((x) => [S(0.07, [x, 0.6, -0.14], lava, { glow: true, ink: false, role: x < 0 ? "armL" : "armR" }), ...[-0.08, 0, 0.08].map((k) => K(0.035, 0.18, [x + k, 0.42, -0.1], horn, { rot: [PI, 0, 0], role: x < 0 ? "armL" : "armR" }))]),
  ];
  return { parts, pivots: BOSS_PIVOTS, legSwing: 0.3, armL: { base: 0.75, swing: 0.3 }, armR: { base: 0.75, swing: 0.3 } };
}

/** Each boss's figure and the name it shows, and how big it is drawn. */
export const BOSS_FIGURES: Record<BossKind, { name: string; figure: () => FigureSpec }> = {
  general: { name: BOSS_NAME.general, figure: generalFigure },
  warlord: { name: BOSS_NAME.warlord, figure: warlordFigure },
  mech: { name: BOSS_NAME.mech, figure: mechFigure },
  yeti: { name: BOSS_NAME.yeti, figure: yetiFigure },
  demon: { name: BOSS_NAME.demon, figure: demonFigure },
};
export const BOSS_SCALE = 3.4;
