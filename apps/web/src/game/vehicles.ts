import * as THREE from "three";
import type { VehicleKind } from "@squadx/engine";
import { partsToGroup, type PartSpec } from "./crowd";
import { B, C, CAP, H, K, PI, S, T, alongZ } from "./figures";

/** A vehicle model, and the part that spins (a helicopter's rotor), if it has one. */
export interface VehicleModel {
  group: THREE.Group;
  rotor: THREE.Object3D | null;
}

const BLUE = 0x3b9cff;
const NAVY = 0x1f5fb8;
const DARK = 0x20242e;
const STEEL = 0x8b95a7;
const CHROME = 0xc4ccd8;
const TIRE = 0x15171c;
const OLIVE = 0x4a7a32;
const SKIN = 0xf0c09a;

/** A soldier from the waist up, riding or manning a gun: a helmet, a head and a vest. `at` is the middle of his chest. */
function rider(at: [number, number, number], lean = 0): PartSpec[] {
  const [x, y, z] = at;
  return [
    CAP(0.15, 0.14, [x, y, z], 0x55803a, { rot: [lean, 0, 0] }),
    S(0.13, [x, y + 0.3, z - lean * 0.4], SKIN),
    H(0.19, [x, y + 0.32, z - lean * 0.4], OLIVE),
    C(0.2, 0.2, 0.03, [x, y + 0.28, z - lean * 0.4], 0x35582a),
    B([0.22, 0.2, 0.06], [x, y + 0.02, z + 0.12], 0x8c7b4a),
  ];
}

/** A motorbike with a soldier on it: wheels with chrome rims, a fuel tank with a stripe, exhaust and a glowing headlight. */
function motoParts(): PartSpec[] {
  const wheel = (z: number): PartSpec[] => [T(0.3, 0.1, [0, 0.32, z], TIRE), C(0.2, 0.2, 0.1, [0, 0.32, z], CHROME, { rot: [0, 0, PI / 2] }), C(0.06, 0.06, 0.14, [0, 0.32, z], DARK, { rot: [0, 0, PI / 2] })];
  return [
    ...wheel(-0.68),
    ...wheel(0.68),
    // fork, frame and engine
    B([0.05, 0.56, 0.05], [-0.07, 0.62, -0.62], CHROME, { rot: [0.28, 0, 0] }),
    B([0.05, 0.56, 0.05], [0.07, 0.62, -0.62], CHROME, { rot: [0.28, 0, 0] }),
    B([0.16, 0.2, 1.0], [0, 0.52, 0.06], NAVY),
    B([0.26, 0.24, 0.34], [0, 0.38, 0.02], DARK),
    // fuel tank with a white stripe, seat, rear fender
    S(0.21, [0, 0.74, -0.22], BLUE, { scale: [0.95, 0.8, 1.45] }),
    B([0.05, 0.02, 0.5], [0, 0.89, -0.22], 0xffffff, { ink: false }),
    B([0.22, 0.1, 0.5], [0, 0.68, 0.36], DARK),
    B([0.2, 0.05, 0.4], [0, 0.55, 0.72], BLUE),
    // exhaust pipe with a shiny tip
    C(0.05, 0.06, 0.8, [0.15, 0.3, 0.28], CHROME, { rot: alongZ }),
    C(0.07, 0.07, 0.1, [0.15, 0.3, 0.7], DARK, { rot: alongZ }),
    // handlebar with grips and mirrors, headlight
    B([0.66, 0.05, 0.05], [0, 1.0, -0.55], DARK),
    S(0.045, [-0.34, 1.0, -0.55], DARK),
    S(0.045, [0.34, 1.0, -0.55], DARK),
    B([0.07, 0.07, 0.03], [-0.3, 1.14, -0.55], CHROME, { rot: [0, 0, 0.3] }),
    B([0.07, 0.07, 0.03], [0.3, 1.14, -0.55], CHROME, { rot: [0, 0, -0.3] }),
    S(0.11, [0, 0.86, -0.74], 0xfff0a0, { glow: true, ink: false }),
    // the rider: arms to the handlebar, legs on the pegs
    ...rider([0, 1.08, 0.3], 0.35),
    B([0.08, 0.42, 0.08], [-0.2, 0.98, -0.1], 0x55803a, { rot: [1.1, 0, 0] }),
    B([0.08, 0.42, 0.08], [0.2, 0.98, -0.1], 0x55803a, { rot: [1.1, 0, 0] }),
    B([0.12, 0.34, 0.14], [-0.2, 0.62, 0.3], 0x4b6b34, { rot: [-0.2, 0, 0] }),
    B([0.12, 0.34, 0.14], [0.2, 0.62, 0.3], 0x4b6b34, { rot: [-0.2, 0, 0] }),
    B([0.1, 0.08, 0.24], [-0.2, 0.42, 0.22], 0x2b2622),
    B([0.1, 0.08, 0.24], [0.2, 0.42, 0.22], 0x2b2622),
  ];
}

/** A tank with tracks and road wheels, a sloped hull, a round turret, a long gun with a muzzle brake and a gunner in the hatch. */
function tankParts(): PartSpec[] {
  const parts: PartSpec[] = [];
  for (const side of [-1, 1]) {
    const x = side * 0.84;
    parts.push(B([0.4, 0.44, 2.3], [x, 0.3, 0], DARK));
    parts.push(B([0.46, 0.05, 2.36], [x, 0.54, 0], NAVY));
    for (let i = 0; i < 5; i++) parts.push(C(0.2, 0.2, 0.44, [x, 0.24, -0.9 + i * 0.45], STEEL, { rot: [0, 0, PI / 2] }));
    parts.push(C(0.26, 0.26, 0.44, [x, 0.4, -1.12], DARK, { rot: [0, 0, PI / 2] }));
    parts.push(C(0.26, 0.26, 0.44, [x, 0.4, 1.12], DARK, { rot: [0, 0, PI / 2] }));
  }
  return [
    ...parts,
    // hull: a sloped front, a deck with an engine grille
    B([1.34, 0.42, 2.0], [0, 0.56, 0], BLUE),
    B([1.34, 0.34, 0.6], [0, 0.56, -1.0], BLUE, { rot: [0.6, 0, 0] }),
    B([0.9, 0.05, 0.55], [0, 0.8, 0.7], DARK),
    ...[-0.3, -0.1, 0.1, 0.3].map((x) => B([0.04, 0.06, 0.5], [x, 0.83, 0.7], STEEL)),
    // turret with a thick mantlet, the gun and its muzzle brake
    C(0.52, 0.6, 0.34, [0, 0.98, 0.05], BLUE),
    B([0.46, 0.32, 0.22], [0, 0.98, -0.52], NAVY),
    C(0.075, 0.09, 1.5, [0, 1.0, -1.28], STEEL, { rot: alongZ }),
    C(0.12, 0.12, 0.2, [0, 1.0, -2.0], DARK, { rot: alongZ }),
    // a star on the turret and a gunner with a machine gun on the hatch
    B([0.04, 0.2, 0.2], [0.53, 1.0, 0.05], 0xf2c94c, { rot: [0.4, 0, 0], ink: false }),
    C(0.17, 0.17, 0.1, [0.18, 1.18, 0.26], DARK),
    ...rider([0.18, 1.34, 0.26]),
    C(0.02, 0.02, 0.35, [0.3, 1.28, 0.04], DARK, { rot: alongZ }),
    // antenna with a little flag
    C(0.012, 0.012, 1.1, [-0.38, 1.5, 0.55], DARK),
    B([0.2, 0.12, 0.02], [-0.28, 1.95, 0.55], 0xf2c94c),
  ];
}

/** The helicopter's body: a bubble cockpit with a pilot, a tail boom, skids, rocket pods and a chin gun. */
function heliParts(): PartSpec[] {
  const glass = 0x9fdcff;
  return [
    // skids and struts
    C(0.035, 0.035, 1.6, [-0.42, 0.06, 0], DARK, { rot: alongZ }),
    C(0.035, 0.035, 1.6, [0.42, 0.06, 0], DARK, { rot: alongZ }),
    ...[-0.4, 0.45].flatMap((z) => [-0.4, 0.4].map((x) => B([0.04, 0.5, 0.04], [x * 0.9, 0.3, z], DARK, { rot: [0, 0, -x * 0.5] }))),
    // fuselage, cockpit glass and the pilot inside it
    S(0.5, [0, 0.74, 0.05], BLUE, { scale: [0.82, 0.78, 1.35] }),
    S(0.36, [0, 0.86, -0.56], glass, { scale: [0.88, 0.82, 1.05] }),
    ...rider([0, 0.66, -0.5]).slice(1, 4),
    B([0.5, 0.06, 0.8], [0, 0.55, 0.0], NAVY),
    // tail boom, fin and tail rotor
    C(0.1, 0.18, 1.5, [0, 0.95, 1.2], BLUE, { rot: alongZ }),
    B([0.05, 0.55, 0.32], [0, 1.2, 1.9], NAVY, { rot: [0.3, 0, 0] }),
    B([0.04, 0.5, 0.08], [0.1, 1.05, 1.88], STEEL, { rot: [0, 0, 0.4] }),
    // engine hump, mast and hub
    B([0.46, 0.22, 0.6], [0, 1.22, 0.25], DARK),
    C(0.05, 0.05, 0.22, [0, 1.42, 0.22], DARK),
    S(0.09, [0, 1.55, 0.22], CHROME),
    // weapons: rocket pods on stubby wings, and a gun under the nose
    B([1.5, 0.05, 0.28], [0, 0.78, 0.1], NAVY),
    ...[-1, 1].flatMap((side) => [C(0.1, 0.1, 0.6, [side * 0.68, 0.7, -0.16], DARK, { rot: alongZ }), K(0.1, 0.22, [side * 0.68, 0.7, -0.58], 0xd23a3a, { rot: [-PI / 2, 0, 0] })]),
    C(0.035, 0.035, 0.45, [0, 0.38, -0.78], DARK, { rot: alongZ }),
  ];
}

/** The main rotor: four blades on a hub, plus a faint disc that sells the blur. */
function rotorGroup(ramp: THREE.DataTexture): THREE.Group {
  const blades: PartSpec[] = [0, PI / 2, PI, (3 * PI) / 2].map((a) => B([0.14, 0.03, 1.6], [Math.sin(a) * 0.8, 1.58, Math.cos(a) * 0.8], DARK, { rot: [0, a, 0] }));
  const group = partsToGroup(blades, ramp, false);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.65, 28), new THREE.MeshBasicMaterial({ color: 0xdfe8f2, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 1.58;
  group.add(disc);
  return group;
}

/** Vehicles built from simple shapes with a black outline, like the soldiers, each with a soldier riding or manning it. They face -z. */
export function buildVehicle(kind: VehicleKind, ramp: THREE.DataTexture): VehicleModel {
  const parts = kind === "moto" ? motoParts() : kind === "tank" ? tankParts() : heliParts();
  const group = partsToGroup(parts, ramp);
  if (kind !== "heli") return { group, rotor: null };
  const rotor = rotorGroup(ramp);
  group.add(rotor);
  return { group, rotor };
}

/** How high a vehicle floats above the road: only the helicopter leaves the ground. */
export const HOVER: Record<VehicleKind, number> = { moto: 0, tank: 0, heli: 1.9 };

/** Seconds between two shots of a vehicle, and the colour and thickness of its tracer. */
export const VEHICLE_SHOT: Record<VehicleKind, { gap: number; color: number; thick: number }> = {
  moto: { gap: 0.16, color: 0xffc83a, thick: 2 },
  heli: { gap: 0.11, color: 0xffd36b, thick: 2.6 },
  tank: { gap: 0.32, color: 0xff9a3c, thick: 3 },
};

export const VEHICLE_NAMES: Record<VehicleKind, string> = { moto: "MOTO", heli: "HELI", tank: "TANQUE" };
