import type { PartSpec } from "./crowd";
import { B, C, K, PI, S, alongZ } from "./figures";

/** The dangers on and over the road, built from the same simple shapes as the characters. Everything faces -z. */

const STEEL = 0x3a3f4c;
const LIGHT = 0xc4ccd8;
const RED = 0xd23a3a;

/** A plate of spikes lying across the road: a dark base with a field of sharp cones and a hazard stripe along the front. */
export function spikesParts(): PartSpec[] {
  const parts: PartSpec[] = [B([2.9, 0.14, 1.5], [0, 0.07, 0], STEEL), B([2.9, 0.15, 0.2], [0, 0.075, -0.65], 0xf2c94c), B([2.95, 0.04, 0.05], [0, 0.17, -0.65], STEEL)];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) parts.push(K(0.11, 0.62, [-1.2 + col * 0.4, 0.45, -0.3 + row * 0.4], LIGHT));
  for (let col = 0; col < 7; col++) parts.push(S(0.05, [-1.2 + col * 0.4, 0.77, -0.3], RED, { glow: true, ink: false }));
  return parts;
}

/** A land mine: a squat dark disc with a ring of prongs and a blinking red light on top. The light is a separate part so it can blink. */
export function mineParts(): PartSpec[] {
  const parts: PartSpec[] = [C(0.52, 0.58, 0.26, [0, 0.13, 0], STEEL), C(0.4, 0.44, 0.1, [0, 0.3, 0], 0x4a505e), C(0.14, 0.14, 0.1, [0, 0.38, 0], 0x20242e)];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    parts.push(K(0.05, 0.2, [Math.cos(a) * 0.5, 0.22, Math.sin(a) * 0.5], LIGHT, { rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }));
  }
  return parts;
}

/** The blinking light of a mine. */
export function mineLight(): PartSpec[] {
  return [S(0.1, [0, 0.46, 0], 0xff3a2a, { glow: true, ink: false })];
}

/** A bomber seen from above and behind: a long fuselage, swept wings with engines, a tail, bombs under the wings and glowing exhausts. */
export function planeParts(): PartSpec[] {
  const body = 0x6b7482;
  const dark = 0x2f3644;
  const parts: PartSpec[] = [
    C(0.46, 0.4, 4.6, [0, 1, 0], body, { rot: alongZ }),
    K(0.44, 1.1, [0, 1, -2.8], 0x4a5160, { rot: [-PI / 2, 0, 0] }),
    S(0.38, [0, 1.35, -1.3], 0x9fdcff, { scale: [0.9, 0.7, 1.5] }),
    // wings, swept back, with an engine under each
    B([7.2, 0.14, 1.5], [0, 0.95, 0.2], body),
    B([2.4, 0.14, 1.1], [-3.5, 0.95, 0.75], dark, { rot: [0, 0.35, 0] }),
    B([2.4, 0.14, 1.1], [3.5, 0.95, 0.75], dark, { rot: [0, -0.35, 0] }),
    // tail: two fins and a stabiliser
    B([0.14, 1.1, 0.9], [0, 1.6, 2.3], dark, { rot: [0.3, 0, 0] }),
    B([2.6, 0.12, 0.8], [0, 1.1, 2.4], body),
    // stars on the wings
    B([0.5, 0.02, 0.5], [-2.2, 1.03, 0.2], 0xf2c94c, { ink: false }),
    B([0.5, 0.02, 0.5], [2.2, 1.03, 0.2], 0xf2c94c, { ink: false }),
  ];
  for (const x of [-1.5, 1.5]) {
    parts.push(C(0.28, 0.3, 1.1, [x, 0.72, -0.1], dark, { rot: alongZ }));
    parts.push(S(0.2, [x, 0.72, 0.55], 0xff9a2a, { glow: true, ink: false }));
    for (const z of [-0.2, 0.3]) parts.push(S(0.2, [x * 1.5, 0.55, z], 0x20242e));
  }
  return parts;
}

/** A bomb on its way down: a dark teardrop with fins. It points down (+y is the nose, so it is turned over by the scene). */
export function bombParts(): PartSpec[] {
  return [
    S(0.34, [0, 0.45, 0], 0x2a2f38, { scale: [1, 1.45, 1] }),
    K(0.22, 0.34, [0, 0.0, 0], 0x2a2f38, { rot: [PI, 0, 0] }),
    B([0.5, 0.06, 0.04], [0, 0.95, 0], RED),
    B([0.04, 0.06, 0.5], [0, 0.95, 0], RED),
    S(0.08, [0, 0.12, 0], 0xff3a2a, { glow: true, ink: false }),
  ];
}

/**
 * The General's missile: an olive body along z with a red warhead pointing at the squad (-z), four fins at the tail
 * and a flame out of the back.
 */
export function missileParts(): PartSpec[] {
  const olive = 0x5d6b3a;
  const parts: PartSpec[] = [
    C(0.22, 0.22, 1.5, [0, 0, 0], olive, { rot: alongZ }),
    K(0.22, 0.5, [0, 0, -1], RED, { rot: [-PI / 2, 0, 0] }),
    B([0.46, 0.04, 0.05], [0, 0, -0.4], 0xf2c94c, { ink: false }),
    C(0.16, 0.2, 0.2, [0, 0, 0.84], STEEL, { rot: alongZ }),
    S(0.2, [0, 0, 1.05], 0xffb03a, { glow: true, ink: false, scale: [1, 1, 1.8] }),
    S(0.12, [0, 0, 1.2], 0xfff1b0, { glow: true, ink: false, scale: [1, 1, 1.6] }),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    parts.push(B([0.04, 0.34, 0.36], [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.55], STEEL, { rot: [0, 0, a - PI / 2] }));
  }
  return parts;
}

/** How far the keg's axle is off the road (units, before scaling): the model is built around its axle so it can roll. */
export const KEG_AXLE = 0.6;

/** The Warlord's explosive keg: a red barrel lying across the road around its axle, with yellow hazard bands and a lit fuse. */
export function kegParts(): PartSpec[] {
  const side: [number, number, number] = [0, 0, PI / 2];
  return [
    C(0.6, 0.6, 1.1, [0, 0, 0], 0xc8322c, { rot: side }),
    C(0.63, 0.63, 0.12, [-0.38, 0, 0], 0xf2c94c, { rot: side }),
    C(0.63, 0.63, 0.12, [0.38, 0, 0], 0xf2c94c, { rot: side }),
    C(0.5, 0.5, 0.04, [-0.56, 0, 0], 0x7a1e1a, { rot: side, ink: false }),
    C(0.5, 0.5, 0.04, [0.56, 0, 0], 0x7a1e1a, { rot: side, ink: false }),
    // a flame mark on the side the squad sees, and the fuse sticking out of one end
    K(0.16, 0.34, [0, 0.02, -0.6], 0xffd23a, { ink: false, rot: [-0.1, 0, 0] }),
    C(0.03, 0.03, 0.3, [0.66, 0.18, 0], 0x2a2a2a, { rot: [0, 0, -0.9] }),
    S(0.09, [0.78, 0.28, 0], 0xffd06a, { glow: true, ink: false }),
  ];
}

/** The Demon's meteor: a lump of dark rock with glowing cracks. The scene gives it its trail of fire as it falls. */
export function meteorParts(): PartSpec[] {
  const rock = 0x3a2a26;
  const lava = 0xff6a1a;
  return [
    S(0.62, [0, 0.6, 0], rock, { scale: [1, 0.92, 1.05] }),
    S(0.3, [0.42, 0.85, 0.1], rock),
    S(0.26, [-0.38, 0.4, -0.2], rock),
    ...[
      [0.2, 0.95, -0.52],
      [-0.4, 0.75, -0.4],
      [0.5, 0.45, -0.3],
      [-0.1, 0.3, -0.56],
    ].map(([x, y, z]) => S(0.11, [x, y, z], lava, { glow: true, ink: false })),
  ];
}
