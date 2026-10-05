import { describe, expect, test } from "bun:test";
import {
  ARMOR_PER_LEVEL,
  NO_UPGRADES,
  TICK_RATE,
  UPGRADE_KINDS,
  UPGRADE_MAX_LEVEL,
  buyUpgrade,
  createGame,
  expectedUpgrades,
  REPLAY_SHARES,
  STAR_COINS,
  levelReward,
  lossMultiplier,
  runPayout,
  upgradeCost,
} from "../src";
import { emptyLevel, run } from "./helpers";

describe("upgrades", () => {
  test("a soldier upgrade adds soldiers at the start of every run", () => {
    const s = createGame(emptyLevel({ startSquad: 5 }), 1, { ...NO_UPGRADES, squad: 3 });
    expect(s.squad.count).toBe(5 + 3 * 2);
  });

  test("a damage upgrade makes soldiers and vehicles hit harder", () => {
    const level = emptyLevel({ startSquad: 6, barrels: [{ x: 0, z: 45, hp: 99999, reward: { kind: "coins", count: 1 } }] });
    const plain = createGame(level, 1);
    const boosted = createGame(level, 1, { ...NO_UPGRADES, damage: 5 });
    for (const s of [plain, boosted]) s.squad.vehicles.push("moto");
    run(plain, TICK_RATE * 4);
    run(boosted, TICK_RATE * 4);
    const dealt = (s: typeof plain) => 99999 - s.barrels[0].hp;
    expect(dealt(boosted) / dealt(plain)).toBeCloseTo(1.6, 1);
  });

  test("armour spares soldiers from enemy hits, bombs and traps, but not from gates", () => {
    const hit = (armor: number, gate: boolean) => {
      const level = gate
        ? emptyLevel({ startSquad: 40, gates: [{ x: 0, z: 10, width: 8, op: "add", value: -10 }] })
        : emptyLevel({ startSquad: 40, traps: [{ kind: "spikes", x: 0, z: 10 }] });
      const s = createGame(level, 1, { ...NO_UPGRADES, armor });
      run(s, TICK_RATE * 3);
      return 40 - s.squad.count;
    };
    expect(hit(0, false)).toBeGreaterThan(hit(6, false));
    expect(hit(6, true)).toBe(hit(0, true));
  });

  test("armour is a share of every hit: ten levels would spare half", () => {
    expect(lossMultiplier({ ...NO_UPGRADES, armor: 4 })).toBeCloseTo(1 - 4 * ARMOR_PER_LEVEL, 5);
    expect(createGame(emptyLevel(), 1, { ...NO_UPGRADES, armor: 4 }).lossMul).toBeCloseTo(0.8, 5);
    expect(lossMultiplier({ ...NO_UPGRADES, armor: UPGRADE_MAX_LEVEL })).toBeCloseTo(0.5, 5);
  });

  test("no upgrades is the plain game", () => {
    expect(createGame(emptyLevel(), 1, NO_UPGRADES)).toEqual(createGame(emptyLevel(), 1));
  });

  test("each level costs more than the one before", () => {
    for (const kind of UPGRADE_KINDS) for (let l = 1; l < UPGRADE_MAX_LEVEL; l++) expect(upgradeCost(kind, l)).toBeGreaterThan(upgradeCost(kind, l - 1));
  });

  test("buying takes the coins and adds a level; it refuses when short or at the top", () => {
    const bought = buyUpgrade(NO_UPGRADES, 200, "damage");
    expect(bought).toEqual({ upgrades: { ...NO_UPGRADES, damage: 1 }, wallet: 200 - upgradeCost("damage", 0) });
    expect(buyUpgrade(NO_UPGRADES, upgradeCost("damage", 0) - 1, "damage")).toBeNull();
    expect(buyUpgrade({ ...NO_UPGRADES, squad: UPGRADE_MAX_LEVEL }, 1e9, "squad")).toBeNull();
  });

  test("a first win pays the level's reward, its stars and what was picked up, all raised by the coin upgrade", () => {
    expect(runPayout(20, 3, NO_UPGRADES, 1)).toBe(20 + levelReward(1) + 3 * STAR_COINS);
    expect(runPayout(20, 3, { ...NO_UPGRADES, coins: 5 }, 1)).toBe(Math.round((20 + levelReward(1) + 3 * STAR_COINS) * 1.5));
    expect(levelReward(10)).toBeGreaterThan(levelReward(1));
  });

  test("a lost run pays nothing, however far it got", () => {
    expect(runPayout(30, 0, NO_UPGRADES, 20)).toBe(0);
  });

  test("winning a level again pays less every time, then nothing, but a better score always pays its new stars", () => {
    const reward = 20 + levelReward(5);
    expect(runPayout(20, 2, NO_UPGRADES, 5, 1, 2)).toBe(Math.round(reward * REPLAY_SHARES[1]));
    expect(runPayout(20, 2, NO_UPGRADES, 5, 2, 2)).toBe(Math.round(reward * REPLAY_SHARES[2]));
    expect(runPayout(20, 2, NO_UPGRADES, 5, 3, 2)).toBe(0);
    expect(runPayout(20, 3, NO_UPGRADES, 5, 3, 1)).toBe(2 * STAR_COINS);
    expect(REPLAY_SHARES[1]).toBeLessThan(REPLAY_SHARES[0]);
  });
});

describe("the economy the campaign is tuned for", () => {
  test("a player who has just cleared the first two levels can afford one upgrade, not a pile of them", () => {
    const total = (u: ReturnType<typeof expectedUpgrades>) => u.damage + u.squad + u.armor;
    expect(total(expectedUpgrades(1))).toBe(0);
    expect(total(expectedUpgrades(2))).toBeLessThanOrEqual(1);
    expect(total(expectedUpgrades(3))).toBeLessThanOrEqual(2);
  });

  test("the shop keeps paying off: the expected upgrades only grow, and the coin upgrade is left out", () => {
    for (let n = 2; n <= 50; n++) {
      const before = expectedUpgrades(n - 1);
      const now = expectedUpgrades(n);
      for (const kind of UPGRADE_KINDS) expect(now[kind]).toBeGreaterThanOrEqual(before[kind]);
      expect(now.coins).toBe(0);
    }
    expect(expectedUpgrades(50).damage).toBeGreaterThanOrEqual(6);
  });
});
