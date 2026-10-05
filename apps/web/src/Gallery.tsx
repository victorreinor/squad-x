import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { EnemyKind, WeaponKind } from "@squadx/engine";
import { Crowd, partsToGroup, toonRamp } from "./game/crowd";
import { BOSS_FIGURES, BOSS_SCALE, ENEMY_LOOKS, soldierFigure, weaponParts } from "./game/figures";
import { TextSprite } from "./game/labels";
import { bombParts, mineParts, planeParts, spikesParts } from "./game/props";
import { buildVehicle } from "./game/vehicles";

const TABS = ["soldado", "inimigos", "chefoes", "armas", "veiculos", "perigos"] as const;
type Tab = (typeof TABS)[number];

const ENEMIES: Exclude<EnemyKind, "boss">[] = ["runner", "sprinter", "brute", "shield", "bomber", "shooter"];
const WEAPONS: WeaponKind[] = ["pistol", "rifle", "smg", "minigun"];

/** A page for looking at every character, weapon and vehicle up close: `?galeria=1`. Drag to turn them around. */
export function Gallery() {
  const host = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("soldado");
  const [walk, setWalk] = useState(true);
  const walkRef = useRef(walk);
  walkRef.current = walk;
  // the game looks down at the road from behind and above: "jogo" shows the figures from that same angle
  const [gameView, setGameView] = useState(false);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    // a deep navy stage, the colour of the game's menus, so the characters stand out in prints
    scene.background = new THREE.Color(0x16284a);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7a8a, 1.5));
    const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
    sun.position.set(-6, 14, 8);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshToonMaterial({ color: 0x16284a }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const ramp = toonRamp();

    const crowds: { crowd: Crowd; x: number; scale: number; facing: number }[] = [];
    const staged = new THREE.Group();
    scene.add(staged);
    let spread = 2.2;
    let stagedTall = 3;
    const holders: THREE.Group[] = [];
    const label = (text: string, x: number, y = -0.35) => {
      const sprite = new TextSprite(1.8, 0.45, 64);
      sprite.set(text, "#ffffff", "#1b2a41");
      sprite.sprite.position.set(x, y, 1);
      scene.add(sprite.sprite);
    };
    const figure = (spec: ConstructorParameters<typeof Crowd>[1], x: number, scale: number, facing: number, name: string) => {
      const crowd = new Crowd(1, spec, ramp);
      scene.add(crowd.group);
      crowds.push({ crowd, x, scale, facing });
      label(name, x);
    };

    if (tab === "soldado") {
      spread = 2.6;
      // the squad is seen from behind in the game; the front shows the face and the rifle
      WEAPONS.forEach((w, i) => figure(soldierFigure(w), -7.2 + i * 2.2, 1.5, 0, `${w} · costas`));
      WEAPONS.forEach((w, i) => figure(soldierFigure(w), 1.6 + i * 2.2, 1.5, Math.PI, `${w} · frente`));
    } else if (tab === "inimigos") {
      ENEMIES.forEach((k, i) => figure(ENEMY_LOOKS[k].figure, (i - 2.5) * 2.3, ENEMY_LOOKS[k].scale * 1.25, Math.PI, k));
      spread = 6;
    } else if (tab === "chefoes") {
      BOSS_FIGURES.forEach((b, i) => figure(b.figure(), (i - 2) * 4.2, BOSS_SCALE * 0.62, Math.PI, b.name));
      spread = 10;
    } else if (tab === "armas") {
      WEAPONS.forEach((w, i) => {
        const gun = partsToGroup(weaponParts(w), ramp);
        // the weapons are modelled in a soldier's hands: centre each on its own spot so it turns on the spot
        const k = 3;
        gun.scale.setScalar(k);
        gun.position.set(-0.04 * k, -0.9 * k, 0.45 * k);
        const holder = new THREE.Group();
        holder.add(gun);
        holder.position.set((i - 1.5) * 3, 1.2, 0);
        staged.add(holder);
        holders.push(holder);
        label(w, (i - 1.5) * 3, -0.4);
      });
      spread = 12;
      stagedTall = 3;
    } else if (tab === "perigos") {
      const props: [string, ReturnType<typeof spikesParts>, number, number][] = [
        ["espinhos", spikesParts(), 1.5, 1.4],
        ["mina", mineParts(), 2.4, 1],
        ["bombardeiro", planeParts(), 0.55, 3.6],
        ["bomba", bombParts(), 3.2, 0.4],
      ];
      props.forEach(([name, parts, scale, lift], i) => {
        const g = partsToGroup(parts, ramp);
        g.scale.setScalar(scale);
        g.position.set((i - 1.5) * 4.2, name === "bombardeiro" ? 0.6 : name === "bomba" ? 2.2 : 0, 0);
        g.rotation.y = name === "bombardeiro" ? Math.PI * 0.75 : name === "bomba" ? 0 : Math.PI * 0.8;
        if (name === "bomba") g.rotation.z = Math.PI;
        staged.add(g);
        holders.push(g);
        label(name, (i - 1.5) * 4.2, -0.4);
        void lift;
      });
      spread = 17;
      stagedTall = 4;
    } else {
      (["moto", "heli", "tank"] as const).forEach((k, i) => {
        const m = buildVehicle(k, ramp);
        m.group.scale.setScalar(1.6);
        m.group.position.set((i - 1) * 3.6, k === "heli" ? 1.6 : 0, 0);
        m.group.rotation.y = Math.PI * 0.8;
        staged.add(m.group);
        holders.push(m.group);
        label(k, (i - 1) * 3.6);
      });
      spread = 12;
      stagedTall = 4;
    }

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    let yaw = 0;
    let drag: number | null = null;
    const down = (e: PointerEvent) => (drag = e.clientX);
    const move = (e: PointerEvent) => {
      if (drag === null) return;
      yaw += (e.clientX - drag) * 0.01;
      drag = e.clientX;
    };
    const up = () => (drag = null);
    renderer.domElement.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      // far enough to fit the whole row across and the tallest figure up and down
      const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const row = crowds.length ? Math.max(...crowds.map((c) => Math.abs(c.x))) * 2 + 5 : spread;
      const tall = crowds.length ? Math.max(...crowds.map((c) => c.scale)) * 1.7 + 0.8 : stagedTall;
      const dist = Math.max(row / (2 * half * camera.aspect), tall / (2 * half));
      if (gameView) {
        const up = THREE.MathUtils.degToRad(41);
        camera.position.set(0, tall * 0.4 + Math.sin(up) * dist * 1.05, Math.cos(up) * dist * 1.05);
        camera.lookAt(0, tall * 0.35, 0);
      } else {
        camera.position.set(0, tall * 0.5 + dist * 0.08, dist);
        camera.lookAt(0, tall * 0.42, 0);
      }
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const frame = (now: number) => {
      const t = walkRef.current ? now / 1000 : 0;
      for (const c of crowds) {
        c.crowd.begin();
        c.crowd.add(c.x, 0, c.scale, c.facing + yaw, 0, t);
        c.crowd.end();
      }
      holders.forEach((h, i) => (h.rotation.y = (tab === "armas" ? Math.PI / 2 : Math.PI * 0.8) + yaw + (tab === "armas" ? 0 : i * 0)));
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      for (const c of crowds) c.crowd.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [tab, gameView]);

  return (
    <div className="gallery">
      <div className="gallery-bar">
        {TABS.map((t) => (
          <button key={t} className={`btn ${t === tab ? "primary" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <button className="btn" onClick={() => setWalk(!walk)}>
          {walk ? "parar" : "andar"}
        </button>
        <button className={`btn ${gameView ? "primary" : ""}`} onClick={() => setGameView(!gameView)}>
          ângulo do jogo
        </button>
      </div>
      <div className="gallery-view" ref={host} />
    </div>
  );
}
