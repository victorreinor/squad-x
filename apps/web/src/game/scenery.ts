import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LANE_HALF_WIDTH, nextRandom } from "@squadx/engine";
import type { ThemeLook } from "./themes";

/** The engine runs down +z; the camera looks down -z so +x is on the right. */
const Z = (z: number) => -z;

/** What the scenery needs to keep moving: the water, the falling snow, the embers. `camZ` is where the camera is on the road. */
export interface Dressing {
  update(time: number, camZ: number): void;
}

interface Where {
  scene: THREE.Scene;
  /** world z of the middle of the road and how long it is */
  mid: number;
  length: number;
  look: ThemeLook;
  disposables: { dispose(): void }[];
}

/** A concrete road barrier seen from the end: wide at the base, a sloped shoulder, a narrow top. */
function barrierGeometry(length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.3, 0);
  shape.lineTo(0.3, 0);
  shape.lineTo(0.23, 0.32);
  shape.lineTo(0.13, 0.95);
  shape.lineTo(-0.13, 0.95);
  shape.lineTo(-0.23, 0.32);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
}

/** Water that looks like water: a tile of soft wave strokes, scrolled by `update`. */
function waterTexture(base: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = `#${base.toString(16).padStart(6, "0")}`;
  g.fillRect(0, 0, 256, 256);
  const rng = { rng: 4242 };
  for (let i = 0; i < 160; i++) {
    const x = nextRandom(rng) * 256;
    const y = nextRandom(rng) * 256;
    const w = 14 + nextRandom(rng) * 40;
    g.strokeStyle = nextRandom(rng) < 0.55 ? "rgba(255,255,255,0.22)" : "rgba(0,30,70,0.2)";
    g.lineWidth = 1 + nextRandom(rng) * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + w / 2, y - 4, x + w, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 40);
  return t;
}

const steel = (color: number, rough = 0.5, metal = 0.35) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

/** Concrete barriers down both sides of the road, with a stripe in the scenery's colour along the top. */
export function addBarriers({ scene, mid, length, look, disposables }: Where) {
  const geo = barrierGeometry(length);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.9 });
  const stripe = new THREE.MeshStandardMaterial({ color: look.rail, roughness: 0.6 });
  const stripeGeo = new THREE.BoxGeometry(0.2, 0.08, length);
  for (const side of [-1, 1]) {
    const barrier = new THREE.Mesh(geo, concrete);
    barrier.position.set(side * (LANE_HALF_WIDTH + 0.32), 0, mid - length / 2);
    scene.add(barrier);
    const top = new THREE.Mesh(stripeGeo, stripe);
    top.position.set(side * (LANE_HALF_WIDTH + 0.32), 0.62, mid);
    scene.add(top);
  }
  disposables.push(geo, stripeGeo, concrete, stripe);
}

/**
 * A suspension bridge: a steel railing, tapered towers with cross braces, main cables that sag between the towers
 * with hangers down to the deck, girders under the road, and moving water far below.
 */
export function addBridge({ scene, mid, length, look, disposables }: Where): Dressing {
  const start = mid - length / 2;
  const end = mid + length / 2;
  const paint = steel(look.rail, 0.55, 0.3);
  const dark = steel(0x3a404c, 0.6, 0.5);
  const cable = steel(0x6a6f78, 0.4, 0.7);
  const add = <T extends THREE.Object3D>(o: T) => {
    scene.add(o);
    return o;
  };

  // railing: two rails on posts along each side, on top of the barrier
  const railGeo = new THREE.CylinderGeometry(0.04, 0.04, length, 8);
  railGeo.rotateX(Math.PI / 2);
  const posts = Math.floor(length / 3);
  const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.62, 8);
  const postMesh = new THREE.InstancedMesh(postGeo, dark, posts * 2);
  const m = new THREE.Matrix4();
  for (const [k, side] of [-1, 1].entries()) {
    for (const y of [1.15, 1.5]) add(new THREE.Mesh(railGeo, dark)).position.set(side * (LANE_HALF_WIDTH + 0.32), y, mid);
    for (let i = 0; i < posts; i++) postMesh.setMatrixAt(k * posts + i, m.makeTranslation(side * (LANE_HALF_WIDTH + 0.32), 1.25, start + i * 3 + 1.5));
  }
  add(postMesh);

  // the deck seen from the side: a fascia below the barrier, girders and ribs under the road
  const fasciaGeo = new THREE.BoxGeometry(0.18, 1.1, length);
  const ribGeo = new THREE.BoxGeometry(LANE_HALF_WIDTH * 2 + 1, 0.3, 0.3);
  const ribs = Math.floor(length / 6);
  const ribMesh = new THREE.InstancedMesh(ribGeo, dark, ribs);
  for (let i = 0; i < ribs; i++) ribMesh.setMatrixAt(i, m.makeTranslation(0, -1.25, start + i * 6));
  add(ribMesh);
  for (const side of [-1, 1]) add(new THREE.Mesh(fasciaGeo, paint)).position.set(side * (LANE_HALF_WIDTH + 0.55), -0.5, mid);

  // towers every 70 units: tapered legs, cross braces and a cap
  const towerZ: number[] = [];
  for (let z = start + 50; z < end; z += 70) towerZ.push(z);
  const legX = LANE_HALF_WIDTH + 1.4;
  // tall enough that the cross braces stay above the camera, which flies about 17 units over the road
  const top = 32;
  const legGeo = new THREE.CylinderGeometry(0.55, 0.85, top, 4, 1);
  legGeo.rotateY(Math.PI / 4);
  const braceGeo = new THREE.BoxGeometry(legX * 2 - 0.4, 0.5, 0.6);
  const xGeo = new THREE.BoxGeometry(0.22, 1, 0.22);
  const lampGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
  for (const z of towerZ) {
    for (const side of [-1, 1]) add(new THREE.Mesh(legGeo, paint)).position.set(side * legX, top / 2 - 0.4, z);
    for (const y of [26, 30.6]) add(new THREE.Mesh(braceGeo, paint)).position.set(0, y, z);
    // X braces between the braces
    for (const y of [28.3]) {
      const span = Math.hypot(legX * 2, 4.6);
      for (const flip of [-1, 1]) {
        const x = add(new THREE.Mesh(xGeo, paint));
        x.scale.y = span * 0.95;
        x.position.set(0, y, z);
        x.rotation.z = flip * Math.atan2(legX * 2, 4.6);
      }
    }
    for (const side of [-1, 1]) add(new THREE.Mesh(lampGeo, lampMat)).position.set(side * legX, top + 0.1, z);
  }

  // main cables: a sagging curve between each pair of towers, and hangers down to the deck
  const cableX = LANE_HALF_WIDTH + 0.5;
  const sag = (t: number) => 2.4 + (top - 1.4 - 2.4) * (2 * t - 1) ** 2;
  const hangerGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
  const hangers: [number, number, number][] = [];
  const zs = [start + 50 - 70, ...towerZ, towerZ[towerZ.length - 1] + 70];
  for (let i = 0; i < zs.length - 1; i++) {
    for (const side of [-1, 1]) {
      const pts = Array.from({ length: 24 }, (_, k) => {
        const t = k / 23;
        return new THREE.Vector3(side * cableX, sag(t), zs[i] + (zs[i + 1] - zs[i]) * t);
      });
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.1, 6, false);
      add(new THREE.Mesh(tube, cable));
      disposables.push(tube);
    }
    for (let z = zs[i] + 3.5; z < zs[i + 1] - 1; z += 3.5) {
      const t = (z - zs[i]) / (zs[i + 1] - zs[i]);
      for (const side of [-1, 1]) hangers.push([side * cableX, sag(t), z]);
    }
  }
  const hangerMesh = new THREE.InstancedMesh(hangerGeo, cable, hangers.length);
  hangers.forEach(([x, y, z], i) => hangerMesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, 1.5 + (y - 1.5) / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, Math.max(0.1, y - 1.5), 1))));
  add(hangerMesh);

  // the water far below, with waves that roll toward the camera
  const waves = waterTexture(look.ground);
  const water = add(new THREE.Mesh(new THREE.PlaneGeometry(500, length + 300), new THREE.MeshStandardMaterial({ map: waves, roughness: 0.3, metalness: 0.05 })));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -6, mid);

  disposables.push(railGeo, postGeo, postMesh, fasciaGeo, ribGeo, ribMesh, legGeo, braceGeo, xGeo, lampGeo, lampMat, hangerGeo, hangerMesh, waves, water.geometry, water.material as THREE.Material, paint, dark, cable);
  return {
    update(time: number) {
      waves.offset.set(time * 0.004, time * 0.02);
    },
  };
}

// ------------------------------------------------------------------ the other worlds

/** A seeded pick in [lo, hi). */
const rand = (rng: { rng: number }, lo: number, hi: number) => lo + nextRandom(rng) * (hi - lo);

/** Place `count` instances: `put(i)` gives the position, size and colour of each. */
function instances(where: Where, geo: THREE.BufferGeometry, material: THREE.Material, count: number, put: (i: number) => { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; color?: number }) {
  const mesh = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const p = put(i);
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y, Z(p.z)), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ry ?? 0), new THREE.Vector3(p.sx, p.sy, p.sz)));
    if (p.color !== undefined) mesh.setColorAt(i, c.setHex(p.color));
  }
  where.scene.add(mesh);
  where.disposables.push(geo, material, mesh);
  return mesh;
}

/** A tall building face: windows in a grid, some lit. The texture repeats once per 3 x 6 units. */
function windowTexture(lit: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = lit ? "#000" : "#8f9aa8";
  g.fillRect(0, 0, 64, 128);
  const rng = { rng: lit ? 31 : 32 };
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const on = nextRandom(rng) < 0.38;
      g.fillStyle = lit ? (on ? "#ffd98a" : "#000") : on ? "#f6d58a" : "#33414f";
      g.fillRect(col * 16 + 3, row * 16 + 3, 10, 11);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A city: towers with lit windows in three heights, and a few abandoned cars beyond the barriers. */
function addCity(where: Where) {
  const rng = { rng: 2024 };
  const color = windowTexture(false);
  const glow = windowTexture(true);
  const span = where.length;
  for (const h of [9, 15, 24]) {
    const geo = new THREE.BoxGeometry(4.2, h, 4.2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.4, uv.getY(i) * (h / 6));
    const material = new THREE.MeshStandardMaterial({ map: color, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.85 });
    const per = Math.floor(span / 14);
    instances(where, geo, material, per * 2, (i) => ({
      x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 3.6, LANE_HALF_WIDTH + 9),
      y: h / 2 - 0.4,
      z: where.mid - span / 2 + (i >> 1) * 14 + rand(rng, 0, 12) + (h === 15 ? 5 : h === 24 ? 9 : 0),
      sx: rand(rng, 0.9, 1.6),
      sy: 1,
      sz: rand(rng, 0.9, 1.6),
      ry: Math.floor(nextRandom(rng) * 4) * (Math.PI / 2) * 0,
      color: [0xffffff, 0xe8e0d4, 0xd4dce8, 0xf0d8c8][Math.floor(nextRandom(rng) * 4)],
    }));
  }
  where.disposables.push(color, glow);
  // cars: a body, a cabin and four wheels in one shape, tinted per car
  const car = mergeGeometries([
    new THREE.BoxGeometry(1.0, 0.4, 2.2).translate(0, 0.45, 0),
    new THREE.BoxGeometry(0.86, 0.34, 1.1).translate(0, 0.82, 0.1),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.CylinderGeometry(0.22, 0.22, 0.18, 10).rotateZ(Math.PI / 2).translate(sx * 0.5, 0.22, sz * 0.7))),
  ])!;
  instances(where, car, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), Math.floor(span / 30), (i) => ({
    x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 1.6, LANE_HALF_WIDTH + 3),
    y: -0.4,
    z: where.mid - span / 2 + i * 30 + rand(rng, 0, 20),
    sx: 1.3,
    sy: 1.3,
    sz: 1.3,
    ry: rand(rng, -0.4, 0.4) + (i % 2 ? 0 : Math.PI),
    color: [0xc23a3a, 0x3a6ac2, 0xe0c23a, 0xd8d8d8, 0x3a3a44][i % 5],
  }));
}

/** A desert: weathered rocks, flat-topped mesas in layered colours, dunes, and cacti with arms. */
function addDesert(where: Where) {
  const rng = { rng: 88 };
  const span = where.length;
  const sand = [0xc99655, 0xb07c42, 0xe0b878, 0xd2a06a];
  instances(where, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), Math.floor(span / 5) * 2, (i) => ({
    x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 1.4, LANE_HALF_WIDTH + 12),
    y: 0.4,
    z: where.mid - span / 2 + (i >> 1) * 5 + rand(rng, 0, 4),
    sx: rand(rng, 0.8, 2.6),
    sy: rand(rng, 0.7, 2.4),
    sz: rand(rng, 0.8, 2.4),
    ry: rand(rng, 0, 3),
    color: sand[Math.floor(nextRandom(rng) * sand.length)],
  }));
  const mesaGeo = mergeGeometries([new THREE.CylinderGeometry(5, 6.4, 9, 8).translate(0, 4.5, 0), new THREE.CylinderGeometry(4.6, 5, 3, 8).translate(0, 10.5, 0)])!;
  instances(where, mesaGeo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), Math.floor(span / 60) * 2, (i) => ({
    x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 26, LANE_HALF_WIDTH + 52),
    y: -0.4,
    z: where.mid - span / 2 + (i >> 1) * 60 + rand(rng, 0, 30),
    sx: rand(rng, 0.9, 1.5),
    sy: rand(rng, 0.8, 1.4),
    sz: rand(rng, 0.9, 1.5),
    color: sand[i % sand.length],
  }));
  instances(where, new THREE.SphereGeometry(1, 14, 8), new THREE.MeshStandardMaterial({ color: 0xe6c488, roughness: 1 }), Math.floor(span / 18) * 2, (i) => ({
    x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 12, LANE_HALF_WIDTH + 36),
    y: -0.5,
    z: where.mid - span / 2 + (i >> 1) * 18 + rand(rng, 0, 14),
    sx: rand(rng, 6, 12),
    sy: rand(rng, 1.2, 2.6),
    sz: rand(rng, 5, 9),
  }));
  // a cactus: a trunk and two arms that bend up, in one shape
  const cactus = mergeGeometries([
    new THREE.CylinderGeometry(0.26, 0.3, 2.4, 10).translate(0, 1.2, 0),
    new THREE.SphereGeometry(0.26, 10, 8).translate(0, 2.4, 0),
    new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8).rotateZ(Math.PI / 2).translate(-0.5, 1.2, 0),
    new THREE.CylinderGeometry(0.15, 0.15, 0.7, 8).translate(-0.9, 1.6, 0),
    new THREE.SphereGeometry(0.15, 8, 6).translate(-0.9, 1.98, 0),
    new THREE.CylinderGeometry(0.15, 0.15, 0.7, 8).rotateZ(Math.PI / 2).translate(0.45, 1.6, 0),
    new THREE.CylinderGeometry(0.15, 0.15, 0.6, 8).translate(0.8, 1.95, 0),
    new THREE.SphereGeometry(0.15, 8, 6).translate(0.8, 2.25, 0),
  ])!;
  instances(where, cactus, new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.floor(span / 6) * 2, (i) => ({
    x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 1.5, LANE_HALF_WIDTH + 9),
    y: -0.4,
    z: where.mid - span / 2 + (i >> 1) * 6 + rand(rng, 0, 5),
    sx: 1.5,
    sy: 1.5,
    sz: 1.5,
    sx2: 0,
    ry: rand(rng, 0, 6),
    color: [0x4f9a4a, 0x5aa850, 0x47883f][i % 3],
  } as never));
}

/** A snowfield: pines with snowy tiers, drifts against the barriers, ice-blue boulders, and snow falling past the camera. */
function addSnow(where: Where): Dressing {
  const rng = { rng: 5150 };
  const span = where.length;
  const pine = mergeGeometries([
    new THREE.CylinderGeometry(0.18, 0.24, 1.2, 8).translate(0, 0.6, 0),
    new THREE.ConeGeometry(1.5, 2.2, 10).translate(0, 2.1, 0),
    new THREE.ConeGeometry(1.15, 2, 10).translate(0, 3.3, 0),
    new THREE.ConeGeometry(0.8, 1.8, 10).translate(0, 4.4, 0),
  ])!;
  instances(where, pine, new THREE.MeshStandardMaterial({ color: 0x2f7d52, roughness: 0.9 }), Math.floor(span / 6) * 2, (i) => {
    const k = rand(rng, 0.8, 1.7);
    return { x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 1.8, LANE_HALF_WIDTH + 11), y: -0.4, z: where.mid - span / 2 + (i >> 1) * 6 + rand(rng, 0, 5), sx: k, sy: k, sz: k, color: [0x2f7d52, 0x3a8a5c, 0x276a45][i % 3] };
  });
  // snow settled on the upper tiers: white caps slightly smaller than each cone
  const caps = mergeGeometries([new THREE.ConeGeometry(0.95, 1.2, 10).translate(0, 2.7, 0), new THREE.ConeGeometry(0.7, 1.1, 10).translate(0, 3.8, 0), new THREE.ConeGeometry(0.5, 1, 10).translate(0, 4.8, 0)])!;
  const rng2 = { rng: 5150 };
  instances(where, caps, new THREE.MeshStandardMaterial({ color: 0xf6fbff, roughness: 0.9 }), Math.floor(span / 6) * 2, (i) => {
    const k = rand(rng2, 0.8, 1.7);
    return { x: (i % 2 ? 1 : -1) * rand(rng2, LANE_HALF_WIDTH + 1.8, LANE_HALF_WIDTH + 11), y: -0.4 + 0.08 * k, z: where.mid - span / 2 + (i >> 1) * 6 + rand(rng2, 0, 5), sx: k * 1.03, sy: k * 1.03, sz: k * 1.03 };
  });
  instances(where, new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf2f8ff, roughness: 1 }), Math.floor(span / 8) * 2, (i) => ({
    x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 0.9, LANE_HALF_WIDTH + 4),
    y: -0.5,
    z: where.mid - span / 2 + (i >> 1) * 8 + rand(rng, 0, 7),
    sx: rand(rng, 1.4, 3.4),
    sy: rand(rng, 0.5, 1.1),
    sz: rand(rng, 1.4, 3),
  }));
  instances(where, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x9ed4f2, roughness: 0.25, metalness: 0.1, flatShading: true }), Math.floor(span / 22) * 2, (i) => ({
    x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 4, LANE_HALF_WIDTH + 20),
    y: 0.5,
    z: where.mid - span / 2 + (i >> 1) * 22 + rand(rng, 0, 18),
    sx: rand(rng, 0.8, 2),
    sy: rand(rng, 1, 2.8),
    sz: rand(rng, 0.8, 2),
    ry: rand(rng, 0, 3),
  }));
  return particles(where, 420, 0xffffff, { fall: 3.2, drift: 0.8, size: 0.16 });
}

/** A volcano: black basalt columns, lava glowing at their feet, rising embers and smoke. */
function addVolcano(where: Where): Dressing {
  const rng = { rng: 666 };
  const span = where.length;
  const column = new THREE.CylinderGeometry(0.9, 1.05, 1, 6);
  instances(where, column, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), Math.floor(span / 4) * 2, (i) => {
    const h = rand(rng, 1.5, 9);
    return { x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 1.6, LANE_HALF_WIDTH + 12), y: h / 2 - 0.4, z: where.mid - span / 2 + (i >> 1) * 4 + rand(rng, 0, 3), sx: rand(rng, 0.7, 1.8), sy: h, sz: rand(rng, 0.7, 1.8), ry: rand(rng, 0, 3), color: [0x2a2224, 0x352a2c, 0x3d3033][i % 3] };
  });
  // lava pools: glowing discs lying in the ground near the road
  instances(where, new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb02a }), Math.floor(span / 14) * 2, (i) => ({
    x: (i % 2 ? 1 : -1) * rand(rng, LANE_HALF_WIDTH + 1.5, LANE_HALF_WIDTH + 9),
    y: -0.36,
    z: where.mid - span / 2 + (i >> 1) * 14 + rand(rng, 0, 10),
    sx: rand(rng, 1.4, 3.8),
    sy: 1,
    sz: rand(rng, 1.2, 3.2),
  }));
  return particles(where, 260, 0xff8a2a, { fall: -2.4, drift: 0.9, size: 0.2 });
}

/** Specks drifting around the camera: snow falling, embers rising. They wrap around the camera so there are always some in view. */
function particles(where: Where, count: number, color: number, o: { fall: number; drift: number; size: number }): Dressing {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const rng = { rng: 99 };
  const box = { x: 16, y: 22, z: 44 };
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(rng, -box.x, box.x);
    pos[i * 3 + 1] = rand(rng, 0, box.y);
    pos[i * 3 + 2] = rand(rng, -box.z, box.z);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const material = new THREE.PointsMaterial({ color, size: o.size, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  where.scene.add(points);
  where.disposables.push(geo, material);
  let last = 0;
  return {
    update(time: number, camZ: number) {
      const dt = Math.min(0.1, Math.max(0, time - last));
      last = time;
      const a = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        let y = a.getY(i) - o.fall * dt;
        if (y < 0) y += box.y;
        if (y > box.y) y -= box.y;
        a.setXYZ(i, a.getX(i) + Math.sin(time + i) * o.drift * dt, y, a.getZ(i));
      }
      a.needsUpdate = true;
      // the box follows the camera so the particles never run out
      points.position.set(0, 0, camZ - 14);
    },
  };
}

/** The roadside of each world beyond the bridge. */
export function addWorld(where: Where): Dressing | null {
  const name = where.look.name;
  if (name === "Cidade") addCity(where);
  else if (name === "Deserto") addDesert(where);
  else if (name === "Neve") return addSnow(where);
  else if (name === "Vulcão") return addVolcano(where);
  return null;
}

// ------------------------------------------------------------------ the horizon

const fogged = (color: number, rough = 0.95) => new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });

/**
 * The far horizon of each world: a skyline, mountains, mesas or a volcano. It sits far ahead of the camera and moves
 * with it, so it is always on the horizon and gives the world its character.
 */
export function addBackdrop(where: Where): Dressing {
  const group = new THREE.Group();
  where.scene.add(group);
  const rng = { rng: 31337 };
  const spread = 130;
  const place = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    group.add(mesh);
    where.disposables.push(geo, material);
    return mesh;
  };
  const name = where.look.name;

  if (name === "Cidade") {
    // a skyline in two rows: the near row dark, the far row hazy, with lit windows
    const color = windowTexture(false);
    const glow = windowTexture(true);
    where.disposables.push(color, glow);
    for (const [row, z, tint] of [[0, 0, 0xc4ccd8], [1, -30, 0x9aa8bc]] as const) {
      for (let x = -spread; x < spread; x += 9 + nextRandom(rng) * 7) {
        const h = rand(rng, 28, 80) - row * 8;
        const w = rand(rng, 7, 13);
        const geo = new THREE.BoxGeometry(w, h, w);
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 3), uv.getY(i) * (h / 6));
        place(geo, new THREE.MeshStandardMaterial({ color: tint, map: color, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0.8 - row * 0.2, roughness: 0.9 }), x, h / 2 - 4, z + rand(rng, -6, 6));
      }
    }
  } else if (name === "Neve") {
    // snow-capped mountains in two ranges
    for (const [row, z] of [[0, 0], [1, -35]] as const) {
      for (let x = -spread; x < spread; x += rand(rng, 28, 44)) {
        const h = rand(rng, 40, 80) - row * 6;
        const r = h * rand(rng, 0.5, 0.7);
        place(new THREE.ConeGeometry(r, h, 7), fogged(row ? 0x8aa4c2 : 0x7992b2), x, h / 2 - 6, z + rand(rng, -8, 8));
        place(new THREE.ConeGeometry(r * 0.42, h * 0.38, 7), fogged(0xf4f9ff, 1), x, h * 0.81 - 6, z + rand(rng, -8, 8) * 0 + 0);
      }
    }
  } else if (name === "Deserto") {
    // flat-topped mesas and long dunes
    for (const [row, z] of [[0, 0], [1, -30]] as const) {
      for (let x = -spread; x < spread; x += rand(rng, 24, 40)) {
        const h = rand(rng, 18, 38);
        const r = rand(rng, 12, 22);
        place(new THREE.CylinderGeometry(r * 0.8, r, h, 8), fogged(row ? 0xc9955e : 0xb97d48), x, h / 2 - 5, z + rand(rng, -6, 6));
        place(new THREE.CylinderGeometry(r * 0.78, r * 0.82, h * 0.18, 8), fogged(0xd8a86e), x, h * 0.88 - 5, z + rand(rng, -6, 6) * 0);
      }
    }
    for (let x = -spread; x < spread; x += 30) place(new THREE.SphereGeometry(1, 14, 8), fogged(0xe6c488, 1), x, -5, 18, 30, 6, 12);
  } else if (name === "Vulcão") {
    // the volcano itself: a tall dark cone with a glowing crater, lava running down its side, and smoke
    place(new THREE.CylinderGeometry(7, 52, 70, 12), fogged(0x2c2226), 0, 30, -5);
    place(new THREE.CylinderGeometry(9, 8, 4, 12), new THREE.MeshBasicMaterial({ color: 0xffa02a, fog: false }), 0, 66, -5);
    for (const [x, k] of [[-0.18, 1], [0.1, 0.8], [0.22, 0.6]] as const) {
      place(new THREE.BoxGeometry(2.4 * k, 56, 1), new THREE.MeshBasicMaterial({ color: 0xff7a1a, fog: false }), x * 90, 30, 18, 1, 1, 1).rotation.z = x * 0.9;
    }
    for (let x = -spread; x < spread; x += rand(rng, 36, 56)) {
      if (Math.abs(x) < 50) continue;
      const h = rand(rng, 20, 42);
      place(new THREE.ConeGeometry(h * 0.7, h, 8), fogged(0x372a2d), x, h / 2 - 5, rand(rng, -20, 10));
    }
    const smoke = new THREE.MeshBasicMaterial({ color: 0x3a2f30, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 6; i++) place(new THREE.SphereGeometry(1, 10, 8), smoke, rand(rng, -14, 14), 72 + i * 11, -5, 10 + i * 4, 6 + i * 2, 9 + i * 3);
  } else {
    // the bridge: green hills rolling away and a faint city across the water
    for (let x = -spread; x < spread; x += rand(rng, 30, 50)) {
      const h = rand(rng, 8, 22);
      place(new THREE.SphereGeometry(1, 14, 8), fogged(0x5c8a6a, 1), x, -6, rand(rng, -10, 10), rand(rng, 24, 40), h, rand(rng, 16, 26));
    }
    const windows = windowTexture(true);
    where.disposables.push(windows);
    for (let x = -60; x < 60; x += 6 + nextRandom(rng) * 5) {
      const h = rand(rng, 10, 30);
      place(new THREE.BoxGeometry(5, h, 5), new THREE.MeshStandardMaterial({ color: 0xb8c6d8, roughness: 1 }), x, h / 2 - 5, -40 - rand(rng, 0, 12));
    }
  }
  group.position.set(0, 0, Z(160));
  return {
    update(_time: number, camZ: number) {
      group.position.set(0, 0, Z(camZ + 150));
    },
  };
}
