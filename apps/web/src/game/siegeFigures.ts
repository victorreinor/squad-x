import type { FigureSpec, PartSpec } from "./crowd";
import { B, C, CAP, H, K, PI, S, cut } from "./figures";

/**
 * The characters of the siege mode: a blue knight archer for the squad, a red legionary for the army and a red ogre for
 * its boss. Like every figure they stand with their feet at the origin, facing -z, and are built from simple shapes.
 */

const PIVOTS: FigureSpec["pivots"] = { legL: [-0.1, 0.5, 0], legR: [0.1, 0.5, 0], armL: [-0.27, 1, 0], armR: [0.27, 1, 0] };

const STEEL = 0x9aa8bd;
const STEEL_DARK = 0x6d7a90;
const GOLD = 0xf2c230;
const SKIN = 0xf0c09a;

/** The legs and boots: `cloth` and `boots` are their colours. */
function legs(cloth: number, boots: number, w = 1): PartSpec[] {
  const parts: PartSpec[] = [];
  for (const [role, x] of [["legL", -0.1], ["legR", 0.1]] as const) {
    parts.push(B([0.17 * w, 0.38, 0.19 * w], [x, 0.31, 0], cloth, { role }));
    parts.push(B([0.19 * w, 0.14, 0.27 * w], [x, 0.08, -0.04], boots, { role, skip: "fine" }));
  }
  return parts;
}

/** Sleeves and hands hanging from the shoulders. */
function arms(sleeve: number, skin: number, w = 1): PartSpec[] {
  const parts: PartSpec[] = [];
  for (const [role, x] of [["armL", -0.27], ["armR", 0.27]] as const) {
    parts.push(B([0.11 * w, 0.32, 0.11 * w], [x, 0.82, 0], sleeve, { role, ink: false }));
    parts.push(S(0.07 * w, [x, 0.62, 0], skin, { role, skip: "fine" }));
  }
  return parts;
}

/** The knight as the gallery shows it: a steel helmet with a blue plume, a blue tabard, a round shield and quiver on his back, and a bow. */
export function knightFigure(): FigureSpec {
  const blue = 0x2f62d6;
  const navy = 0x1f3f94;
  const parts: PartSpec[] = [
    ...legs(navy, 0x3a2a22),
    // knee plates
    B([0.15, 0.1, 0.06], [-0.1, 0.4, -0.11], STEEL, { role: "legL", skip: "front" }),
    B([0.15, 0.1, 0.06], [0.1, 0.4, -0.11], STEEL, { role: "legR", skip: "front" }),
    // the body: a blue tabard over a steel breastplate, with a belt
    CAP(0.22, 0.2, [0, 0.8, 0], blue),
    B([0.34, 0.26, 0.08], [0, 0.86, -0.2], STEEL, { skip: "front" }),
    B([0.5, 0.07, 0.34], [0, 0.58, 0], 0x4a3220),
    B([0.1, 0.34, 0.02], [0, 0.8, 0.23], GOLD, { skip: "fine" }),
    // the shield on his back: blue with a gold rim and boss
    C(0.3, 0.3, 0.05, [0, 0.86, 0.3], GOLD, { rot: [PI / 2, 0, 0] }),
    C(0.25, 0.25, 0.07, [0, 0.86, 0.31], blue, { rot: [PI / 2, 0, 0] }),
    S(0.07, [0, 0.86, 0.36], GOLD, { skip: "fine" }),
    // the quiver, with the feathers showing over his shoulder
    C(0.06, 0.06, 0.42, [0.19, 0.92, 0.22], 0x6a4a2a, { rot: [0.35, 0, 0.3] }),
    B([0.1, 0.06, 0.03], [0.24, 1.14, 0.17], 0xf4f0e0, { skip: "fine" }),
    // shoulder plates
    S(0.14, [-0.27, 1, 0], STEEL),
    S(0.14, [0.27, 1, 0], STEEL),
    // the head and the helmet: a dome with a brim, a nose guard and a plume
    C(0.08, 0.09, 0.1, [0, 1.03, 0], SKIN, { skip: "fine" }),
    S(0.19, [0, 1.15, 0], SKIN),
    S(0.03, [-0.07, 1.15, -0.18], 0x1b1b2a, { ink: false, skip: "front" }),
    S(0.03, [0.07, 1.15, -0.18], 0x1b1b2a, { ink: false, skip: "front" }),
    B([0.04, 0.16, 0.03], [0, 1.15, -0.2], STEEL_DARK, { skip: "front" }),
    H(0.27, [0, 1.17, 0], STEEL),
    C(0.3, 0.3, 0.04, [0, 1.12, 0], STEEL_DARK),
    S(0.08, [0, 1.46, 0.05], blue, { scale: [0.7, 1.7, 1.2] }),
    ...arms(blue, SKIN),
    // the bow, held out in front: two limbs bent forward and the string
    B([0.045, 0.3, 0.045], [0.1, 1.12, -0.38], 0x7a4a22, { role: "gun", rot: [0.4, 0, 0] }),
    B([0.045, 0.3, 0.045], [0.1, 0.78, -0.38], 0x7a4a22, { role: "gun", rot: [-0.4, 0, 0] }),
    B([0.012, 0.58, 0.012], [0.1, 0.95, -0.28], 0xf4f0e0, { role: "gun", ink: false }),
  ];
  return { parts, pivots: PIVOTS, legSwing: 0.95, armL: { base: 1.0, swing: 0.08 }, armR: { base: 1.15, swing: 0.08 }, kick: 0.03 };
}

/** How far a round shape of the knight may stray in a run (body units): few sides, because he is a few dozen pixels tall. */
const KNIGHT_SLACK = 0.03;
const KNIGHT_FAR_SLACK = 0.07;

/**
 * The knight as a run draws him: the pieces only seen from the front are left out. `far` is the light version for a
 * big squad, whose knights are drawn small: no fine pieces either, and rounder shapes cut down to fewer sides.
 */
export const runKnight = (far = false): FigureSpec => {
  const figure = cut(far ? KNIGHT_FAR_SLACK : KNIGHT_SLACK, knightFigure);
  return { ...figure, parts: figure.parts.filter((p) => p.skip !== "front" && !(far && p.skip === "fine")) };
};

/**
 * One soldier of the red legion: a hooded helmet with a gold spike, a red tunic with a round shield on the arm, dark
 * trousers. There are thousands of them, so he is a handful of boxes.
 */
export function legionnaireFigure(): FigureSpec {
  const red = 0xc8281e;
  const dark = 0x5a1410;
  const parts: PartSpec[] = [
    ...legs(0x3a2a2a, 0x2a1a18, 1.05),
    B([0.44, 0.46, 0.3], [0, 0.78, 0], red),
    B([0.5, 0.07, 0.34], [0, 0.56, 0], 0x2a1a18, { skip: "fine" }),
    // the round shield on his front, gold-rimmed
    C(0.22, 0.22, 0.05, [0, 0.8, -0.2], GOLD, { rot: [PI / 2, 0, 0], skip: "fine" }),
    C(0.17, 0.17, 0.07, [0, 0.8, -0.22], dark, { rot: [PI / 2, 0, 0], skip: "fine" }),
    S(0.19, [0, 1.12, 0], SKIN),
    H(0.27, [0, 1.15, 0], red),
    C(0.29, 0.29, 0.04, [0, 1.1, 0], dark, { skip: "fine" }),
    K(0.06, 0.22, [0, 1.5, 0], GOLD, { skip: "fine" }),
    ...arms(red, SKIN, 1.05),
  ];
  return { parts, pivots: PIVOTS, legSwing: 0.9, armL: { base: 0.7, swing: 0.15 }, armR: { base: 0.7, swing: 0.15 } };
}

/** How far a legionnaire's round shapes may stray (body units): he is drawn by the thousand and a few pixels tall. */
const LEGION_SLACK = 0.09;

/** The legionnaire as a run draws him: no front-only pieces and no fine ones. */
export const runLegionnaire = (): FigureSpec => {
  const figure = cut(LEGION_SLACK, legionnaireFigure);
  return { ...figure, parts: figure.parts.filter((p) => p.skip === undefined) };
};

const OGRE_PIVOTS: FigureSpec["pivots"] = { legL: [-0.17, 0.55, 0], legR: [0.17, 0.55, 0], armL: [-0.55, 1.15, 0], armR: [0.55, 1.15, 0] };

/** The boss of the legion: a horned red ogre with a white beard, a spiked pauldron and a great club. */
export function ogreFigure(): FigureSpec {
  const skin = 0xd4503f;
  const skinDark = 0xa8362b;
  const fur = 0xe9e1cf;
  const leather = 0x3a2a1a;
  const iron = 0x6d7a90;
  const horn = 0xf2ead2;
  const parts: PartSpec[] = [];
  for (const [role, x] of [["legL", -0.19], ["legR", 0.19]] as const) {
    parts.push(B([0.3, 0.5, 0.32], [x, 0.3, 0], skinDark, { role }));
    parts.push(B([0.34, 0.2, 0.42], [x, 0.1, -0.05], leather, { role }));
    parts.push(S(0.2, [x, 0.4, -0.05], fur, { role, scale: [1.1, 0.6, 1.1] }));
  }
  parts.push(
    // the belly and the chest, bare and red
    S(0.5, [0, 0.85, 0], skin, { scale: [1.15, 0.95, 0.95] }),
    S(0.46, [0, 1.12, -0.02], skin, { scale: [1.35, 0.7, 0.95] }),
    // the belt with a skull buckle
    B([1.0, 0.14, 0.66], [0, 0.64, 0], leather),
    S(0.11, [0, 0.64, -0.36], horn, { ink: false }),
    B([0.74, 0.1, 0.1], [0, 1.26, -0.34], leather, { rot: [0, 0, -0.5], skip: "front" }),
    // the head: a heavy brow, small eyes, the beard and a horned iron cap
    S(0.33, [0, 1.5, 0], skin),
    S(0.36, [0, 1.3, -0.16], fur, { scale: [1, 0.7, 0.6], skip: "fine" }),
    B([0.5, 0.09, 0.1], [0, 1.58, -0.3], skinDark, { skip: "fine" }),
    S(0.045, [-0.11, 1.52, -0.31], 0xfff2c0, { ink: false, glow: true, skip: "fine" }),
    S(0.045, [0.11, 1.52, -0.31], 0xfff2c0, { ink: false, glow: true, skip: "fine" }),
    S(0.06, [0, 1.44, -0.34], skinDark, { skip: "fine" }),
    H(0.35, [0, 1.68, 0], iron),
    C(0.37, 0.37, 0.06, [0, 1.64, 0], 0x4a5568),
    K(0.1, 0.5, [-0.4, 1.96, 0], horn, { rot: [0, 0, 0.75] }),
    K(0.1, 0.5, [0.4, 1.96, 0], horn, { rot: [0, 0, -0.75] }),
  );
  // arms: big sleeves of fur at the shoulders, red forearms, fists; the right one holds the club
  for (const [role, x] of [["armL", -0.55], ["armR", 0.55]] as const) {
    parts.push(S(0.26, [x, 1.2, 0], fur, { role }));
    parts.push(B([0.22, 0.5, 0.22], [x, 0.9, 0], skin, { role }));
    parts.push(S(0.14, [x, 0.62, 0], skin, { role }));
  }
  parts.push(
    K(0.1, 0.3, [-0.66, 1.46, 0], iron, { role: "armL", rot: [0, 0, 0.6] }),
    C(0.07, 0.1, 1.1, [0.8, 1.0, -0.12], 0x7a4a22, { role: "armR" }),
    S(0.22, [0.8, 1.6, -0.12], 0x5a3a1a, { role: "armR" }),
  );
  return { parts, pivots: OGRE_PIVOTS, legSwing: 0.5, armL: { base: 0.2, swing: 0.25 }, armR: { base: 0.5, swing: 0.2 } };
}

/**
 * The champion the legion sends out: a broad fighter in an orange tunic with a red headband, glowing eyes and a club on
 * his shoulder. He is one figure on the road at a time, not a crowd, so he keeps most of his detail.
 */
export function brawlerFigure(): FigureSpec {
  const tunic = 0xe0702a;
  const dark = 0x8a3a14;
  const leather = 0x3a2a1a;
  const band = 0xc8281e;
  const parts: PartSpec[] = [
    ...legs(0x4a3426, 0x2a1a14, 1.35),
    S(0.3, [0, 0.8, 0], tunic, { scale: [1.3, 1, 1.05] }),
    B([0.66, 0.1, 0.44], [0, 0.6, 0], leather),
    B([0.12, 0.12, 0.05], [0, 0.6, -0.23], GOLD, { skip: "fine" }),
    // the head with a headband and glowing eyes
    S(0.22, [0, 1.2, 0], SKIN),
    C(0.225, 0.225, 0.09, [0, 1.28, 0], band),
    B([0.1, 0.07, 0.04], [0.25, 1.26, 0.14], band, { rot: [0, 0.5, 0.3], skip: "fine" }),
    S(0.04, [-0.08, 1.2, -0.2], 0xff2a1a, { ink: false, glow: true, skip: "fine" }),
    S(0.04, [0.08, 1.2, -0.2], 0xff2a1a, { ink: false, glow: true, skip: "fine" }),
    B([0.14, 0.03, 0.03], [0, 1.1, -0.21], 0x5a1a10, { ink: false, skip: "fine" }),
  ];
  for (const [role, x] of [["armL", -0.42], ["armR", 0.42]] as const) {
    parts.push(S(0.17, [x, 1.0, 0], tunic, { role }));
    parts.push(B([0.17, 0.4, 0.17], [x, 0.76, 0], SKIN, { role }));
    parts.push(S(0.1, [x, 0.54, 0], dark, { role }));
  }
  parts.push(C(0.05, 0.08, 0.95, [0.5, 0.95, -0.12], 0x7a4a22, { role: "armR", rot: [0.5, 0, 0.2] }), S(0.17, [0.58, 1.38, -0.34], 0x5a3a1a, { role: "armR" }));
  return { parts, pivots: { ...PIVOTS, armL: [-0.42, 1, 0], armR: [0.42, 1, 0] }, legSwing: 0.7, armL: { base: 0.5, swing: 0.2 }, armR: { base: 0.2, swing: 0.15 } };
}

/** The champion as a run draws him. */
export const runBrawler = (): FigureSpec => {
  const figure = cut(0.02, brawlerFigure);
  return { ...figure, parts: figure.parts.filter((p) => p.skip !== "front" && p.skip !== "fine") };
};

/** How big the ogre is drawn next to a knight. */
export const OGRE_SCALE = 2.6;
