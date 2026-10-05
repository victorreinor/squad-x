import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Which part of the body a piece belongs to: it decides how the piece moves. */
export type Role = "static" | "legL" | "legR" | "armL" | "armR" | "gun";
const ROLES: Role[] = ["static", "legL", "legR", "armL", "armR", "gun"];

/**
 * One piece of a figure, already placed in body space: feet at the origin, the figure about 1.35 tall, facing -z.
 * `glow` pieces ignore the lighting (eyes, fuses, cracks of lava). Every piece gets a black outline unless `ink` is false.
 */
export interface PartSpec {
  geo: THREE.BufferGeometry;
  color: number;
  role: Role;
  glow?: boolean;
  ink?: boolean;
  /** when the piece can be left out: "front" only shows with the figure facing the camera, "fine" is too small to tell on a figure drawn small */
  skip?: "front" | "fine";
}

/** How an arm hangs or aims: `base` is the angle it holds (0 down, about 1.2 forward) and `swing` how much it swings. */
export interface ArmPose {
  base: number;
  swing: number;
}

/** A whole figure: its pieces and how its limbs move when it runs. */
export interface FigureSpec {
  parts: PartSpec[];
  /** where each limb turns: the hip for legs, the shoulder for arms */
  pivots: Partial<Record<Role, [number, number, number]>>;
  legSwing: number;
  armL: ArmPose;
  armR: ArmPose;
  /** how far the gun jumps back when the squad fires */
  kick?: number;
}

/** A soft three-step shading ramp, shared by every toon material. */
export function toonRamp(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** The black outline of a piece: the same shape, a little bigger around its own centre, drawn from the inside out. */
function outlineOf(geo: THREE.BufferGeometry, grow: number): THREE.BufferGeometry {
  const g = geo.clone();
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.scale(grow, grow, grow);
  g.translate(c.x, c.y, c.z);
  return g;
}

/** A merged mesh for a group of pieces, or null when there are none. */
function merged(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  return geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
}

/** Group a list of pieces by colour (and glow) so each group is one mesh. */
function byLook(parts: PartSpec[]): Map<string, PartSpec[]> {
  const groups = new Map<string, PartSpec[]>();
  for (const p of parts) {
    const key = `${p.color}|${p.glow ? 1 : 0}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return groups;
}

/** Plain (non-instanced) meshes for a list of pieces: for weapon icons and the like. */
export function partsToGroup(parts: PartSpec[], ramp: THREE.DataTexture, outline = true): THREE.Group {
  const group = new THREE.Group();
  const ink = new THREE.MeshBasicMaterial({ color: 0x10131c, side: THREE.BackSide });
  for (const [, list] of byLook(parts)) {
    const geo = merged(list.map((p) => p.geo))!;
    const material = list[0].glow ? new THREE.MeshBasicMaterial({ color: list[0].color }) : new THREE.MeshToonMaterial({ color: list[0].color, gradientMap: ramp });
    group.add(new THREE.Mesh(geo, material));
  }
  const lines = merged(parts.filter((p) => p.ink !== false).map((p) => outlineOf(p.geo, 1.14)));
  if (outline && lines) group.add(new THREE.Mesh(lines, ink));
  return group;
}

const inst = new THREE.Matrix4();
const local = new THREE.Matrix4();
const out = new THREE.Matrix4();
const toPivot = new THREE.Matrix4();
const fromPivot = new THREE.Matrix4();
const turn = new THREE.Matrix4();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const quat = new THREE.Quaternion();
const qy = new THREE.Quaternion();
const qx = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const noTurn = new THREE.Quaternion();
const white = new THREE.Color(1, 1, 1);
const tint = new THREE.Color();

/** the angle that points an arm straight up */
const RAISED = 2.9;

/** how much bigger than the fill the black outline is */
const OUTLINE = 1.14;

/** The meshes that draw one role of the body, for every fighter at once. */
interface Layer {
  role: Role;
  fills: THREE.InstancedMesh[];
  ink: THREE.InstancedMesh | null;
}

/**
 * Hundreds of fighters drawn with a few dozen draw calls: the pieces of a figure are merged by colour into one
 * InstancedMesh each, with a black outline behind. Limbs swing around their joints as the figure runs.
 */
export class Crowd {
  readonly group = new THREE.Group();
  private layers: Layer[] = [];
  private readonly shadow: THREE.InstancedMesh;
  private readonly ramp: THREE.DataTexture;
  private readonly inkMaterial = new THREE.MeshBasicMaterial({ color: 0x10131c, side: THREE.BackSide });
  private used = 0;

  constructor(readonly capacity: number, private spec: FigureSpec, ramp: THREE.DataTexture) {
    this.ramp = ramp;
    for (const role of ROLES) this.layers.push(this.buildLayer(role, spec.parts.filter((p) => p.role === role)));

    const blob = new THREE.CircleGeometry(0.42, 14);
    blob.rotateX(-Math.PI / 2);
    this.shadow = new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }), capacity);
    this.shadow.frustumCulled = false;
    this.shadow.count = 0;
    this.group.add(this.shadow);
  }

  private instanced(geo: THREE.BufferGeometry, material: THREE.Material, tinted: boolean) {
    const mesh = new THREE.InstancedMesh(geo, material, this.capacity);
    mesh.frustumCulled = false;
    mesh.count = 0;
    if (tinted) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3).fill(1), 3);
    this.group.add(mesh);
    return mesh;
  }

  private buildLayer(role: Role, parts: PartSpec[]): Layer {
    const fills: THREE.InstancedMesh[] = [];
    for (const [, list] of byLook(parts)) {
      const geo = merged(list.map((p) => p.geo.clone()))!;
      const material = list[0].glow ? new THREE.MeshBasicMaterial({ color: list[0].color }) : new THREE.MeshToonMaterial({ color: list[0].color, gradientMap: this.ramp });
      fills.push(this.instanced(geo, material, true));
    }
    const lines = merged(parts.filter((p) => p.ink !== false).map((p) => outlineOf(p.geo, OUTLINE)));
    return { role, fills, ink: lines ? this.instanced(lines, this.inkMaterial, false) : null };
  }

  /** Swap the pieces of the gun, e.g. when the squad picks up a better weapon. */
  setGun(parts: PartSpec[]) {
    const i = this.layers.findIndex((l) => l.role === "gun");
    for (const mesh of [...this.layers[i].fills, this.layers[i].ink]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material !== this.inkMaterial) (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.layers[i] = this.buildLayer("gun", parts);
  }

  /** Start a new frame: forget last frame's fighters. */
  begin() {
    this.used = 0;
  }

  /**
   * Place one fighter. `x, z` are world coordinates, `facing` is the yaw (0 looks down -z), `phase` desynchronises
   * the walk, `time` drives it (0 stands still). `flash` (0 to 1) whitens it for a hit, `fall` (0 to 1) tips it onto
   * its back, `lean` (radians) bends it forward as it runs, `kick` pushes the gun back as it fires and `raise`
   * (0 to 1) lifts both arms overhead, as a boss does before it smashes the road.
   */
  add(x: number, z: number, scale: number, facing: number, phase: number, time: number, flash = 0, fall = 0, lean = 0, kick = 0, raise = 0) {
    if (this.used >= this.capacity) return;
    const i = this.used++;
    const walking = time !== 0;
    const swing = walking ? Math.sin(time * 11 + phase) : 0;
    const bob = (walking ? Math.abs(swing) * 0.07 : 0) * scale - fall * 0.25 * scale;
    qy.setFromAxisAngle(AXIS_Y, facing);
    qx.setFromAxisAngle(AXIS_X, -lean + fall * 1.45);
    quat.multiplyQuaternions(qy, qx);
    inst.compose(pos.set(x, bob, z), quat, scl.set(scale, scale * (1 - 0.25 * fall), scale));
    tint.copy(white).multiplyScalar(1 + flash * 2.4);
    const { legSwing, armL, armR, pivots } = this.spec;

    for (const layer of this.layers) {
      const angle =
        layer.role === "legL" ? swing * legSwing :
        layer.role === "legR" ? -swing * legSwing :
        layer.role === "armL" ? armL.base - swing * armL.swing + raise * (RAISED - armL.base) :
        layer.role === "armR" ? armR.base + swing * armR.swing + raise * (RAISED - armR.base) :
        0;
      const pivot = pivots[layer.role];
      if (pivot && angle) {
        toPivot.makeTranslation(-pivot[0], -pivot[1], -pivot[2]);
        fromPivot.makeTranslation(pivot[0], pivot[1], pivot[2]);
        local.multiplyMatrices(fromPivot, turn.makeRotationX(angle)).multiply(toPivot);
      } else if (layer.role === "gun" && kick) {
        local.makeTranslation(0, 0, kick);
      } else {
        local.identity();
      }
      out.multiplyMatrices(inst, local);
      for (const mesh of layer.fills) {
        mesh.setMatrixAt(i, out);
        mesh.setColorAt(i, tint);
      }
      layer.ink?.setMatrixAt(i, out);
    }
    this.shadow.setMatrixAt(i, out.compose(pos.set(x, 0.03, z), noTurn, scl.set(scale, 1, scale)));
  }

  /** Finish the frame: upload what was placed, and only that (an empty crowd uploads nothing). */
  end() {
    if (!this.used && !this.shadow.count) return;
    const upload = (attribute: THREE.InstancedBufferAttribute) => {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.used * attribute.itemSize);
      attribute.needsUpdate = true;
    };
    for (const layer of this.layers) {
      for (const mesh of [...layer.fills, layer.ink]) {
        if (!mesh) continue;
        mesh.count = this.used;
        upload(mesh.instanceMatrix);
        if (mesh.instanceColor) upload(mesh.instanceColor);
      }
    }
    this.shadow.count = this.used;
    upload(this.shadow.instanceMatrix);
  }

  dispose() {
    for (const layer of this.layers) {
      for (const mesh of [...layer.fills, layer.ink]) {
        if (!mesh) continue;
        mesh.geometry.dispose();
        if (mesh.material !== this.inkMaterial) (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
    }
    this.inkMaterial.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.shadow.dispose();
  }
}
