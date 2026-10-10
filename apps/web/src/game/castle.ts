import * as THREE from "three";
import { SIEGE_BANNER_WIDTH, SIEGE_CARPET_HALF, SIEGE_HALF_WIDTH, SIEGE_HP_UNIT, SIEGE_WALL_DEPTH, nextRandom, type SiegeWall } from "@squadx/engine";
import { TextSprite } from "./labels";

/** The engine runs down +z; the scene looks down -z (see `scene.ts`). */
const Z = (z: number) => -z;

/** What a builder needs: where to put things, the toon ramp, and a list to hand back what must be freed. */
export interface Site {
  scene: THREE.Scene;
  ramp: THREE.DataTexture;
  disposables: { dispose(): void }[];
  /** the road runs from z = 0 to this */
  length: number;
}

const toon = (site: Site, color: number) => {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: site.ramp });
  site.disposables.push(m);
  return m;
};

/** A canvas turned into a texture that repeats. */
function tiled(draw: (g: CanvasRenderingContext2D, size: number) => void, size = 256): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Grey flagstones laid in offset rows, each a little different. */
function flagstones(): THREE.CanvasTexture {
  const rng = { rng: 4242 };
  return tiled((g, s) => {
    g.fillStyle = "#8c8f9a";
    g.fillRect(0, 0, s, s);
    const rows = 4;
    const h = s / rows;
    for (let r = 0; r < rows; r++) {
      const w = s / 2;
      for (let i = -1; i < 3; i++) {
        const x = i * w + (r % 2 ? w / 2 : 0);
        const shade = 150 + Math.floor(nextRandom(rng) * 36);
        g.fillStyle = `rgb(${shade},${shade + 2},${shade + 12})`;
        g.fillRect(x + 3, r * h + 3, w - 6, h - 6);
        g.fillStyle = "rgba(255,255,255,0.12)";
        g.fillRect(x + 3, r * h + 3, w - 6, 5);
        g.fillStyle = "rgba(0,0,0,0.12)";
        g.fillRect(x + 3, r * h + h - 8, w - 6, 5);
      }
    }
  });
}

/** The red carpet: a deep red weave with a darker band down each side. */
function carpetTexture(): THREE.CanvasTexture {
  return tiled((g, s) => {
    g.fillStyle = "#c4222a";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) {
      g.fillStyle = y % 16 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)";
      g.fillRect(0, y, s, 4);
    }
    g.fillStyle = "#8a1218";
    g.fillRect(0, 0, 18, s);
    g.fillRect(s - 18, 0, 18, s);
    g.fillStyle = "#e8b53a";
    g.fillRect(18, 0, 5, s);
    g.fillRect(s - 23, 0, 5, s);
  });
}

/** A sky that fades from `top` overhead to `horizon` where the bridge meets it. */
export function skyGradient(top: number, horizon: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, hex(top));
  grad.addColorStop(0.7, hex(horizon));
  grad.addColorStop(1, hex(horizon));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The look of the siege: sky, sea and the stone of the bridge. */
export const CASTLE_LOOK = { sky: 0xcfe0f2, skyTop: 0x4a78b8, sea: 0x1c3a5c, stone: 0x8c8f9a, dark: 0x5b5f6c };

/**
 * The bridge itself: flagstones, the red carpet with gold edges, a tinted strip on each side where the banner lanes
 * are, the low walls with their battlements, a tower now and then, and the sea far below.
 */
export function addBridge(site: Site) {
  const { scene, length } = site;
  const mid = Z(length / 2);
  const width = SIEGE_HALF_WIDTH * 2;
  const span = length + 160;

  const stones = flagstones();
  stones.repeat.set(width / 2.4, span / 2.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, span), new THREE.MeshToonMaterial({ map: stones, gradientMap: site.ramp }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, mid);
  scene.add(floor);
  site.disposables.push(floor.geometry, floor.material as THREE.Material, stones);

  const body = new THREE.Mesh(new THREE.BoxGeometry(width + 1.6, 3, span), toon(site, CASTLE_LOOK.dark));
  body.position.set(0, -1.55, mid);
  scene.add(body);
  site.disposables.push(body.geometry);

  const weave = carpetTexture();
  weave.repeat.set(1, span / 4);
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(SIEGE_CARPET_HALF * 2, span), new THREE.MeshToonMaterial({ map: weave, gradientMap: site.ramp }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.03, mid);
  scene.add(carpet);
  site.disposables.push(carpet.geometry, carpet.material as THREE.Material, weave);

  // each banner lane gets a pale tint of its colour, so which lane is which reads from far away
  for (const [side, color] of [[-1, 0x3f7cff], [1, 0xffc928]] as const) {
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(SIEGE_BANNER_WIDTH, span), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.26, depthWrite: false }));
    tint.rotation.x = -Math.PI / 2;
    tint.position.set(side * (SIEGE_CARPET_HALF + SIEGE_BANNER_WIDTH / 2), 0.045, mid);
    scene.add(tint);
    site.disposables.push(tint.geometry, tint.material as THREE.Material);
  }

  // the walls: a low stone parapet along each side, topped by merlons
  const wallX = SIEGE_HALF_WIDTH + 0.45;
  const wallGeo = new THREE.BoxGeometry(0.9, 1.5, span);
  const wallMat = toon(site, CASTLE_LOOK.stone);
  site.disposables.push(wallGeo);
  const merlons: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(side * wallX, 0.7, mid);
    scene.add(wall);
    for (let z = -60; z < length + 100; z += 1.6) merlons.push(m.clone().makeTranslation(side * wallX, 1.75, Z(z)));
  }
  const merlonGeo = new THREE.BoxGeometry(0.9, 0.6, 0.85);
  const tops = new THREE.InstancedMesh(merlonGeo, wallMat, merlons.length);
  merlons.forEach((matrix, i) => tops.setMatrixAt(i, matrix));
  tops.frustumCulled = false;
  scene.add(tops);
  site.disposables.push(merlonGeo, tops);

  // towers every so often, with a pointed roof and a pennant, blue on the left and red on the right
  const towerGeo = new THREE.CylinderGeometry(1.2, 1.5, 5, 10);
  const roofGeo = new THREE.ConeGeometry(1.7, 2.2, 10);
  const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5);
  const flagGeo = new THREE.PlaneGeometry(1.1, 0.6);
  site.disposables.push(towerGeo, roofGeo, poleGeo, flagGeo);
  for (let z = 30; z < length + 80; z += 40) {
    for (const side of [-1, 1]) {
      const x = side * (SIEGE_HALF_WIDTH + 3.4);
      const tower = new THREE.Mesh(towerGeo, wallMat);
      tower.position.set(x, 1.4, Z(z));
      const roof = new THREE.Mesh(roofGeo, toon(site, side < 0 ? 0x2f62d6 : 0xc8281e));
      roof.position.set(x, 4.7, Z(z));
      const pole = new THREE.Mesh(poleGeo, toon(site, 0x4a3220));
      pole.position.set(x, 6.6, Z(z));
      const flag = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: side < 0 ? 0x5a8cff : 0xff5a4a, side: THREE.DoubleSide }));
      flag.position.set(x + 0.55, 7.1, Z(z));
      site.disposables.push(flag.material as THREE.Material);
      scene.add(tower, roof, pole, flag);
    }
  }

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(500, span + 200), new THREE.MeshToonMaterial({ color: CASTLE_LOOK.sea, gradientMap: site.ramp }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -9, mid);
  scene.add(sea);
  site.disposables.push(sea.geometry, sea.material as THREE.Material);
}

/** The castle gate behind the boss: two round towers, a wall between them and a dark arch the legion marches out of. */
export function addGate(site: Site) {
  const z = site.length + 14;
  const stone = toon(site, CASTLE_LOOK.stone);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(SIEGE_HALF_WIDTH * 2 + 6, 7, 3), stone);
  wall.position.set(0, 3.5, Z(z));
  const arch = new THREE.Mesh(new THREE.BoxGeometry(SIEGE_CARPET_HALF * 2 + 0.6, 5, 3.2), new THREE.MeshBasicMaterial({ color: 0x120e14 }));
  arch.position.set(0, 2.5, Z(z) + 0.1);
  const lintel = new THREE.Mesh(new THREE.CylinderGeometry(SIEGE_CARPET_HALF + 0.3, SIEGE_CARPET_HALF + 0.3, 3.2, 14, 1, false, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x120e14 }));
  lintel.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  lintel.position.set(0, 5, Z(z) + 0.1);
  site.scene.add(wall, arch, lintel);
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 11, 12), stone);
    tower.position.set(side * (SIEGE_HALF_WIDTH + 2.2), 5.5, Z(z));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 4, 12), toon(site, 0xc8281e));
    roof.position.set(side * (SIEGE_HALF_WIDTH + 2.2), 13, Z(z));
    site.scene.add(tower, roof);
    site.disposables.push(tower.geometry, roof.geometry);
  }
  site.disposables.push(wall.geometry, arch.geometry, arch.material as THREE.Material, lintel.geometry, lintel.material as THREE.Material);
}

/** What a banner is drawn from: the frame, the plate and the number, tilted to face the camera. */
export interface BannerView {
  group: THREE.Group;
  texture: THREE.CanvasTexture;
  ctx: CanvasRenderingContext2D;
  /** the number drawn on it now, to redraw only when it changes */
  shown: number;
  /** frees what it owns: banners come and go as the ground scrolls, so each one cleans up after itself */
  dispose(): void;
}

/** Colours of the two kinds of banner: the small blue ones and the big yellow ones. */
const BANNER_COLOR = { blue: { plate: "#2f6fe0", edge: "#17348a" }, gold: { plate: "#ffc928", edge: "#a86a08" } };

/** Draw a banner's number: fat white digits with a dark outline for blue, dark digits for gold. */
function paintBanner(view: BannerView, value: number, gold: boolean) {
  const { ctx, texture } = view;
  const c = BANNER_COLOR[gold ? "gold" : "blue"];
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = c.plate;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, 0, w, h * 0.14);
  ctx.strokeStyle = c.edge;
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.font = `900 ${h * 0.78}px "Arial Black", Impact, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = h * 0.16;
  ctx.strokeStyle = gold ? "#5a3304" : "#0b1a52";
  ctx.strokeText(`+${value}`, w / 2, h * 0.54);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`+${value}`, w / 2, h * 0.54);
  texture.needsUpdate = true;
  view.shown = value;
}

/** A banner standing in a lane: a wooden frame on two posts, with the plate tilted back to face the camera. */
export function buildBanner(site: Site, value: number, gold: boolean): BannerView {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 112;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const owned: { dispose(): void }[] = [];
  const view: BannerView = { group: new THREE.Group(), texture, ctx: canvas.getContext("2d")!, shown: -1, dispose: () => owned.forEach((o) => o.dispose()) };
  const wood = toon(site, 0x8a5a2c);
  const tilt = new THREE.Group();
  const width = SIEGE_BANNER_WIDTH - 0.3;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.25, width * 0.44 + 0.25, 0.16), wood);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.44), new THREE.MeshBasicMaterial({ map: texture }));
  plate.position.z = 0.09;
  tilt.add(frame, plate);
  tilt.rotation.x = -0.85;
  tilt.position.y = 0.62;
  const postGeo = new THREE.BoxGeometry(0.14, 0.7, 0.14);
  for (const x of [-width / 2, width / 2]) {
    const post = new THREE.Mesh(postGeo, wood);
    post.position.set(x, 0.3, -0.18);
    view.group.add(post);
  }
  view.group.add(tilt);
  owned.push(frame.geometry, plate.geometry, plate.material as THREE.Material, postGeo, texture);
  paintBanner(view, value, gold);
  return view;
}

/** Redraw a banner when its number has changed. */
export function setBanner(view: BannerView, value: number, gold: boolean) {
  if (view.shown !== value) paintBanner(view, value, gold);
}

/** What a wall is drawn from: the stone block across the lane, the cracks that spread over it, the side wall and the rubble it leaves. */
export interface WallView {
  group: THREE.Group;
  /** the block and its cracks: gone once the wall is down */
  block: THREE.Group;
  cracks: THREE.MeshBasicMaterial;
  rubble: THREE.Group;
  number: TextSprite;
  /** the number of the wall's hit points shown now (in `SIEGE_HP_UNIT`s) */
  shown: number;
  broken: boolean;
}

/** Cracks over grey stone: a few dark zig-zag lines from the middle out, drawn on a clear canvas. */
function crackTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const rng = { rng: 31337 };
  g.strokeStyle = "#22252e";
  g.lineCap = "round";
  g.lineJoin = "round";
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + nextRandom(rng) * 0.5;
    let x = 128 + (nextRandom(rng) - 0.5) * 40;
    let y = 120 + (nextRandom(rng) - 0.5) * 40;
    g.lineWidth = 5 - nextRandom(rng) * 2;
    g.beginPath();
    g.moveTo(x, y);
    for (let step = 0; step < 6; step++) {
      x += Math.cos(angle + (nextRandom(rng) - 0.5) * 1.2) * 26;
      y += Math.sin(angle + (nextRandom(rng) - 0.5) * 1.2) * 26;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A wall of stone across a banner lane, with a side wall along the lane behind it and its hit points written at its foot.
 * It is built around its own front face (z = 0): the scene moves the group to where the wall is as the ground scrolls.
 */
export function buildWall(site: Site, wall: SiegeWall): WallView {
  const group = new THREE.Group();
  const block = new THREE.Group();
  const stone = toon(site, 0xc9ccd6);
  const cap = toon(site, 0x9094a0);
  const width = wall.width - 0.1;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, 4.4, SIEGE_WALL_DEPTH), stone);
  body.position.set(wall.x, 2.2, Z(0 + SIEGE_WALL_DEPTH / 2));
  const top = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.4, SIEGE_WALL_DEPTH + 0.3), cap);
  top.position.set(wall.x, 4.6, Z(0 + SIEGE_WALL_DEPTH / 2));
  const foot = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.7, SIEGE_WALL_DEPTH + 0.3), cap);
  foot.position.set(wall.x, 0.35, Z(0 + SIEGE_WALL_DEPTH / 2));
  const cracksTex = crackTexture();
  const cracks = new THREE.MeshBasicMaterial({ map: cracksTex, transparent: true, opacity: 0, depthWrite: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, 3.6), cracks);
  face.position.set(wall.x, 2.5, Z(0) + 0.02);
  block.add(body, top, foot, face);
  group.add(block);
  site.disposables.push(body.geometry, top.geometry, foot.geometry, face.geometry, cracks, cracksTex);

  // the side wall that closes the lane on the carpet's side, all the way back
  const back = Math.max(0, wall.depth - SIEGE_WALL_DEPTH);
  if (back > 0) {
    // low, so the banners behind it still read from the camera
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, back), stone);
    side.position.set(wall.x - wall.width / 2 + 0.05, 0.55, Z(0 + SIEGE_WALL_DEPTH + back / 2));
    const sideTop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, back), cap);
    sideTop.position.set(wall.x - wall.width / 2 + 0.05, 1.15, Z(0 + SIEGE_WALL_DEPTH + back / 2));
    group.add(side, sideTop);
    site.disposables.push(side.geometry, sideTop.geometry);
  }

  // rubble: shown when the block comes down
  const rubble = new THREE.Group();
  const rng = { rng: 2024 + wall.id };
  const chunk = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 16; i++) {
    const piece = new THREE.Mesh(chunk, i % 3 ? stone : cap);
    const size = 0.25 + nextRandom(rng) * 0.5;
    piece.scale.set(size, size * 0.8, size);
    piece.position.set(wall.x + (nextRandom(rng) - 0.5) * width, size * 0.35, Z(0 + nextRandom(rng) * (SIEGE_WALL_DEPTH + 1.5)));
    piece.rotation.set(nextRandom(rng), nextRandom(rng), nextRandom(rng));
    rubble.add(piece);
  }
  rubble.visible = false;
  group.add(rubble);
  site.disposables.push(chunk);

  const number = new TextSprite(3, 1.5);
  number.sprite.position.set(wall.x, 1.15, Z(0) + 1.4);
  number.sprite.renderOrder = 10;
  group.add(number.sprite);
  site.disposables.push(number);
  site.scene.add(group);
  const view: WallView = { group, block, cracks, rubble, number, shown: -1, broken: false };
  setWall(view, wall);
  return view;
}

/** Update a wall to its hit points: the number, the cracks, and the rubble once it is down. */
export function setWall(view: WallView, wall: SiegeWall) {
  const left = Math.max(0, Math.ceil(wall.hp / SIEGE_HP_UNIT));
  if (left !== view.shown) {
    view.shown = left;
    view.number.set(String(left), "#ffffff", "#15171d");
  }
  view.cracks.opacity = Math.min(1, Math.max(0, (1 - wall.hp / wall.maxHp) * 1.6));
  const down = wall.hp <= 0;
  if (down !== view.broken) {
    view.broken = down;
    view.block.visible = !down;
    view.rubble.visible = down;
    view.number.sprite.visible = !down;
  }
}
