import { describe, expect, test } from "bun:test";
import {
  BOMBER_BLAST_SOLDIERS,
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
  const e: Enemy = { id: s.nextId++, kind, x, z: s.distance + gap, hp, maxHp: hp, cooldown: kind === "shooter" ? 38 : 0 };
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
