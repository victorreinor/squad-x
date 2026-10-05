import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  BOSS_LAUNCH_AHEAD,
  BOSS_STANDOFF,
  ENEMY_KINDS,
  LANE_HALF_WIDTH,
  MECH_GAP_HALF_WIDTH,
  MECH_SHIELD_AHEAD,
  PROJECTILE_STATS,
  WEAPON_DPS,
  bossOf,
  nextRandom,
  vehicleXs,
  type Barrel,
  type Enemy,
  type EnemyKind,
  type Gate,
  type GameState,
  type Hazard,
  type Projectile,
  type Reward,
  type WeaponKind,
} from "@squadx/engine";
import { Crowd, partsToGroup, toonRamp } from "./crowd";
import { BOSS_FIGURES, BOSS_SCALE, ENEMY_LOOKS, runEnemy, runGun, runSoldier, weaponParts } from "./figures";
import { FAR_BELOW, ROW_SPACING, SQUAD_SHOWN, squadFormation, type Formation } from "./formation";
import { TextSprite } from "./labels";
import { sharpness } from "./sharpness";
import { lookFor } from "./themes";
import { addBackdrop, addBarriers, addBridge, addWorld, type Dressing } from "./scenery";
import { KEG_AXLE, bombParts, kegParts, meteorParts, mineLight, mineParts, missileParts, planeParts, spikesParts } from "./props";
import { HOVER, VEHICLE_NAMES, VEHICLE_SHOT, buildVehicle, type VehicleModel } from "./vehicles";

/** The engine runs down +z; the camera looks down -z so +x is on the right. */
const Z = (z: number) => -z;

const BULLET_CAPACITY = 320;
const PARTICLE_CAPACITY = 360;
/** seconds between two bullets of one column */
const FIRE_GAP = 0.085;
const BULLET_SPEED = 80;
/** the colour of the squad's tracers: a strong amber that reads as a shot on the pale bridge and on the dark roads alike */
const SQUAD_TRACER = 0xffb81c;

const WEAPON_NAMES: Record<WeaponKind, string> = { pistol: "PISTOLA", rifle: "FUZIL", smg: "SUBMET.", minigun: "MINIGUN" };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The colour of the pieces that fly when an enemy goes down. */
const ENEMY_DEBRIS: Record<EnemyKind, number> = { runner: 0x86b05c, sprinter: 0xd8e0b0, brute: 0xb85a3a, shield: 0x9fb4d8, bomber: 0xd23a3a, shooter: 0x6a4a9e, boss: 0xffd24a };

/** A soft round glow, white in the middle and clear at the edge: tinted and stretched it becomes a flash, a fireball or a puff of smoke. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.75)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One short-lived sprite: a muzzle flash, a spark, a fireball or a puff of smoke. It grows and fades out. */
interface Glow {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  from: number;
  to: number;
  rise: number;
}

/** A ring of force that spreads across the ground from a blast. */
interface Shock {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  size: number;
}

/** Ticks before a bomb or a meteor lands during which it is drawn falling. */
const BOMB_FALL_TICKS = 26;

/** How each kind of mark on the road looks: the colour it reddens (or blues) to, and how far up the road it reaches (units). */
const MARK_LOOK: Record<Hazard["kind"] | "missile", { color: number; length: number }> = {
  slam: { color: 0xff2a2a, length: 30 },
  bomb: { color: 0xff2a2a, length: 16 },
  laser: { color: 0xff2a7a, length: 30 },
  // a deep blue: a pale one disappears on the snow
  ice: { color: 0x1a6dff, length: 30 },
  meteor: { color: 0xff6a1a, length: 16 },
  missile: { color: 0xff2a2a, length: 10 },
};

/** How far a missile flies from the boss to the squad (units), for the warning under it to fill in on the way. */
const MISSILE_FLIGHT = BOSS_STANDOFF - BOSS_LAUNCH_AHEAD;

/** Whether something that happens `perSecond` times a second happens in a frame of `dt` seconds: smoke and sparks keep the same pace at any frame rate. */
const often = (perSecond: number, dt: number) => Math.random() < perSecond * dt;

/** One mark on the road to draw: where, how wide, how close it is to landing (0 to 1) and what it looks like. */
interface Mark {
  kind: keyof typeof MARK_LOOK;
  x: number;
  halfWidth: number;
  urgency: number;
  /** ticks left before it lands, for a bomb or a meteor falling onto it */
  ticks?: number;
}

/** How much further up the road the camera looks in a boss fight (units). */
const BOSS_LOOK_AHEAD = 4;

/** Seconds a fallen enemy lies on the road before it is gone. */
const GHOST_LIFE = 0.75;

/** What the player just did to an enemy: it flashes white and is shoved back a little. */
interface EnemyFx {
  hp: number;
  flash: number;
  push: number;
}

interface Ghost {
  kind: EnemyKind;
  x: number;
  z: number;
  age: number;
}

interface GateView {
  group: THREE.Group;
  floor: { texture: THREE.CanvasTexture; ctx: CanvasRenderingContext2D };
  banner: { texture: THREE.CanvasTexture; ctx: CanvasRenderingContext2D };
  /** the parts that glow in the gate's colour: the lights on the posts and the strip under the beam */
  glow: THREE.MeshBasicMaterial[];
  key: string;
}

interface BarrelView {
  group: THREE.Group;
  hp: TextSprite;
  reward: THREE.Object3D;
  label: TextSprite;
}

interface VehicleView extends VehicleModel {
  kind: string;
  x: number;
}

interface Bullet {
  /** thickness multiplier and colour: vehicles shoot fatter, warmer tracers than soldiers */
  thick: number;
  color: number;
  x: number;
  z: number;
  endZ: number;
  /** whether it ends on a target, which gets a spark */
  hit: boolean;
}

/** Everything the player sees, drawn from the engine's `GameState`. Owns the WebGL renderer. */
export class Scene3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.5, 420);
  private readonly ramp = toonRamp();
  private readonly squad: Crowd;
  /** the same squad once it is big and drawn small: a lighter soldier */
  private readonly squadFar: Crowd;
  /** the size and the depth the squad is drawn with, easing towards those of its formation */
  private squadScale = 1;
  private squadDepth = 0;
  /** 0 to 1: how far the camera has turned to frame a boss fight, looking further up the road */
  private bossFocus = 0;
  private readonly enemyCrowds = {} as Record<EnemyKind, Crowd>;
  private readonly enemyFx = new Map<number, EnemyFx>();
  private readonly ghosts: Ghost[] = [];
  private readonly dressing: Dressing[] = [];
  private readonly glowTex = glowTexture();
  private readonly glows: Glow[] = [];
  private readonly idleGlows: { additive: THREE.Sprite[]; smoke: THREE.Sprite[] } = { additive: [], smoke: [] };
  private readonly shocks: Shock[] = [];
  /** one marked strip per mark on the road: coloured fill, bright edge and, for a bomb or a meteor, the thing on its way down */
  private readonly hazardViews: { fill: THREE.Mesh; edge: THREE.Mesh; bomb: THREE.Group; meteor: THREE.Group }[] = [];
  /** missiles and kegs on their way, by id, and the idle models kept for the next ones */
  private readonly projectileViews = new Map<number, THREE.Group>();
  private readonly idleProjectiles: Record<Projectile["kind"], THREE.Group[]> = { missile: [], keg: [] };
  /** the Mecha's shield: two panels of light either side of the opening, and a strip on the road showing where the shots get through */
  private readonly shield: { left: THREE.Mesh; right: THREE.Mesh; lane: THREE.Mesh; x: number };
  /** the strips of road on fire, by id */
  private readonly fireViews = new Map<number, THREE.Mesh>();
  private readonly fireTex: THREE.CanvasTexture;
  /** a red glow behind an enraged boss */
  private readonly aura: THREE.Sprite;
  /** the Mecha's laser beam, one box stretched from its visor to the road, and how long it still shows (s) */
  private readonly laser: THREE.Mesh;
  private laserLife = 0;
  /** the ring of force every blast spreads on the ground: one shape, scaled */
  private readonly ringGeo = new THREE.RingGeometry(0.85, 1, 40);
  /** when the boss last threw something, for its arms */
  private throwAt = -10;
  private readonly hazardStrip: THREE.BufferGeometry;
  private readonly trapViews = new Map<number, { group: THREE.Group; light: THREE.Group | null }>();
  private readonly plane: THREE.Group;
  private readonly planeShadow: THREE.Mesh;
  private readonly gates = new Map<number, GateView>();
  private readonly barrels = new Map<number, BarrelView>();
  private readonly count = new TextSprite(2.6, 1.3);
  private readonly bulletMesh: THREE.InstancedMesh;
  private readonly bullets: Bullet[] = [];
  private readonly fireClock: number[] = [];
  private readonly vehicleViews: VehicleView[] = [];
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly sparks: { p: THREE.Vector3; v: THREE.Vector3; life: number; size: number; color: number }[] = [];
  private readonly slotX: number[] = [];
  private readonly slotZ: number[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private shake = 0;
  private lastTick = -1;
  private lastWeapon: WeaponKind | null = null;
  private readonly tmp = new THREE.Matrix4();
  private readonly colorTmp = new THREE.Color();

  constructor(private readonly host: HTMLElement, state: GameState) {
    const look = lookFor(state.theme);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(sharpness.start());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";

    // a soft studio environment so the metal and concrete pick up a little reflection; toon parts ignore it
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.background = skyTexture(look.skyTop, look.sky);
    this.scene.fog = new THREE.Fog(look.sky, 70, 200);
    this.scene.add(new THREE.HemisphereLight(0xffffff, look.ground, 1.5));
    const sun = new THREE.DirectionalLight(look.sun, 2.2);
    sun.position.set(-6, 14, 8);
    this.scene.add(sun);

    this.buildWorld(state, look);
    this.decorate(state, look);

    this.squad = new Crowd(SQUAD_SHOWN, runSoldier("pistol"), this.ramp);
    this.squadFar = new Crowd(SQUAD_SHOWN, runSoldier("pistol", true), this.ramp);
    for (const kind of ENEMY_KINDS) {
      this.enemyCrowds[kind] = kind === "boss" ? new Crowd(3, BOSS_FIGURES[state.bossFight?.kind ?? "general"].figure(), this.ramp) : new Crowd(ENEMY_LOOKS[kind].capacity, runEnemy(kind), this.ramp);
    }
    for (const crowd of [this.squad, this.squadFar, ...Object.values(this.enemyCrowds)]) {
      this.scene.add(crowd.group);
      this.disposables.push(crowd);
    }

    // the strips of road the boss and the bombers mark: they fill in red as the blow gets closer
    this.hazardStrip = new THREE.PlaneGeometry(1, 1);
    this.hazardStrip.rotateX(-Math.PI / 2);
    this.disposables.push(this.hazardStrip);

    // the Mecha's shield: see-through panels with a honeycomb of light, and a pale strip on the road under the opening
    const panelGeo = new THREE.PlaneGeometry(1, 1);
    const panelMat = new THREE.MeshBasicMaterial({ map: honeycombTexture(), color: 0x6ae8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const laneMat = new THREE.MeshBasicMaterial({ color: 0x8dffc8, transparent: true, opacity: 0.16, depthWrite: false });
    this.shield = { left: new THREE.Mesh(panelGeo, panelMat), right: new THREE.Mesh(panelGeo, panelMat), lane: new THREE.Mesh(this.hazardStrip, laneMat), x: 0 };
    for (const m of [this.shield.left, this.shield.right, this.shield.lane]) {
      m.visible = false;
      m.renderOrder = 5;
      this.scene.add(m);
    }
    this.disposables.push(panelGeo, panelMat, panelMat.map!, laneMat);

    this.fireTex = flameTexture();
    this.disposables.push(this.fireTex);
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.aura.visible = false;
    this.scene.add(this.aura);
    this.laser = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 1), new THREE.MeshBasicMaterial({ color: 0xff3a8a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.laser.visible = false;
    this.scene.add(this.laser);
    this.disposables.push(this.aura.material, this.laser.geometry, this.laser.material as THREE.Material, this.ringGeo);

    // the bomber that flies across the road, and its shadow on the tarmac
    this.plane = partsToGroup(planeParts(), this.ramp);
    this.plane.visible = false;
    this.plane.scale.setScalar(1.7);
    this.plane.rotation.y = -Math.PI / 2;
    this.scene.add(this.plane);
    const shadowGeo = new THREE.CircleGeometry(1, 20);
    shadowGeo.rotateX(-Math.PI / 2);
    this.planeShadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.planeShadow.visible = false;
    this.planeShadow.scale.set(4.5, 1, 1.4);
    this.scene.add(this.planeShadow);
    this.disposables.push(shadowGeo, this.planeShadow.material as THREE.Material);

    for (const t of state.traps) {
      const group = partsToGroup(t.kind === "spikes" ? spikesParts() : mineParts(), this.ramp);
      const light = t.kind === "mine" ? partsToGroup(mineLight(), this.ramp, false) : null;
      if (light) group.add(light);
      group.position.set(t.x, 0, Z(t.z));
      this.scene.add(group);
      this.trapViews.set(t.id, { group, light });
    }

    this.count.sprite.renderOrder = 10;
    this.scene.add(this.count.sprite);
    this.disposables.push(this.count);

    const bulletGeo = new THREE.BoxGeometry(0.07, 0.07, 1);
    // drawn over the road rather than added to it: an added glow washes out to white on the pale bridge
    this.bulletMesh = new THREE.InstancedMesh(bulletGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false }), BULLET_CAPACITY);
    this.bulletMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BULLET_CAPACITY * 3), 3);
    this.bulletMesh.frustumCulled = false;
    this.bulletMesh.count = 0;
    this.scene.add(this.bulletMesh);
    this.disposables.push(bulletGeo, this.bulletMesh.material as THREE.Material);

    const sparkGeo = new THREE.BoxGeometry(1, 1, 1);
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, new THREE.MeshBasicMaterial(), PARTICLE_CAPACITY);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.count = 0;
    this.sparkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_CAPACITY * 3), 3);
    this.scene.add(this.sparkMesh);
    this.disposables.push(sparkGeo, this.sparkMesh.material as THREE.Material);

    for (const g of state.gates) this.gates.set(g.id, this.buildGate(g));
    for (const b of state.barrels) this.barrels.set(b.id, this.buildBarrel(b));

    this.resize();
    window.addEventListener("resize", this.onResize);
  }

  private readonly onResize = () => this.resize();

  /** Fit the canvas to its container and pull the camera back until the whole road is in view. */
  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** The road, the scenery and the finish line. */
  private buildWorld(state: GameState, look: ReturnType<typeof lookFor>) {
    const length = state.length + 170;
    const mid = Z(state.length / 2 + 40);
    const roadW = LANE_HALF_WIDTH * 2;

    const texture = roadTexture(look.road);
    texture.repeat.set(1, length / 8);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(roadW, length), new THREE.MeshToonMaterial({ map: texture, gradientMap: this.ramp }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, mid);
    this.scene.add(road);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(roadW + 1.1, 0.6, length), new THREE.MeshToonMaterial({ color: 0x70757d, gradientMap: this.ramp }));
    slab.position.set(0, -0.32, mid);
    this.scene.add(slab);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, length + 200), look.lava ? new THREE.MeshBasicMaterial({ color: look.ground }) : new THREE.MeshToonMaterial({ color: look.ground, gradientMap: this.ramp }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, look.sunken ? -9 : -0.4, mid);
    this.scene.add(ground);

    const where = { scene: this.scene, mid, length, look, disposables: this.disposables };
    addBarriers(where);
    this.dressing.push(addBackdrop(where));
    if (look.pylons) this.dressing.push(addBridge(where));
    else {
      const world = addWorld(where);
      if (world) this.dressing.push(world);
    }

    // the finish line
    const finish = new THREE.Mesh(new THREE.PlaneGeometry(roadW, 1.4), new THREE.MeshBasicMaterial({ map: checkerTexture() }));
    finish.rotation.x = -Math.PI / 2;
    finish.position.set(0, 0.03, Z(state.length + 1));
    this.scene.add(finish);
  }

  /** Lamp posts, plants and clouds: what makes a road feel like a place. */
  private decorate(state: GameState, look: ReturnType<typeof lookFor>) {
    const rng = { rng: 777 };
    const matrix = new THREE.Matrix4();
    const put = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
      mesh.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, y, Z(z)), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
    const span = state.length + 130;

    // lamp posts on both sides, every few seconds of running
    const spots: number[] = [];
    for (let z = 12; z < span; z += 20) spots.push(z);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 8), new THREE.MeshToonMaterial({ color: 0x4a5160, gradientMap: this.ramp }), spots.length * 2);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: look.lava ? 0xff7a3a : 0xfff0b8 }), spots.length * 2);
    spots.forEach((z, i) => {
      for (const [k, side] of [-1, 1].entries()) {
        put(poles, i * 2 + k, side * (LANE_HALF_WIDTH + 0.7), 1.6, z);
        put(bulbs, i * 2 + k, side * (LANE_HALF_WIDTH + 0.7), 3.25, z);
      }
    });
    this.scene.add(poles, bulbs);
    this.disposables.push(poles.geometry, bulbs.geometry, poles, bulbs, poles.material as THREE.Material, bulbs.material as THREE.Material);

    // clouds (or ash over the volcano) drifting high above the far end of the road
    for (let i = 0; i < 9; i++) {
      const cloud = new TextSprite(14 + nextRandom(rng) * 10, 5 + nextRandom(rng) * 3, 8);
      cloud.set("☁", look.lava ? "#3a2220" : "#ffffff", look.lava ? "#3a2220" : "#ffffff");
      cloud.sprite.position.set((nextRandom(rng) - 0.5) * 90, 22 + nextRandom(rng) * 14, Z(60 + nextRandom(rng) * (state.length + 60)));
      cloud.sprite.material.opacity = look.lava ? 0.55 : 0.8;
      cloud.sprite.material.fog = false;
      this.scene.add(cloud.sprite);
      this.disposables.push(cloud);
    }
  }

  /** A gate: a steel gantry over the road with a hanging number sign, and arrows painted on the road below it. */
  private buildGate(g: Gate): GateView {
    const canvas = (w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      return { ctx: c.getContext("2d")!, texture };
    };
    const floor = canvas(256, 192);
    const banner = canvas(320, 120);
    const group = new THREE.Group();
    const width = g.width - 0.1;

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, 3.4), new THREE.MeshBasicMaterial({ map: floor.texture, transparent: true, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.04;
    group.add(plane);

    const steel = new THREE.MeshStandardMaterial({ color: 0x6b7482, roughness: 0.45, metalness: 0.6 });
    const glow = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: 0x5fb4ff }));
    const postGeo = new THREE.CylinderGeometry(0.09, 0.12, 2.4, 10);
    const capGeo = new THREE.SphereGeometry(0.15, 10, 8);
    const baseGeo = new THREE.BoxGeometry(0.4, 0.12, 0.4);
    for (const [i, side] of [-1, 1].entries()) {
      const x = side * (g.width / 2 - 0.12);
      const post = new THREE.Mesh(postGeo, steel);
      post.position.set(x, 1.2, 0);
      const cap = new THREE.Mesh(capGeo, glow[i]);
      cap.position.set(x, 2.5, 0);
      const base = new THREE.Mesh(baseGeo, steel);
      base.position.set(x, 0.06, 0);
      group.add(post, cap, base);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(g.width - 0.1, 0.16, 0.22), steel);
    beam.position.y = 2.38;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(g.width - 0.4, 0.06, 0.05), glow[2]);
    strip.position.set(0, 2.28, -0.12);
    group.add(beam, strip);

    // the number sign hangs from the beam, leaning toward the camera
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.9, width * 0.9 * (120 / 320)), new THREE.MeshBasicMaterial({ map: banner.texture, transparent: true }));
    sign.position.set(0, 1.62, 0.05);
    sign.rotation.x = -0.22;
    group.add(sign);
    for (const side of [-1, 1]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 5), steel);
      chain.position.set(side * width * 0.4, 2.12, 0.04);
      group.add(chain);
    }

    group.position.set(g.x, 0, Z(g.z));
    this.scene.add(group);
    this.disposables.push(floor.texture, banner.texture, plane.geometry, plane.material as THREE.Material, postGeo, capGeo, baseGeo, beam.geometry, strip.geometry, steel, sign.geometry, sign.material as THREE.Material, ...glow);
    return { group, floor, banner, glow, key: "" };
  }

  /** Redraw a gate's paint and sign when its number changes: blue with forward arrows when it helps, red with arrows toward you when it hurts. */
  private drawGate(view: GateView, g: Gate) {
    const key = `${g.op}${g.value}${g.locked ? "L" : ""}`;
    if (key === view.key) return;
    view.key = key;
    const good = g.op === "mul" || (g.op === "add" && g.value >= 0);
    const main = good ? "#3f8cff" : "#e0413a";
    const light = good ? "#9fd0ff" : "#ff9a8f";
    const dark = good ? "#1a4fb8" : "#a02420";
    for (const m of view.glow) m.color.set(light);

    // road paint: a soft coloured pad with chevrons pointing the way the gate pushes
    const f = view.floor.ctx;
    f.clearRect(0, 0, 256, 192);
    const pad = f.createLinearGradient(0, 0, 0, 192);
    pad.addColorStop(0, `${main}55`);
    pad.addColorStop(0.5, `${main}cc`);
    pad.addColorStop(1, `${main}55`);
    f.fillStyle = pad;
    f.beginPath();
    f.roundRect(6, 6, 244, 180, 22);
    f.fill();
    f.strokeStyle = light;
    f.lineWidth = 5;
    f.stroke();
    f.strokeStyle = "rgba(255,255,255,0.75)";
    f.lineWidth = 12;
    f.lineCap = "round";
    f.lineJoin = "round";
    for (let i = 0; i < 3; i++) {
      const y = 50 + i * 46;
      f.beginPath();
      if (good) {
        f.moveTo(84, y + 18);
        f.lineTo(128, y - 12);
        f.lineTo(172, y + 18);
      } else {
        f.moveTo(84, y - 12);
        f.lineTo(128, y + 18);
        f.lineTo(172, y - 12);
      }
      f.stroke();
    }
    view.floor.texture.needsUpdate = true;

    // the sign: rounded, with a coloured face, a light border and a big outlined number
    const b = view.banner.ctx;
    b.clearRect(0, 0, 320, 120);
    const face = b.createLinearGradient(0, 0, 0, 120);
    face.addColorStop(0, main);
    face.addColorStop(1, dark);
    b.fillStyle = "#1b1b2a";
    b.beginPath();
    b.roundRect(2, 2, 316, 116, 22);
    b.fill();
    b.fillStyle = face;
    b.beginPath();
    b.roundRect(10, 10, 300, 100, 16);
    b.fill();
    b.strokeStyle = light;
    b.lineWidth = 4;
    b.stroke();
    const text = g.op === "mul" ? `×${g.value}` : g.op === "div" ? `÷${g.value}` : g.value >= 0 ? `+${g.value}` : `${g.value}`;
    b.font = '900 82px "Arial Black", Impact, sans-serif';
    b.textAlign = "center";
    b.textBaseline = "middle";
    b.lineJoin = "round";
    b.lineWidth = 14;
    b.strokeStyle = "#1b1b2a";
    b.strokeText(text, 160, 64);
    b.fillStyle = "#fff";
    b.fillText(text, 160, 64);
    // a padlock in the corner of a sign that cannot be shot up: no use wasting bullets on it
    if (g.locked) {
      b.font = "40px sans-serif";
      b.textAlign = "left";
      b.fillText("🔒", 22, 28);
    }
    view.banner.texture.needsUpdate = true;
  }

  private buildBarrel(b: Barrel): BarrelView {
    const group = new THREE.Group();
    const wood = new THREE.MeshToonMaterial({ color: 0xb87a3d, gradientMap: this.ramp });
    const band = new THREE.MeshToonMaterial({ color: 0x4a4f5a, gradientMap: this.ramp });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.5, 18), wood);
    body.position.y = 0.75;
    group.add(body);
    for (const y of [0.3, 1.2]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.14, 18), band);
      ring.position.y = y;
      group.add(ring);
    }
    const hp = new TextSprite(1.9, 0.95);
    hp.sprite.position.set(0, 1.0, 0.95);
    hp.sprite.renderOrder = 10;
    group.add(hp.sprite);
    const reward = rewardModel(b.reward, this.ramp);
    reward.position.y = 2.9;
    group.add(reward);
    const label = new TextSprite(2.4, 0.8);
    label.sprite.position.set(0, 3.9, 0);
    label.sprite.renderOrder = 10;
    label.set(rewardText(b.reward), "#ffe066");
    group.add(label.sprite);
    group.position.set(b.x, 0, Z(b.z));
    this.scene.add(group);
    this.disposables.push(hp, label);
    return { group, hp, reward, label };
  }

  /** Draw the state `alpha` of the way between `prev` and `cur`. `dt` is real seconds since the last frame. */
  render(prev: GameState, cur: GameState, alpha: number, dt: number, time: number) {
    if (cur.tick !== this.lastTick) {
      if (this.lastTick >= 0) this.tickEffects(prev, cur);
      this.lastTick = cur.tick;
    }

    const distance = lerp(prev.distance, cur.distance, alpha);
    const squadX = lerp(prev.squad.x, cur.squad.x, alpha);
    const walking = cur.status === "playing" && cur.distance < cur.length;

    // a slow device gets a softer picture rather than a slower run
    const ratio = sharpness.frame(dt);
    if (ratio) this.renderer.setPixelRatio(ratio);

    const formation = squadFormation(cur.squad.count);
    this.squadScale = lerp(this.squadScale, formation.scale, 0.2);
    this.squadDepth = lerp(this.squadDepth, formation.depth, 0.2);
    // in a boss fight the camera looks further ahead, so the boss stands clear of the panels at the top of the screen
    const boss = cur.bossFight ? bossOf(cur) : undefined;
    this.bossFocus = lerp(this.bossFocus, cur.bossFight?.awake ? 1 : 0, Math.min(1, dt * 1.5));
    this.placeCamera(squadX, distance, dt);
    this.drawSquad(cur, formation, squadX, distance, time, dt, walking);
    this.drawEnemies(prev, cur, alpha, time, dt);
    this.drawHazards(cur, distance, dt);
    this.drawBossWork(prev, cur, boss, alpha, distance, time, dt);
    this.drawPlane(prev, cur, alpha, distance);
    this.drawTraps(cur, distance, time);
    this.drawGatesAndBarrels(cur, distance, time);
    this.drawShots(cur, distance, dt);
    this.drawSparks(dt);
    this.drawGlows(dt);
    for (const d of this.dressing) d.update(time, -this.camera.position.z);

    this.renderer.render(this.scene, this.camera);
  }

  private placeCamera(squadX: number, distance: number, dt: number) {
    // far enough back that the whole road (and a margin) fits the width of the screen
    const aspect = this.camera.aspect;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(17, 10.8 / (2 * tanHalf * Math.min(aspect, 1.1)));
    const elevation = THREE.MathUtils.degToRad(41);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const jitter = this.shake * this.shake * 0.5;
    // a deep squad stretches behind its front row: back the camera up so the last rows are not cut off
    const depth = Math.max(0, this.squadDepth - 3 * ROW_SPACING) * 0.55;
    this.camera.position.set(squadX * 0.3 + (Math.random() - 0.5) * jitter, Math.sin(elevation) * dist + (Math.random() - 0.5) * jitter + depth * 0.3, Z(distance - depth) + Math.cos(elevation) * dist);
    this.camera.lookAt(squadX * 0.15, 0.4, Z(distance + 7 + BOSS_LOOK_AHEAD * this.bossFocus - depth));
  }

  private drawSquad(cur: GameState, formation: Formation, squadX: number, distance: number, time: number, dt: number, walking: boolean) {
    const { count, weapon } = cur.squad;
    if (weapon !== this.lastWeapon) {
      this.squad.setGun(runGun(weapon));
      this.squadFar.setGun(runGun(weapon, true));
      this.lastWeapon = weapon;
    }
    const firing = cur.status === "playing" && cur.volleys.some((v) => !v.vehicle && v.hit);
    const { shown, cols, dx, dz } = formation;
    const left = squadX - ((cols - 1) * dx) / 2;
    const crowd = formation.scale < FAR_BELOW ? this.squadFar : this.squad;
    // the Yeti's ice leaves the squad pale and glittering until it thaws
    const frost = cur.chill ? 0.3 + 0.1 * Math.sin(time * 9) : 0;
    if (cur.chill && often(15, dt)) this.burst(squadX + (Math.random() - 0.5) * 3, 1.2, distance - Math.random() * 2, 0xd8f6ff, 1, 0.15);
    this.squad.begin();
    this.squadFar.begin();
    for (let k = 0; k < shown; k++) {
      const col = k % cols;
      const row = Math.floor(k / cols);
      // staggered rows read as a crowd instead of a grid
      const tx = left + col * dx + (row % 2 ? dx * 0.36 : 0);
      const tz = distance - row * dz;
      this.slotX[k] = this.slotX[k] === undefined ? tx : lerp(this.slotX[k], tx, 0.28);
      this.slotZ[k] = this.slotZ[k] === undefined ? tz : lerp(this.slotZ[k], tz, 0.28);
      crowd.add(this.slotX[k], Z(this.slotZ[k]), this.squadScale, 0, k * 1.7, walking ? time : 0, frost, 0, 0.06, firing ? 0.035 * Math.abs(Math.sin(time * 38 + k)) : 0);
    }
    this.squad.end();
    this.squadFar.end();
    // a little dust kicked up behind the running squad
    if (walking && Math.random() < 0.35) this.burst(squadX + (Math.random() - 0.5) * 2.4, 0.08, distance - 1.2 - Math.random() * 2, 0xd9d2c0, 1, 0.18);
    this.drawVehicles(cur, squadX, distance, time);

    this.count.set(String(count), count === 0 ? "#ff6b6b" : "#ffffff");
    this.count.sprite.position.set(squadX, 2.9, Z(distance - 0.2));
    this.count.sprite.visible = count > 0;
  }

  /** The vehicles running beside the squad, each created the first time it shows up. */
  private drawVehicles(cur: GameState, squadX: number, distance: number, time: number) {
    const { vehicles, count } = cur.squad;
    const xs = vehicleXs(squadX, count, vehicles.length);
    vehicles.forEach((kind, i) => {
      let view = this.vehicleViews[i];
      if (!view || view.kind !== kind) {
        view?.group.removeFromParent();
        const model = buildVehicle(kind, this.ramp);
        this.scene.add(model.group);
        view = this.vehicleViews[i] = { ...model, kind, x: xs[i] };
      }
      view.x = lerp(view.x, xs[i], 0.25);
      const bob = kind === "heli" ? Math.sin(time * 3 + i) * 0.12 : Math.abs(Math.sin(time * 9 + i)) * 0.04;
      view.group.position.set(view.x, HOVER[kind] + bob, Z(distance - 0.4));
      if (view.rotor) view.rotor.rotation.y = time * 28;
    });
  }

  private drawEnemies(prev: GameState, cur: GameState, alpha: number, time: number, dt: number) {
    const before = new Map(prev.enemies.map((e) => [e.id, e]));
    for (const crowd of Object.values(this.enemyCrowds)) crowd.begin();
    const seen = new Set<number>();
    for (const e of cur.enemies) {
      seen.add(e.id);
      const p = before.get(e.id) ?? e;
      // a hit whitens the enemy and shoves it back a little; both fade fast
      const fx = this.enemyFx.get(e.id) ?? { hp: e.hp, flash: 0, push: 0 };
      if (e.hp < fx.hp - 0.01) {
        fx.flash = 1;
        fx.push = Math.min(0.45, fx.push + 0.12);
      }
      fx.hp = e.hp;
      fx.flash = Math.max(0, fx.flash - dt * 7);
      fx.push = Math.max(0, fx.push - dt * 1.4);
      this.enemyFx.set(e.id, fx);

      const x = lerp(p.x, e.x, alpha);
      const z = lerp(p.z, e.z, alpha) + fx.push;
      const phase = e.id * 2.3;
      if (e.kind === "boss") {
        // the boss stands and stamps instead of running
        // before a smash the boss lifts both arms over its head, more the closer the strike is
        const mark = cur.hazards.find((h) => h.from === "boss");
        const raise = Math.max(mark ? Math.min(1, 1 - mark.ticks / mark.warn + 0.15) : 0, 1 - (time - this.throwAt) / 0.5);
        this.enemyCrowds.boss.add(x, Z(z), BOSS_SCALE, Math.PI, phase, time * 0.35, fx.flash, 0, 0, 0, raise);
      } else {
        const v = ENEMY_LOOKS[e.kind];
        // a shooter that has stopped to fire stands still
        const moving = e.kind !== "shooter" || e.z - cur.distance > 17;
        this.enemyCrowds[e.kind].add(x, Z(z), v.scale, Math.PI, phase, moving ? time : 0, fx.flash, 0, v.lean);
      }
    }
    for (const id of this.enemyFx.keys()) if (!seen.has(id)) this.enemyFx.delete(id);

    // the fallen tip over and fade out where they were hit
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.age += dt;
      if (g.age >= GHOST_LIFE) {
        this.ghosts.splice(i, 1);
        continue;
      }
      const scale = g.kind === "boss" ? BOSS_SCALE : ENEMY_LOOKS[g.kind].scale;
      this.enemyCrowds[g.kind].add(g.x, Z(g.z), scale * (1 - Math.max(0, g.age - 0.5) * 2), Math.PI, 0, 0, 0, Math.min(1, g.age / 0.3), 0);
    }
    for (const crowd of Object.values(this.enemyCrowds)) crowd.end();
  }

  /**
   * The strips of road about to be hit: each fills in with its colour as the blow gets closer (red for a slam, a bomb or
   * a missile, pink for a laser, blue for ice, orange for a meteor), and a bomb or a meteor falls onto it at the end.
   */
  private drawHazards(cur: GameState, distance: number, dt: number) {
    const marks: Mark[] = cur.hazards.map((h) => ({ kind: h.kind, x: h.x, halfWidth: h.halfWidth, urgency: 1 - h.ticks / h.warn, ticks: h.ticks }));
    for (const p of cur.projectiles) {
      if (p.kind === "missile") marks.push({ kind: "missile", x: p.targetX, halfWidth: PROJECTILE_STATS.missile.blast, urgency: Math.max(0, 1 - (p.z - distance) / MISSILE_FLIGHT) });
    }
    while (this.hazardViews.length < marks.length) {
      const mat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
      const fill = new THREE.Mesh(this.hazardStrip, mat(0xff2a2a));
      const edge = new THREE.Mesh(this.hazardStrip, mat(0xffd0c0));
      const bomb = partsToGroup(bombParts(), this.ramp);
      bomb.scale.setScalar(1.3);
      bomb.rotation.z = Math.PI;
      const meteor = partsToGroup(meteorParts(), this.ramp);
      meteor.scale.setScalar(1.6);
      for (const m of [edge, fill, bomb, meteor]) {
        m.visible = false;
        m.renderOrder = 4;
        this.scene.add(m);
      }
      this.disposables.push(fill.material as THREE.Material, edge.material as THREE.Material);
      this.hazardViews.push({ fill, edge, bomb, meteor });
    }
    this.hazardViews.forEach((view, i) => {
      const h = marks[i];
      view.fill.visible = view.edge.visible = !!h;
      const falling = !!h && h.ticks !== undefined && h.ticks <= BOMB_FALL_TICKS;
      view.bomb.visible = falling && h.kind === "bomb";
      view.meteor.visible = falling && h.kind === "meteor";
      if (!h) return;
      const look = MARK_LOOK[h.kind];
      const width = (h.halfWidth + 0.45) * 2;
      const zMid = distance + look.length / 2 - 2;
      for (const m of [view.fill, view.edge]) {
        m.position.set(h.x, 0.06, Z(zMid));
        m.scale.set(width, 1, look.length);
      }
      view.edge.scale.x = width + 0.35;
      const fill = view.fill.material as THREE.MeshBasicMaterial;
      fill.color.setHex(look.color);
      fill.opacity = 0.15 + 0.5 * h.urgency * (0.75 + 0.25 * Math.sin(h.urgency * 40));
      (view.edge.material as THREE.MeshBasicMaterial).opacity = 0.25;
      const fall = Math.min(1, (h.ticks ?? 0) / BOMB_FALL_TICKS);
      if (h.kind === "bomb") {
        view.bomb.position.set(h.x, 0.3 + fall * fall * 16, Z(distance + 5));
        view.bomb.rotation.y += 0.2;
      } else if (h.kind === "meteor") {
        // meteors come down at a slant, out of the sky behind the Demon
        view.meteor.position.set(h.x + fall * 3, fall * fall * 22, Z(distance + 5 + fall * 14));
        view.meteor.rotation.x += 0.08;
        // a trail of fire and smoke behind it
        const at = view.meteor.position;
        if (often(30, dt)) this.flash(at.x + 0.3, at.y + 1.2, -at.z + 0.6, 0xffa040, 1.4, 2.4, 0.18);
        if (often(12, dt)) this.puff(at.x + 0.4, at.y + 1.4, -at.z + 1, 0x4a3a34, 1, 2.2, 0.6, 0.6);
      }
    });
  }

  /**
   * What a boss has set going besides its marks: the missiles and kegs on their way, the Mecha's shield, the fire on
   * the road, the glow of an enraged boss and the laser beams fading out.
   */
  private drawBossWork(prev: GameState, cur: GameState, boss: Enemy | undefined, alpha: number, distance: number, time: number, dt: number) {
    // missiles and kegs, each eased between the last two ticks
    const before = new Map(prev.projectiles.map((p) => [p.id, p]));
    const live = new Set<number>();
    for (const p of cur.projectiles) {
      live.add(p.id);
      let view = this.projectileViews.get(p.id);
      if (!view) {
        view = this.idleProjectiles[p.kind].pop() ?? this.buildProjectile(p.kind);
        view.rotation.set(0, 0, 0);
        this.scene.add(view);
        this.projectileViews.set(p.id, view);
      }
      const was = before.get(p.id) ?? p;
      const x = lerp(was.x, p.x, alpha);
      const z = lerp(was.z, p.z, alpha);
      if (p.kind === "missile") {
        // it dives from the boss's shoulder to the squad, nose first
        const height = 0.9 + 2.6 * Math.min(1, Math.max(0, (z - distance) / MISSILE_FLIGHT));
        view.position.set(x, height, Z(z));
        // the model points down -z; turn it toward where it is going, nose a little down
        view.rotation.order = "YXZ";
        view.rotation.set(-0.2, Math.atan2(-(p.x - was.x), -(was.z - p.z)), 0);
        view.scale.setScalar(1.25);
        if (often(18, dt)) this.puff(x, height, z + 0.9, 0xb8b0a8, 0.4, 1.2, 0.5, 0.4);
      } else {
        // a keg rolls toward the squad, turning over its axle, with its hit points over it: it can be shot to pieces
        const size = 1.1;
        view.scale.setScalar(size);
        view.position.set(x, KEG_AXLE * size, Z(z));
        (view.userData.body as THREE.Group).rotation.x = -z / (KEG_AXLE * size);
        (view.userData.hp as TextSprite).set(String(Math.ceil(p.hp)), "#ffffff", "#7a1e1a");
      }
    }
    for (const [id, view] of this.projectileViews) {
      if (live.has(id)) continue;
      view.removeFromParent();
      this.idleProjectiles[view.userData.kind as Projectile["kind"]].push(view);
      this.projectileViews.delete(id);
    }

    // the Mecha's shield stands between it and the squad, with the opening sliding to its new place
    const fight = cur.bossFight;
    const shielded = !!fight && fight.gap !== null && !!boss;
    const { left, right, lane } = this.shield;
    left.visible = right.visible = lane.visible = shielded;
    if (shielded) {
      this.shield.x = lerp(this.shield.x, fight.gap!, Math.min(1, dt * 6));
      const gapL = this.shield.x - MECH_GAP_HALF_WIDTH;
      const gapR = this.shield.x + MECH_GAP_HALF_WIDTH;
      const edge = LANE_HALF_WIDTH + 0.6;
      const z = Z(boss.z - MECH_SHIELD_AHEAD);
      const height = 5.5;
      const place = (m: THREE.Mesh, from: number, to: number) => {
        m.visible = to - from > 0.05;
        m.position.set((from + to) / 2, height / 2, z);
        m.scale.set(Math.max(0.01, to - from), height, 1);
      };
      place(left, -edge, gapL);
      place(right, gapR, edge);
      (left.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.1 * Math.sin(time * 5);
      const length = boss.z - MECH_SHIELD_AHEAD - distance + 2;
      lane.position.set(this.shield.x, 0.05, Z(distance - 2 + length / 2));
      lane.scale.set(MECH_GAP_HALF_WIDTH * 2, 1, length);
    }

    // fire on the road: a band of flames up the strip, licking and smoking
    const fires = new Set(cur.fires.map((f) => f.id));
    for (const f of cur.fires) {
      let view = this.fireViews.get(f.id);
      if (!view) {
        view = new THREE.Mesh(this.hazardStrip, new THREE.MeshBasicMaterial({ map: this.fireTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        view.renderOrder = 4;
        this.scene.add(view);
        this.fireViews.set(f.id, view);
      }
      const length = 16;
      view.position.set(f.x, 0.07, Z(distance + length / 2 - 2));
      view.scale.set((f.halfWidth + 0.45) * 2, 1, length);
      (view.material as THREE.MeshBasicMaterial).opacity = Math.min(1, f.ticks / 20) * (0.75 + 0.25 * Math.sin(time * 13 + f.id));
      if (often(20, dt)) this.flash(f.x + (Math.random() - 0.5) * f.halfWidth * 2, 0.4, distance - 1 + Math.random() * 14, Math.random() < 0.5 ? 0xff7a1a : 0xffc04a, 0.5, 1.4, 0.3);
      if (often(4, dt)) this.puff(f.x, 1, distance + Math.random() * 12, 0x3a302c, 0.8, 2.4, 0.9, 1.4);
    }
    for (const [id, view] of this.fireViews) {
      if (fires.has(id)) continue;
      view.removeFromParent();
      (view.material as THREE.Material).dispose();
      this.fireViews.delete(id);
    }

    // an enraged boss glows red behind, pulsing
    this.aura.visible = !!fight?.enraged && !!boss;
    if (this.aura.visible && boss) {
      const k = 10 + Math.sin(time * 6) * 1.2;
      this.aura.position.set(boss.x, 3.6, Z(boss.z + 0.6));
      this.aura.scale.set(k, k * 1.15, 1);
      this.aura.material.opacity = 0.55 + 0.15 * Math.sin(time * 6);
    }

    this.laserLife = Math.max(0, this.laserLife - dt);
    this.laser.visible = this.laserLife > 0;
    (this.laser.material as THREE.MeshBasicMaterial).opacity = this.laserLife / 0.3;
  }

  /**
   * The model of a missile or a keg. A keg is a frame that holds its hit points upright and the barrel that rolls
   * inside it, so the number does not roll with it.
   */
  private buildProjectile(kind: Projectile["kind"]): THREE.Group {
    if (kind === "missile") {
      const missile = partsToGroup(missileParts(), this.ramp);
      missile.userData.kind = kind;
      return missile;
    }
    const frame = new THREE.Group();
    const body = partsToGroup(kegParts(), this.ramp);
    const hp = new TextSprite(1.5, 0.75);
    hp.sprite.position.y = 1.15;
    hp.sprite.renderOrder = 10;
    frame.add(body, hp.sprite);
    frame.userData = { kind, body, hp };
    this.disposables.push(hp);
    return frame;
  }

  /** The Mecha's laser: a beam from its visor down to the strip it hits. */
  private beam(fromX: number, fromZ: number, toX: number, toZ: number) {
    const from = new THREE.Vector3(fromX, 6, Z(fromZ));
    const to = new THREE.Vector3(toX, 0.3, Z(toZ));
    this.laser.position.copy(from).add(to).multiplyScalar(0.5);
    this.laser.scale.set(1, 1, from.distanceTo(to));
    this.laser.lookAt(to);
    this.laserLife = 0.3;
  }

  /** The bomber flying across the sky ahead of the squad, with its shadow sliding along the road. */
  private drawPlane(prev: GameState, cur: GameState, alpha: number, distance: number) {
    const plane = cur.plane;
    this.plane.visible = this.planeShadow.visible = !!plane;
    if (!plane) return;
    const t = lerp(prev.plane?.t ?? plane.t, plane.t, alpha);
    const x = lerp(-34, 34, t);
    this.plane.position.set(x, 8.5, Z(distance + 13));
    this.plane.rotation.z = Math.sin(t * 9) * 0.06;
    this.planeShadow.position.set(x, 0.05, Z(distance + 13));
  }

  /** Spikes and mines: shown while they are ahead, a mine's light blinking faster as the squad nears it. */
  private drawTraps(cur: GameState, distance: number, time: number) {
    const live = new Set(cur.traps.map((t) => t.id));
    for (const [id, view] of this.trapViews) {
      const t = cur.traps.find((x) => x.id === id);
      view.group.visible = live.has(id) && !!t && !t.used && t.z > distance - 1 && t.z < distance + 90;
      if (view.light && t) view.light.visible = Math.sin(time * (t.z - distance < 14 ? 16 : 5)) > 0;
    }
  }

  private drawGatesAndBarrels(cur: GameState, distance: number, time: number) {
    for (const g of cur.gates) {
      const view = this.gates.get(g.id);
      if (!view) continue;
      this.drawGate(view, g);
      view.group.visible = g.z > distance - 3 && g.z < distance + 90;
    }
    const alive = new Set(cur.barrels.map((b) => b.id));
    for (const [id, view] of this.barrels) {
      const b = cur.barrels.find((x) => x.id === id);
      view.group.visible = alive.has(id) && !!b && b.z < distance + 90;
      if (!b) continue;
      view.hp.set(String(Math.ceil(Math.max(0, b.hp))), "#ffffff", "#5a2d0c");
      view.reward.rotation.y = time * 1.6;
      view.reward.position.y = 2.9 + Math.sin(time * 3 + id) * 0.12;
    }
  }

  /** Bullets are drawn from the volleys: each column sends a tracer every `FIRE_GAP` seconds. */
  private drawShots(cur: GameState, distance: number, dt: number) {
    if (cur.status === "playing") {
      cur.volleys.forEach((v, i) => {
        this.fireClock[i] = (this.fireClock[i] ?? 0) + dt;
        const shot = v.vehicle ? VEHICLE_SHOT[v.vehicle] : { gap: FIRE_GAP, color: SQUAD_TRACER, thick: 1.3 };
        while (this.fireClock[i] >= shot.gap) {
          this.fireClock[i] -= shot.gap;
          if (this.bullets.length < BULLET_CAPACITY) {
            this.bullets.push({ x: v.x, z: distance + 0.6, endZ: v.z, hit: v.hit, thick: shot.thick, color: shot.color });
            // the flash sits at the muzzle, which is lower and closer on a squad drawn small
            const muzzle = v.vehicle ? 1 : this.squadScale;
            this.flash(v.x, 0.95 * muzzle, distance + 0.9 * muzzle, v.vehicle ? 0xffb050 : 0xffe9a8, v.vehicle ? 0.9 : 0.5, v.vehicle ? 1.7 : 1, v.vehicle ? 0.1 : 0.06);
          }
        }
      });
    }
    let used = 0;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.z += BULLET_SPEED * dt;
      if (b.z >= b.endZ) {
        // a spark where the shot lands on something
        if (b.hit) {
          this.burst(b.x, 0.8, b.endZ, b.color, 1, 0.35 * b.thick);
          this.flash(b.x, 0.8, b.endZ, b.color, 0.3 * b.thick, 0.8 * b.thick, 0.09);
        }
        this.bullets.splice(i, 1);
        continue;
      }
    }
    for (const b of this.bullets) {
      if (used >= BULLET_CAPACITY) break;
      this.bulletMesh.setMatrixAt(used, this.tmp.makeTranslation(b.x, 0.8, Z(b.z)).scale(new THREE.Vector3(b.thick, b.thick, 2.6)));
      this.bulletMesh.setColorAt(used++, this.colorTmp.setHex(b.color));
    }
    this.bulletMesh.count = used;
    this.bulletMesh.instanceMatrix.needsUpdate = true;
    if (this.bulletMesh.instanceColor) this.bulletMesh.instanceColor.needsUpdate = true;
  }

  /** Burst, shake and flash from what changed in the last tick. */
  private tickEffects(prev: GameState, cur: GameState) {
    const now = new Set(cur.enemies.map((e) => e.id));
    for (const e of prev.enemies) {
      if (now.has(e.id)) continue;
      const contact = e.z - prev.distance < 2.6;
      if (e.kind === "bomber") {
        // a bomber going off is a fireball, whether it was shot or reached the squad
        this.explosion(e.x, e.z, 1.1);
        this.shake = Math.min(1, this.shake + (contact ? 0.5 : 0.25));
      } else if (e.kind === "boss") {
        this.explosion(e.x, e.z, 3, 0xffc24a);
        this.explosion(e.x + 1.5, e.z + 1, 2);
        this.shake = 1;
      } else {
        this.burst(e.x, 0.7, e.z, contact ? 0xffb347 : ENEMY_DEBRIS[e.kind], e.kind === "brute" || e.kind === "shield" ? 12 : 7, 1);
        this.puff(e.x, 0.7, e.z, 0xc8c0b0, 0.6, e.kind === "brute" || e.kind === "shield" ? 2.4 : 1.5, 0.5, 0.8);
      }
      if (!contact) this.ghosts.push({ kind: e.kind, x: e.x, z: e.z, age: 0 });
    }
    const barrels = new Set(cur.barrels.map((b) => b.id));
    for (const b of prev.barrels) if (!barrels.has(b.id) && b.z > prev.distance - 2) {
        this.burst(b.x, 1, b.z, 0xffd24a, 22, 1.8);
        this.explosion(b.x, b.z, 0.8, 0xffc24a);
      }
    if (cur.squad.count < prev.squad.count) this.shake = Math.min(1, this.shake + 0.35);
    if (cur.lastGate && cur.lastGate.tick === cur.tick) {
      this.burst(cur.squad.x, 1.4, cur.distance, cur.lastGate.good ? 0x6bb8ff : 0xff6b6b, 24, 2.4);
      this.flash(cur.squad.x, 1.2, cur.distance, cur.lastGate.good ? 0x6bb8ff : 0xff6b6b, 1.5, 7, 0.4);
    }
    // a shooter's shot: a flash at its gun and a puff where it lands on the squad
    for (const shot of cur.enemyShots) {
      this.burst(shot.x, 1, shot.z, 0xffc15a, 6, 1);
      this.burst(cur.squad.x, 1, cur.distance, 0xff4040, 8, 1.3);
      this.shake = Math.min(1, this.shake + 0.12);
    }
    // a trap or a bomb that landed on the squad: a blast where it hit, and the screen shakes with the loss
    if (cur.lastImpact && cur.lastImpact.tick === cur.tick) {
      const hit = cur.lastImpact;
      this.explosion(hit.x, hit.z, hit.kind === "bomb" ? 1.7 : hit.kind === "mine" ? 1.3 : 0.9, hit.kind === "spikes" ? 0xd8d0c0 : 0xff8a2a);
      this.shake = Math.min(1, this.shake + (hit.lost > 0 ? 0.6 : 0.3));
    }
    // a mine, missile or keg shot to pieces before it could do any harm
    for (const p of cur.popped) {
      if (p.kind === "mine") {
        this.burst(p.x, 0.4, p.z, 0xffc24a, 14, 1.4);
        this.puff(p.x, 0.5, p.z, 0xb8b0a0, 0.8, 2.6, 0.5, 1);
      } else this.explosion(p.x, p.z, p.kind === "missile" ? 0.7 : 0.9, 0xffb03a);
    }
    // a missile or a keg setting off from the boss
    const known = new Set(prev.projectiles.map((p) => p.id));
    for (const p of cur.projectiles) {
      if (known.has(p.id)) continue;
      this.throwAt = performance.now() / 1000;
      if (p.kind === "missile") {
        this.flash(p.x, 3.4, p.z, 0xffd080, 1, 3, 0.2);
        this.puff(p.x, 3.4, p.z, 0xc8c0b8, 1, 3, 0.7, 0.6);
      } else this.puff(p.x, 0.6, p.z, 0xd8c8a8, 0.8, 2.4, 0.6, 0.5);
    }
    // what the boss's attacks did when they landed
    const boss = cur.bossHits.length ? bossOf(prev) : undefined;
    for (const hit of cur.bossHits) {
      if (hit.kind === "slam") {
        // the smash: dust and red sparks up the strip, and the whole screen shakes
        for (let k = 0; k < 6; k++) {
          const zz = cur.distance + 1 + k * 2.5;
          this.burst(hit.x + (Math.random() - 0.5) * 2, 0.4, zz, k % 2 ? 0xff5a3a : 0xd8c8a8, 14, 2.2);
          this.puff(hit.x + (Math.random() - 0.5) * 1.5, 0.5, zz, 0xb8a888, 1.4, 4, 0.8, 1.2);
        }
        this.explosion(hit.x, cur.distance + 6, 1.4, 0xffa040);
        this.shake = 1;
      } else if (hit.kind === "missile" || hit.kind === "keg") {
        this.explosion(hit.x, hit.z, hit.kind === "missile" ? 1.3 : 1.1);
        this.shake = Math.min(1, this.shake + (hit.lost > 0 ? 0.6 : 0.3));
      } else if (hit.kind === "laser") {
        this.beam(boss?.x ?? 0, boss?.z ?? cur.distance + 14, hit.x, cur.distance + 2);
        for (let k = 0; k < 5; k++) this.burst(hit.x + (Math.random() - 0.5) * 2, 0.3, cur.distance + k * 2.5, 0xff5aa0, 10, 1.6);
        this.flash(hit.x, 0.5, cur.distance + 2, 0xff3a8a, 2, 6, 0.3);
        this.shake = Math.min(1, this.shake + 0.5);
      } else if (hit.kind === "ice") {
        for (let k = 0; k < 6; k++) {
          const zz = cur.distance + k * 2.5;
          this.burst(hit.x + (Math.random() - 0.5) * 2.4, 0.4, zz, k % 2 ? 0xd8f6ff : 0x7fd8ff, 12, 1.6);
          this.puff(hit.x + (Math.random() - 0.5) * 2, 0.6, zz, 0xeaf8ff, 1.2, 3.6, 0.8, 0.8);
        }
        this.shake = Math.min(1, this.shake + 0.3);
      } else if (hit.kind === "meteor") {
        this.explosion(hit.x, cur.distance + 5, 1.6, 0xff6a1a);
        this.shake = Math.min(1, this.shake + 0.7);
      } else {
        // the fire taking soldiers: a few sparks over the squad
        this.burst(hit.x, 0.8, cur.distance, 0xff8a2a, 6, 0.8);
      }
    }
  }

  private burst(x: number, y: number, z: number, color: number, n: number, power: number) {
    for (let i = 0; i < n && this.sparks.length < PARTICLE_CAPACITY; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.4 + Math.random()) * 3.2 * power;
      this.sparks.push({ p: new THREE.Vector3(x, y, Z(z)), v: new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 4 * power, Math.sin(a) * s), life: 0.5 + Math.random() * 0.4, size: (0.08 + Math.random() * 0.1) * Math.sqrt(power), color });
    }
  }

  private drawSparks(dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.v.y -= 14 * dt;
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.05) {
        s.p.y = 0.05;
        s.v.y *= -0.35;
        s.v.x *= 0.7;
        s.v.z *= 0.7;
      }
    }
    this.sparks.forEach((s, i) => {
      const k = Math.min(1, s.life * 3) * s.size;
      this.sparkMesh.setMatrixAt(i, this.tmp.compose(s.p, new THREE.Quaternion(), new THREE.Vector3(k, k, k)));
      this.sparkMesh.setColorAt(i, this.colorTmp.setHex(s.color));
    });
    this.sparkMesh.count = this.sparks.length;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  /** A sprite from the pool, or a new one. */
  private takeGlow(additive: boolean): THREE.Sprite {
    const idle = additive ? this.idleGlows.additive : this.idleGlows.smoke;
    const sprite = idle.pop();
    if (sprite) return sprite;
    const material = new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
    const made = new THREE.Sprite(material);
    made.userData.additive = additive;
    made.renderOrder = additive ? 6 : 5;
    this.scene.add(made);
    this.disposables.push({ dispose: () => material.dispose() });
    return made;
  }

  /** A bright flash that swells and fades: muzzle flashes, hit sparks, the core of a blast. */
  private flash(x: number, y: number, z: number, color: number, from: number, to: number, life: number) {
    if (this.glows.length > 140) return;
    const sprite = this.takeGlow(true);
    (sprite.material as THREE.SpriteMaterial).color.setHex(color);
    sprite.position.set(x, y, Z(z));
    sprite.visible = true;
    this.glows.push({ sprite, life, max: life, from, to, rise: 0 });
  }

  /** A puff of smoke or dust that swells, drifts up and thins out. */
  private puff(x: number, y: number, z: number, color: number, from: number, to: number, life: number, rise = 1.2) {
    if (this.glows.length > 140) return;
    const sprite = this.takeGlow(false);
    (sprite.material as THREE.SpriteMaterial).color.setHex(color);
    sprite.position.set(x, y, Z(z));
    sprite.visible = true;
    this.glows.push({ sprite, life, max: life, from, to, rise });
  }

  /** A fireball with a white core, a ring of force on the ground and smoke: bombers, barrels and the boss going down. */
  private explosion(x: number, z: number, power: number, color = 0xff8a2a) {
    this.flash(x, 1, z, 0xffffff, 1 * power, 3.4 * power, 0.16);
    this.flash(x, 1, z, color, 1.6 * power, 6.5 * power, 0.38);
    this.puff(x, 1.2, z, 0x57504a, 1.6 * power, 6 * power, 0.9, 1.6);
    this.puff(x + 0.4 * power, 0.8, z - 0.3 * power, 0x7a7068, 1.2 * power, 4.5 * power, 0.7, 1);
    this.burst(x, 1, z, color, Math.round(10 * power), 1.6 * power);
    if (this.shocks.length < 6) {
      const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.07, Z(z));
      this.scene.add(mesh);
      this.shocks.push({ mesh, life: 0.45, max: 0.45, size: 5 * power });
    }
  }

  private drawGlows(dt: number) {
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const g = this.glows[i];
      g.life -= dt;
      if (g.life <= 0) {
        g.sprite.visible = false;
        (g.sprite.userData.additive ? this.idleGlows.additive : this.idleGlows.smoke).push(g.sprite);
        this.glows.splice(i, 1);
        continue;
      }
      const t = 1 - g.life / g.max;
      const k = lerp(g.from, g.to, 1 - (1 - t) * (1 - t));
      g.sprite.scale.set(k, k, 1);
      g.sprite.position.y += g.rise * dt;
      (g.sprite.material as THREE.SpriteMaterial).opacity = g.sprite.userData.additive ? (1 - t) ** 1.4 : 0.55 * (1 - t);
    }
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const sh = this.shocks[i];
      sh.life -= dt;
      if (sh.life <= 0) {
        sh.mesh.removeFromParent();
        (sh.mesh.material as THREE.Material).dispose();
        this.shocks.splice(i, 1);
        continue;
      }
      const t = 1 - sh.life / sh.max;
      sh.mesh.scale.setScalar(0.5 + sh.size * (1 - (1 - t) ** 2));
      (sh.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
    }
  }

  dispose() {
    window.removeEventListener("resize", this.onResize);
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** The canvas, for pointer input. */
  get canvas() {
    return this.renderer.domElement;
  }

  /** Road units per CSS pixel at the squad's position, for turning a drag into a slide. */
  unitsPerPixel(): number {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(17, 10.8 / (2 * tanHalf * Math.min(this.camera.aspect, 1.1)));
    return (2 * tanHalf * dist * this.camera.aspect) / Math.max(1, this.host.clientWidth) / 1.12;
  }
}

/** A sky that fades from `top` overhead to `horizon` where the road meets it. */
function skyTexture(top: number, horizon: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `#${top.toString(16).padStart(6, "0")}`);
  grad.addColorStop(0.7, `#${horizon.toString(16).padStart(6, "0")}`);
  grad.addColorStop(1, `#${horizon.toString(16).padStart(6, "0")}`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roadTexture(base: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const rng = { rng: 99 };
  for (let i = 0; i < 700; i++) {
    g.fillStyle = nextRandom(rng) < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    g.fillRect(nextRandom(rng) * 256, nextRandom(rng) * 256, 3, 3);
  }
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.fillRect(124, 0, 8, 120);
  g.fillRect(6, 0, 5, 256);
  g.fillRect(245, 0, 5, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A honeycomb of thin bright lines, for the Mecha's shield. */
function honeycombTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineWidth = 3;
  const r = 16;
  const h = r * Math.sqrt(3);
  for (let row = -1; row < 128 / h + 1; row++) {
    for (let col = -1; col < 128 / (r * 1.5) + 1; col++) {
      const cx = col * r * 1.5;
      const cy = row * h + (col % 2 ? h / 2 : 0);
      g.beginPath();
      for (let k = 0; k < 6; k++) g.lineTo(cx + Math.cos((k * Math.PI) / 3) * r, cy + Math.sin((k * Math.PI) / 3) * r);
      g.closePath();
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

/** A band of flames, hot in the middle and fading at the edges, for the road on fire. */
function flameTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  const across = g.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, "rgba(255,80,10,0)");
  across.addColorStop(0.25, "rgba(255,110,20,0.75)");
  across.addColorStop(0.5, "rgba(255,200,80,0.95)");
  across.addColorStop(0.75, "rgba(255,110,20,0.75)");
  across.addColorStop(1, "rgba(255,80,10,0)");
  g.fillStyle = across;
  g.fillRect(0, 0, 64, 256);
  const rng = { rng: 5 };
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,${200 + Math.floor(nextRandom(rng) * 55)},120,0.5)`;
    g.beginPath();
    g.ellipse(12 + nextRandom(rng) * 40, nextRandom(rng) * 256, 3 + nextRandom(rng) * 5, 6 + nextRandom(rng) * 10, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 16;
  const g = c.getContext("2d")!;
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
    g.fillStyle = (x + y) % 2 ? "#ffffff" : "#1b1b2a";
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rewardText(r: Reward): string {
  if (r.kind === "weapon") return WEAPON_NAMES[r.weapon];
  if (r.kind === "vehicle") return VEHICLE_NAMES[r.vehicle];
  if (r.kind === "soldiers") return `+${r.count}`;
  return `$${r.count}`;
}

/** A small hovering model that says what is inside the barrel. */
function rewardModel(r: Reward, ramp: THREE.DataTexture): THREE.Object3D {
  const mat = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });
  const g = new THREE.Group();
  if (r.kind === "vehicle") {
    const model = buildVehicle(r.vehicle, ramp);
    model.group.scale.setScalar(0.85);
    model.group.rotation.y = 0;
    g.add(model.group);
  } else if (r.kind === "weapon") {
    // the real weapon model, turned to show its side
    const gun = partsToGroup(weaponParts(r.weapon), ramp);
    gun.position.set(-0.04, -0.9, 0.5);
    const holder = new THREE.Group();
    holder.add(gun);
    holder.scale.setScalar(2.2);
    holder.rotation.y = Math.PI / 2;
    g.add(holder);
  } else if (r.kind === "soldiers") {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), mat(0xf3c9a3));
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0x2f8f3b));
    helmet.position.y = 0.05;
    g.add(head, helmet);
  } else {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 20), mat(0xffc93c));
    coin.rotation.x = Math.PI / 2;
    g.add(coin);
  }
  return g;
}
