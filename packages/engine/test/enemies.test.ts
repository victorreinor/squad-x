import { describe, expect, test } from "bun:test";
import {
  BOMBER_BLAST_SOLDIERS,
  BOSS_SLAM_WARN,
  BOSS_STANDOFF,
  ENEMY_STATS,
  SHOOTER_RANGE,
  TICK_RATE,
  createGame,
  step,
  type Enemy,
  type EnemyKind,
  type GameState,
} from "../src";
import { emptyLevel, run } from "./helpers";

/** Put an enemy straight on the road, `gap` units ahead of the squad. */
function put(s: GameState, kind: EnemyKind, gap: number, x = 0, hp: number = ENEMY_STATS[kind].hp): Enemy {
  const e: Enemy = { id: s.nextId++, kind, x, z: s.distance + gap, hp, maxHp: hp, cooldown: kind === "shooter" ? 38 : 0, summon: 0 };
  s.enemies.push(e);
  return e;
}

describe("enemy kinds", () => {
  test("a sprinter covers the road much faster than a runner", () => {
    const s = createGame(emptyLevel({ startSquad: 1 }), 1);
    const runner = put(s, "runner", 200, 3);
    const sprinter = put(s, "sprinter", 200, -3);
    run(s, TICK_RATE);
    expect(200 - (runner.z - s.distance)).toBeLessThan(200 - (sprinter.z - s.distance));
    expect(runner.z).toBeGreaterThan(sprinter.z + 2);
  });

  test("a shield takes less from soldiers and the full hit from a tank", () => {
    const damage = (kind: EnemyKind, tank: boolean) => {
      const s = createGame(emptyLevel({ startSquad: 4 }), 1);
      if (tank) s.squad.vehicles.push("tank");
      const e = put(s, kind, 30, 0, 100000);
      run(s, TICK_RATE * 2);
      return 100000 - e.hp;
    };
    const brute = damage("brute", false);
    const shield = damage("shield", false);
    expect(shield / brute).toBeCloseTo(ENEMY_STATS.shield.armor, 1);
    // the tank's shells ignore the armor, so the same fight goes the same way against either
    const gain = (kind: EnemyKind) => damage(kind, true) - damage(kind, false);
    expect(gain("shield") / gain("brute")).toBeGreaterThan(0.9);
  });

  test("a bomber that reaches the squad kills BOMBER_BLAST_SOLDIERS of it", () => {
    const s = createGame(emptyLevel({ startSquad: 12 }), 1);
    put(s, "bomber", 0.5, 0);
    step(s, { move: 0, target: null });
    expect(s.losses).toBe(BOMBER_BLAST_SOLDIERS);
  });

  test("a bomber shot dead takes the enemies around it with it", () => {
    const s = createGame(emptyLevel({ startSquad: 30 }), 1);
    const bomber = put(s, "bomber", 20, 0, 1);
    const near = [put(s, "runner", 20.8, 0.6), put(s, "runner", 19.4, -0.7)];
    const far = put(s, "runner", 20, 3.6);
    for (let i = 0; i < 6 && s.enemies.includes(bomber); i++) step(s, { move: 0, target: null });
    expect(s.enemies.includes(bomber)).toBe(false);
    for (const r of near) expect(s.enemies.includes(r)).toBe(false);
    expect(s.enemies.includes(far)).toBe(true);
  });

  test("a shooter keeps its distance, fires at the squad and backs away as it closes in", () => {
    const s = createGame(emptyLevel({ startSquad: 40 }), 1);
    const shooter = put(s, "shooter", SHOOTER_RANGE - 0.5, 3.4, 1e9);
    run(s, TICK_RATE * 4);
    expect(s.losses).toBeGreaterThanOrEqual(2);
    // the squad ran at it for 4 seconds, and it never let the squad onto it
    expect(shooter.z - s.distance).toBeGreaterThan(1);
    expect(shooter.z - s.distance).toBeLessThanOrEqual(SHOOTER_RANGE + 0.1);
  });

  test("a shooter that is caught fights hand to hand", () => {
    const s = createGame(emptyLevel({ startSquad: 10 }), 1);
    put(s, "shooter", 0.4, 0, 1e9);
    step(s, { move: 0, target: null });
    expect(s.losses).toBe(1);
    expect(s.enemies.length).toBe(0);
  });

  test("a wave can show up close: an ambush gives no time to see it coming", () => {
    const s = createGame(emptyLevel({ startSquad: 5, waves: [{ at: 0, kind: "runner", count: 3, x: 0, spread: 2, ahead: 18 }] }), 1);
    step(s, { move: 0, target: null });
    for (const e of s.enemies) expect(e.z - s.distance).toBeLessThan(21);
  });
});

describe("the boss", () => {
  const bossGame = (patch: { startSquad?: number; hp?: number } = {}) =>
    createGame(emptyLevel({ length: 140, startSquad: patch.startSquad ?? 900, startWeapon: "pistol", boss: { z: 100, hp: patch.hp ?? 1e9 } }), 1);

  test("waits on the road from the start, where the player can see it", () => {
    const s = bossGame();
    const boss = s.enemies.find((e) => e.kind === "boss")!;
    expect(boss.z).toBeCloseTo(100, 0);
  });

  test("blocks the way: the squad halts in front of it until it is dead", () => {
    const s = bossGame();
    run(s, TICK_RATE * 25);
    expect(s.status).toBe("playing");
    expect(s.distance).toBeCloseTo(100 - BOSS_STANDOFF, 0);
  });

  test("dying lets the squad run on to the finish line, and only then does the level end", () => {
    const s = bossGame({ hp: 800 });
    run(s, TICK_RATE * 40);
    expect(s.enemies.some((e) => e.kind === "boss")).toBe(false);
    expect(s.status).toBe("won");
    expect(s.distance).toBe(140);
  });

  test("marks a strip of road before it smashes it, so there is time to step out", () => {
    const s = bossGame({ startSquad: 3 });
    let warned: { x: number; ticks: number } | null = null;
    for (let i = 0; i < TICK_RATE * 25 && !warned; i++) {
      step(s, { move: 0, target: null });
      if (s.hazards[0]) warned = { x: s.hazards[0].x, ticks: s.hazards[0].ticks };
    }
    expect(warned).not.toBeNull();
    expect(warned!.ticks).toBeGreaterThan(BOSS_SLAM_WARN / 2);
  });

  test("a squad that stays in the strip loses soldiers; one that steps out loses none", () => {
    const slam = (dodge: boolean) => {
      const s = bossGame({ startSquad: 3 });
      for (let i = 0; i < TICK_RATE * 20 && !s.lastSlam; i++) {
        const h = s.hazards[0];
        const target = dodge && h ? (h.x <= 0 ? 3.3 : -3.3) : null;
        step(s, { move: 0, target });
      }
      return s.lastSlam;
    };
    expect(slam(false)!.lost).toBeGreaterThan(0);
    expect(slam(true)!.lost).toBe(0);
  });

  test("calls minions now and then", () => {
    const s = bossGame();
    let seen = 0;
    for (let i = 0; i < TICK_RATE * 30; i++) {
      step(s, { move: 0, target: null });
      seen = Math.max(seen, s.enemies.filter((e) => e.kind === "runner").length);
    }
    expect(seen).toBeGreaterThan(0);
  });
});
