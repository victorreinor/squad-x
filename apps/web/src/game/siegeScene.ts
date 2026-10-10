import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LEGION_PER_ROW, LEGION_ROW_SPACING, SIEGE_CARPET_HALF, SIEGE_CONTACT, SIEGE_HP_UNIT, type SiegeState } from "@squadx/engine";
import { CASTLE_LOOK, addBridge, buildBanner, buildWall, setBanner, setWall, skyGradient, type BannerView, type Site, type WallView } from "./castle";
import { Crowd, toonRamp } from "./crowd";
import { TextSprite } from "./labels";
import { OGRE_SCALE, ogreFigure, runBrawler, runKnight, runLegionnaire } from "./siegeFigures";
import { sharpness } from "./sharpness";

/** The engine runs down +z; the camera looks down -z so +x is on the right. */
const Z = (z: number) => -z;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** most knights drawn, however many the squad has: the counter says the real number */
const KNIGHTS_SHOWN = 120;
/** below this size the squad is drawn with the light knight */
const FAR_BELOW = 0.84;
/** up to this many every knight is drawn; past it the crowd grows slower than the count */
const SHOWN_EXACTLY = 60;
/** the most soldiers of the legion drawn at once: the front of it, as far as the camera sees */
const LEGION_SHOWN = 2600;
/** how far ahead of the squad every soldier of the legion is drawn (units); the rest of the army is a textured slab */
const LEGION_VIEW = 46;
/** how far ahead the boss is still drawn (units) */
const BOSS_VIEW = 230;
/** how far ahead of the squad the banners are built (units) */
const BANNER_VIEW = 120;
/** how far ahead of the squad the bridge is built (units): past the fog */
const BRIDGE_LENGTH = 360;
/** how big each figure is drawn, and how far apart the legion's soldiers stand across the carpet (units) */
const LEGION_SCALE = 0.56;
const LEGION_SPACING = (SIEGE_CARPET_HALF * 2) / LEGION_PER_ROW;

const ARROW_CAPACITY = 400;
const PARTICLE_CAPACITY = 260;
/** seconds between two arrows of one column, how fast they fly (units/s) and how high they rise at the top of the arc (units) */
const ARROW_GAP = 0.1;
const ARROW_SPEED = 70;
const ARROW_ARC = 1.6;
const ARROW_GOLD = 0xffc928;
const ARROW_STRETCH = new THREE.Vector3(1.4, 1.4, 1.8);

interface Arrow {
  x: number;
  z: number;
  endZ: number;
  start: number;
  hit: boolean;
}

/** A champion's health bar over its head: the dark back, the red fill that shortens and the number. */
interface ChampionView {
  group: THREE.Group;
  back: THREE.Sprite;
  fill: THREE.Sprite;
  number: TextSprite;
}

/** how wide a champion's bar is drawn (units) */
const BAR_WIDTH = 2.2;
/** the most champions drawn at once */
const CHAMPIONS_SHOWN = 6;

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  size: number;
  color: number;
}

/** A cheap hash in [0, 1) for a place in the legion, so each soldier keeps his own offset and gait from frame to frame. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/** How the squad is laid out for drawing: how many knights, how big, and how they line up behind the front row. */
function knightFormation(count: number) {
  const shown = count <= SHOWN_EXACTLY ? count : Math.round(SHOWN_EXACTLY + (KNIGHTS_SHOWN - SHOWN_EXACTLY) * Math.sqrt((count - SHOWN_EXACTLY) / (999 - SHOWN_EXACTLY)));
  const scale = shown <= 12 ? 0.95 : lerp(0.95, 0.7, Math.min(1, (shown - 12) / (KNIGHTS_SHOWN - 12)));
  const cols = Math.max(1, Math.min(8, Math.round(Math.sqrt(shown * 1.1))));
  const dx = 0.58 * scale;
  const dz = 0.55 * scale;
  const rows = Math.ceil(shown / cols);
  return { shown, scale, cols, dx, dz, depth: (rows - 1) * dz };
}

/** One legionnaire seen from above, tiled: a dark ground, a red helmet with its outline and a gold spike. */
function helmetTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#a31a22";
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = "#1a0605";
  g.beginPath();
  g.arc(16, 16, 12.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#c8281e";
  g.beginPath();
  g.arc(16, 16, 10.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.beginPath();
  g.arc(13, 13, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#f2c230";
  g.fillRect(15, 14, 2, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Everything the player sees in the siege, drawn from the engine's `SiegeState`. Owns the WebGL renderer. */
export class SiegeScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.5, 420);
  private readonly ramp = toonRamp();
  private readonly knights: Crowd;
  /** the same squad once it is big and drawn small: a lighter knight */
  private readonly knightsFar: Crowd;
  private readonly legion: Crowd;
  private readonly ogre: Crowd;
  /** the back of the legion, far away, as a slab of tiny helmets instead of thousands of figures */
  private readonly mass: THREE.Mesh;
  private readonly massTexture: THREE.CanvasTexture;
  private readonly banners = new Map<number, BannerView>();
  private readonly walls = new Map<number, WallView>();
  private readonly site: Site;
  private readonly brawlers: Crowd;
  private readonly championViews = new Map<number, ChampionView>();
  private readonly count = new TextSprite(2.4, 1.2);
  private readonly legionCount = new TextSprite(4.4, 2.2);
  private readonly arrowMesh: THREE.InstancedMesh;
  private readonly arrows: Arrow[] = [];
  private readonly fireClock: number[] = [];
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly sparks: Particle[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly tmp = new THREE.Matrix4();
  private readonly colorTmp = new THREE.Color();
  private depth = 0;
  private lastTick = -1;

  constructor(private readonly host: HTMLElement, state: SiegeState) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(sharpness.start());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.background = skyGradient(CASTLE_LOOK.skyTop, CASTLE_LOOK.sky);
    this.scene.fog = new THREE.Fog(CASTLE_LOOK.sky, 110, 320);
    this.scene.add(new THREE.HemisphereLight(0xffffff, CASTLE_LOOK.sea, 1.5));
    const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
    sun.position.set(-6, 14, 8);
    this.scene.add(sun);

    // the bridge and the camera never move: only what stands on the bridge comes at the squad
    const site: Site = { scene: this.scene, ramp: this.ramp, disposables: this.disposables, length: BRIDGE_LENGTH };
    this.site = site;
    addBridge(site);

    this.knights = new Crowd(KNIGHTS_SHOWN, runKnight(), this.ramp);
    this.knightsFar = new Crowd(KNIGHTS_SHOWN, runKnight(true), this.ramp);
    this.legion = new Crowd(LEGION_SHOWN, runLegionnaire(), this.ramp);
    this.ogre = new Crowd(1, ogreFigure(), this.ramp);
    this.brawlers = new Crowd(CHAMPIONS_SHOWN, runBrawler(), this.ramp);
    for (const crowd of [this.knights, this.knightsFar, this.legion, this.ogre, this.brawlers]) {
      this.scene.add(crowd.group);
      this.disposables.push(crowd);
    }

    this.massTexture = helmetTexture();
    this.mass = new THREE.Mesh(new THREE.PlaneGeometry(SIEGE_CARPET_HALF * 2, 1), new THREE.MeshToonMaterial({ map: this.massTexture, gradientMap: this.ramp }));
    this.mass.rotation.x = -Math.PI / 2;
    this.mass.position.y = 0.55;
    this.scene.add(this.mass);
    this.disposables.push(this.mass.geometry, this.mass.material as THREE.Material, this.massTexture);

    for (const w of state.walls) this.walls.set(w.id, buildWall(site, w));

    this.count.sprite.renderOrder = 10;
    this.legionCount.sprite.renderOrder = 10;
    this.scene.add(this.count.sprite, this.legionCount.sprite);
    this.disposables.push(this.count, this.legionCount);

    const arrowGeo = new THREE.BoxGeometry(0.07, 0.07, 1);
    this.arrowMesh = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color: ARROW_GOLD }), ARROW_CAPACITY);
    this.arrowMesh.frustumCulled = false;
    this.arrowMesh.count = 0;
    this.scene.add(this.arrowMesh);
    this.disposables.push(arrowGeo, this.arrowMesh.material as THREE.Material);

    const sparkGeo = new THREE.BoxGeometry(1, 1, 1);
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, new THREE.MeshBasicMaterial(), PARTICLE_CAPACITY);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.count = 0;
    this.sparkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_CAPACITY * 3), 3);
    this.scene.add(this.sparkMesh);
    this.disposables.push(sparkGeo, this.sparkMesh.material as THREE.Material);

    this.resize();
    window.addEventListener("resize", this.onResize);
  }

  private readonly onResize = () => this.resize();

  /** Fit the canvas to its container. */
  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** How far the camera sits from the squad: far enough back that the whole bridge fits the width of the screen. */
  private cameraDistance() {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return Math.max(17, 14.2 / (2 * tanHalf * Math.min(this.camera.aspect, 1.1)));
  }

  /** Draw the state `alpha` of the way between `prev` and `cur`. `dt` is real seconds since the last frame. */
  render(prev: SiegeState, cur: SiegeState, alpha: number, dt: number, time: number) {
    if (cur.tick !== this.lastTick) {
      if (this.lastTick >= 0) this.tickEffects(prev, cur);
      this.lastTick = cur.tick;
    }

    const ratio = sharpness.frame(dt);
    if (ratio) this.renderer.setPixelRatio(ratio);

    const distance = lerp(prev.distance, cur.distance, alpha);
    const squadX = lerp(prev.squad.x, cur.squad.x, alpha);

    this.drawBanners(cur, distance);
    this.drawWalls(cur, distance);
    this.drawSquad(cur, squadX, time);
    this.drawLegion(prev, cur, alpha, distance, time);
    this.drawChampions(prev, cur, alpha, distance, time);
    this.drawArrows(cur, distance, dt);
    this.drawSparks(dt);
    this.placeCamera(squadX);
    this.renderer.render(this.scene, this.camera);
  }

  /** The camera looks at the squad, which stands at z = 0 of the scene: everything else is drawn at its distance from the squad. */
  private placeCamera(squadX: number) {
    const dist = this.cameraDistance();
    const elevation = THREE.MathUtils.degToRad(39);
    // a deep squad stretches behind its front row: back the camera up so the last rows are not cut off
    const back = Math.max(0, this.depth - 2) * 0.6;
    this.camera.position.set(squadX * 0.3, Math.sin(elevation) * dist + back * 0.3, Z(-back) + Math.cos(elevation) * dist);
    this.camera.lookAt(squadX * 0.15, 0.4, Z(13 - back));
  }

  /**
   * The banners are built as they come into view and thrown away once they have gone by: a long road has hundreds of
   * them, and each one is a texture.
   */
  private drawBanners(cur: SiegeState, distance: number) {
    for (const b of cur.banners) {
      const near = b.z - cur.distance < BANNER_VIEW && (!b.used || b.z > cur.distance - 6);
      let view = this.banners.get(b.id);
      if (!near) {
        if (view) {
          this.scene.remove(view.group);
          view.dispose();
          this.banners.delete(b.id);
        }
        continue;
      }
      if (!view) {
        view = buildBanner(this.site, b.value, b.x > 0);
        this.scene.add(view.group);
        this.banners.set(b.id, view);
      }
      view.group.position.set(b.x, 0, Z(b.z - distance));
      setBanner(view, b.value, b.x > 0);
    }
  }

  private drawWalls(cur: SiegeState, distance: number) {
    for (const w of cur.walls) {
      const view = this.walls.get(w.id)!;
      view.group.position.z = Z(w.z - distance);
      // a wall far behind or far ahead is not drawn at all
      view.group.visible = w.z - distance < BANNER_VIEW + 40 && w.z + w.depth - distance > -8;
      setWall(view, w);
    }
  }

  /** The champions: a broad fighter each, with a bar and a number over its head. */
  private drawChampions(prev: SiegeState, cur: SiegeState, alpha: number, distance: number, time: number) {
    this.brawlers.begin();
    const live = new Set<number>();
    for (const c of cur.champions.slice(0, CHAMPIONS_SHOWN)) {
      live.add(c.id);
      const before = prev.champions.find((p) => p.id === c.id) ?? c;
      const x = lerp(before.x, c.x, alpha);
      const z = lerp(before.z, c.z, alpha) - distance;
      const scale = 1.5 + Math.min(1, c.maxHp / 5000) * 0.8;
      const fighting = c.z - cur.distance <= SIEGE_CONTACT + 0.05;
      this.brawlers.add(x, Z(z), scale, Math.PI, c.id * 1.7, time, before.hp > c.hp ? 0.35 : 0, 0, 0.1, 0, fighting ? 0.5 + 0.5 * Math.sin(time * 8) : 0);
      let view = this.championViews.get(c.id);
      if (!view) {
        view = this.buildChampionView();
        this.championViews.set(c.id, view);
      }
      view.group.position.set(x, 2.3 * scale + 0.9, Z(z));
      const share = Math.max(0, Math.min(1, c.hp / c.maxHp));
      view.fill.scale.x = BAR_WIDTH * share;
      view.fill.position.x = -BAR_WIDTH / 2;
      view.number.set(String(Math.max(0, Math.ceil(c.hp / SIEGE_HP_UNIT))), "#ffffff", "#15171d");
    }
    this.brawlers.end();
    for (const [id, view] of this.championViews) {
      if (live.has(id)) continue;
      this.scene.remove(view.group);
      view.number.dispose();
      view.back.material.dispose();
      view.fill.material.dispose();
      this.championViews.delete(id);
    }
  }

  private buildChampionView(): ChampionView {
    const group = new THREE.Group();
    const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x14161c, transparent: true, opacity: 0.85, depthWrite: false }));
    back.scale.set(BAR_WIDTH + 0.16, 0.42, 1);
    const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xe8332a, depthWrite: false }));
    fill.center.set(0, 0.5);
    fill.scale.set(BAR_WIDTH, 0.3, 1);
    fill.position.z = 0.01;
    const number = new TextSprite(2.4, 1.2);
    number.sprite.position.y = 0.95;
    for (const sprite of [back, fill, number.sprite]) sprite.renderOrder = 11;
    group.add(back, fill, number.sprite);
    this.scene.add(group);
    return { group, back, fill, number };
  }

  /**
   * The squad stands still, bows up, and aims, at z = 0 of the scene: it is the world that comes at it (the banners, the
   * walls, the legion). Nobody runs; a column that is firing pulses its bow.
   */
  private drawSquad(cur: SiegeState, squadX: number, time: number) {
    const f = knightFormation(cur.squad.count);
    this.depth = lerp(this.depth, f.depth, 0.15);
    const firing = cur.status === "playing" && cur.volleys.some((v) => v.hit);
    const left = squadX - ((f.cols - 1) * f.dx) / 2;
    const crowd = f.scale < FAR_BELOW ? this.knightsFar : this.knights;
    for (const other of [this.knights, this.knightsFar]) if (other !== crowd) {
      other.begin();
      other.end();
    }
    crowd.begin();
    for (let i = 0; i < f.shown; i++) {
      const row = Math.floor(i / f.cols);
      const col = i % f.cols;
      // the last row is centred under the ones before it
      const inRow = row === Math.ceil(f.shown / f.cols) - 1 ? f.shown - row * f.cols : f.cols;
      const x = left + col * f.dx + ((f.cols - inRow) * f.dx) / 2;
      const jitter = (hash(i + 1) - 0.5) * 0.08;
      const phase = hash(i * 3 + 2) * 6;
      crowd.add(x + jitter, Z(-row * f.dz), f.scale, 0, phase, 0, 0, 0, 0, firing ? 0.035 * (0.5 + 0.5 * Math.sin(time * 16 + phase)) : 0);
    }
    crowd.end();
    this.count.sprite.position.set(squadX, 2.5 * f.scale + 1.2, Z(0));
    this.count.set(String(cur.squad.count), "#ffffff", "#17348a");
  }

  private drawLegion(prev: SiegeState, cur: SiegeState, alpha: number, distance: number, time: number) {
    const { legion } = cur;
    const front = lerp(prev.legion.z, legion.z, alpha);
    const rows = Math.max(0, Math.ceil(legion.count / LEGION_PER_ROW));
    const frontCount = legion.count - (rows - 1) * LEGION_PER_ROW;
    const walking = legion.awake && cur.status === "playing" && legion.z - cur.distance > SIEGE_CONTACT + 0.01;
    const fighting = legion.awake && !walking && cur.status === "playing";
    this.legion.begin();
    let drawn = 0;
    for (let r = 0; r < rows && drawn < LEGION_SHOWN; r++) {
      const z = front + r * LEGION_ROW_SPACING;
      if (z - distance > LEGION_VIEW) break;
      const across = r === 0 ? frontCount : LEGION_PER_ROW;
      // the front row after the last full one is partial: its soldiers are centred
      const absolute = rows - 1 - r;
      for (let c = 0; c < across && drawn < LEGION_SHOWN; c++) {
        const seed = absolute * 31 + c;
        const x = legion.x + (c - (across - 1) / 2) * LEGION_SPACING + (hash(seed) - 0.5) * 0.12;
        const gait = hash(seed + 0.5) * 6;
        const jab = fighting && r < 3 ? Math.max(0, Math.sin(time * 9 + gait)) * 0.5 : 0;
        this.legion.add(x, Z(z - distance + (hash(seed + 0.25) - 0.5) * 0.14), LEGION_SCALE, Math.PI, gait, walking || fighting ? time : 0, 0, 0, 0.12, 0, jab);
        drawn++;
      }
    }
    this.legion.end();

    // the rest of the army, from the last soldier drawn to the tail, is one slab whose tiny helmets line up with the rows
    const nearRows = Math.min(rows, Math.max(0, Math.ceil((distance + LEGION_VIEW - front) / LEGION_ROW_SPACING)));
    const farRows = rows - nearRows;
    this.mass.visible = farRows > 0;
    if (this.mass.visible) {
      const z0 = front + nearRows * LEGION_ROW_SPACING;
      const length = farRows * LEGION_ROW_SPACING;
      this.mass.scale.set(1, length, 1);
      this.mass.position.z = Z(z0 - distance + length / 2);
      this.massTexture.repeat.set(LEGION_PER_ROW, farRows);
      this.massTexture.offset.set(0, 0);
    }

    // the boss, behind the last row of the legion or alone once it is gone
    const boss = cur.boss;
    this.ogre.begin();
    if (boss.hp > 0 && boss.z - distance < BOSS_VIEW) {
      const z = lerp(prev.boss.z, boss.z, alpha);
      const flash = prev.boss.hp > boss.hp ? 0.35 : 0;
      this.ogre.add(boss.x, Z(z - distance), OGRE_SCALE, Math.PI, 0, walking || fighting || legion.count === 0 ? time * 0.6 : 0, flash, 0, 0, 0, fighting ? 0.5 + 0.5 * Math.sin(time * 5) : 0);
    }
    this.ogre.end();

    this.legionCount.sprite.visible = legion.count > 0 && front - distance < BOSS_VIEW;
    this.legionCount.sprite.position.set(legion.x, 3.4, Z(front - 0.5 - distance));
    this.legionCount.set(legion.count.toLocaleString("pt-BR"), "#ffffff", "#8a1218");
  }

  /** Arrows are drawn from the volleys: each column sends one every `ARROW_GAP` seconds, in a gold arc. */
  private drawArrows(cur: SiegeState, distance: number, dt: number) {
    if (cur.status === "playing") {
      cur.volleys.forEach((v, i) => {
        this.fireClock[i] = (this.fireClock[i] ?? Math.random() * ARROW_GAP) - dt;
        if (this.fireClock[i] <= 0) {
          this.fireClock[i] += ARROW_GAP;
          if (this.arrows.length < ARROW_CAPACITY) this.arrows.push({ x: v.x + (Math.random() - 0.5) * 0.2, z: 0.6, endZ: v.z - distance, start: 0.6, hit: v.hit });
        }
      });
    }
    let used = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.z += ARROW_SPEED * dt;
      if (a.z >= a.endZ) {
        // an arrow that found something lands in a puff of red; one that found nothing just goes out
        if (a.hit && Math.random() < 0.35) this.burst(a.x, 0.8, a.endZ, 0xffe27a, 2, 0.1);
        this.arrows.splice(i, 1);
      }
    }
    for (const a of this.arrows) {
      const span = Math.max(1, a.endZ - a.start);
      const t = Math.min(1, (a.z - a.start) / span);
      const y = 1 + Math.sin(t * Math.PI) * ARROW_ARC * Math.min(1, span / 40);
      this.tmp.makeTranslation(a.x, y, Z(a.z));
      this.tmp.scale(ARROW_STRETCH);
      this.arrowMesh.setMatrixAt(used++, this.tmp);
    }
    this.arrowMesh.count = used;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
  }

  /** Throw `n` pieces of debris from a point. */
  private burst(x: number, y: number, z: number, color: number, n: number, size: number) {
    for (let i = 0; i < n && this.sparks.length < PARTICLE_CAPACITY; i++) {
      this.sparks.push({ p: new THREE.Vector3(x, y, Z(z)), v: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), life: 0.5 + Math.random() * 0.4, size, color });
    }
  }

  /** What changed between two ticks: red soldiers falling at the front of the legion, knights falling, the boss struck. */
  private tickEffects(prev: SiegeState, cur: SiegeState) {
    if (cur.killedNow > 0) {
      const n = Math.min(10, 1 + Math.floor(cur.killedNow / 3));
      this.burst((Math.random() - 0.5) * SIEGE_CARPET_HALF * 1.6, 0.6, cur.legion.z - cur.distance, 0xd8362a, n, 0.14);
    }
    if (cur.lostNow > 0) this.burst(cur.squad.x + (Math.random() - 0.5) * 2, 0.8, 0.4, 0x4f86ff, Math.min(8, cur.lostNow + 1), 0.14);
    for (const w of cur.walls) {
      const before = prev.walls.find((p) => p.id === w.id);
      if (!before || w.hp >= before.hp) continue;
      // the wall sheds dust while it is shot and comes down in a cloud of stone
      this.burst(w.x + (Math.random() - 0.5) * 2, 1 + Math.random() * 2.5, w.z - cur.distance, 0xb8bcc6, before.hp > 0 && w.hp <= 0 ? 24 : 1, 0.16);
    }
    if (cur.champions.length < prev.champions.length) {
      for (const c of prev.champions) if (!cur.champions.some((n) => n.id === c.id)) this.burst(c.x, 1.6, c.z - cur.distance, 0xff7a2a, 14, 0.2);
    }
    if (cur.legion.count === 0 && cur.boss.hp < prev.boss.hp) this.burst(cur.boss.x + (Math.random() - 0.5) * 2, 2.4, cur.boss.z - cur.distance - 1.2, 0xffd24a, 3, 0.16);
  }

  private drawSparks(dt: number) {
    let used = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0 || s.p.y < 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.v.y -= 11 * dt;
      s.p.addScaledVector(s.v, dt);
    }
    for (const s of this.sparks) {
      this.tmp.makeTranslation(s.p.x, s.p.y, s.p.z).scale(new THREE.Vector3(s.size, s.size, s.size));
      this.sparkMesh.setMatrixAt(used, this.tmp);
      this.sparkMesh.setColorAt(used++, this.colorTmp.setHex(s.color));
    }
    this.sparkMesh.count = used;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    window.removeEventListener("resize", this.onResize);
    for (const d of this.disposables) d.dispose();
    for (const view of this.banners.values()) view.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** The canvas, for pointer input. */
  get canvas() {
    return this.renderer.domElement;
  }

  /** Bridge units per CSS pixel at the squad's position, for turning a drag into a slide. */
  unitsPerPixel(): number {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return (2 * tanHalf * this.cameraDistance() * this.camera.aspect) / Math.max(1, this.host.clientWidth) / 1.12;
  }
}
