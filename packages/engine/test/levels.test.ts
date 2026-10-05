import { describe, expect, test } from "bun:test";
import {
  AVERAGE_BOT,
  IDLE,
  LANE_HALF_WIDTH,
  LEVELS_PER_WORLD,
  LEVEL_MODES,
  LEVEL_TWISTS,
  NO_UPGRADES,
  SPAWN_AHEAD,
  botInput,
  SHOP_FROM_LEVEL,
  calibratePressure,
  campaignLevel,
  campaignSpec,
  expectedUpgrades,
  generateLevel,
  type EnemyKind,
  type LevelDef,
  type LevelMode,
} from "../src";
import { PRESSURES } from "../src/pressures";
import { play } from "./helpers";

const campaign = Array.from({ length: LEVELS_PER_WORLD * 3 }, (_, i) => i + 1);
const first30 = campaign;
const wide = Array.from({ length: LEVELS_PER_WORLD * 5 }, (_, i) => i + 1);
const levelOf = (n: number) => campaignLevel(n);

/** Gate pairs as [left, right] values, per spot on the road. */
const pairs = (level: LevelDef) => {
  const byZ = new Map<number, LevelDef["gates"]>();
  for (const g of level.gates) byZ.set(g.z, [...(byZ.get(g.z) ?? []), g]);
  return [...byZ.values()];
};

describe("generateLevel", () => {
  test("the same spec builds the same level", () => {
    expect(levelOf(7)).toEqual(levelOf(7));
    expect(levelOf(7)).not.toEqual(levelOf(8));
  });

  test("everything sits on the road, in order, before the finish", () => {
    for (const n of campaign) {
      const level = levelOf(n);
      for (const g of level.gates) {
        expect(g.x - g.width / 2).toBeGreaterThanOrEqual(-LANE_HALF_WIDTH);
        expect(g.x + g.width / 2).toBeLessThanOrEqual(LANE_HALF_WIDTH);
        expect(g.z).toBeLessThan(level.length);
      }
      for (const b of level.barrels) expect(Math.abs(b.x)).toBeLessThanOrEqual(LANE_HALF_WIDTH);
      if (level.mode === "gates") expect(level.gates.length).toBeGreaterThan(0);
    }
  });

  test("every gate comes in a pair", () => {
    for (const n of campaign) for (const p of pairs(levelOf(n))) expect(p.length).toBe(2);
  });

  test("a boss level has its boss on the road, after everything else, with the finish line past it", () => {
    for (const n of [5, 10, 15, 20]) {
      const level = levelOf(n);
      expect(level.boss).not.toBeNull();
      const last = Math.max(...level.gates.map((g) => g.z), ...level.barrels.map((b) => b.z));
      expect(level.boss!.z).toBeGreaterThan(last);
      expect(level.length).toBeGreaterThan(level.boss!.z + 10);
    }
    expect(levelOf(2).boss).toBeNull();
  });
});

describe("pace", () => {
  test("a fight starts in the first seconds, and no pattern waits at the very start", () => {
    for (const n of campaign) {
      const level = levelOf(n);
      const opening = level.waves.filter((w) => w.at <= 5 && w.at + (w.ahead ?? SPAWN_AHEAD) <= 30);
      expect(opening.length).toBeGreaterThan(0);
      for (const g of level.gates) expect(g.z).toBeGreaterThanOrEqual(40);
    }
  });

  test("patterns are close together: a level is never a long empty road", () => {
    for (const n of campaign) {
      const level = levelOf(n);
      const spots = [...new Set([...level.gates.map((g) => g.z), ...level.barrels.map((b) => b.z)])].sort((a, b) => a - b);
      for (let i = 1; i < spots.length; i++) expect(spots[i] - spots[i - 1]).toBeLessThan(110);
    }
  });
});

/** How many separate gate pairs, barrel clusters and hordes a level has. */
const shape = (level: LevelDef) => ({
  gates: pairs(level).length,
  barrels: new Set(level.barrels.map((b) => b.z)).size,
  hordes: level.waves.length,
});

describe("level modes", () => {
  const byMode = (mode: LevelMode) => campaign.filter((n) => campaignSpec(n).mode === mode).map((n) => ({ n, level: levelOf(n) }));

  test("the campaign cycles through every mode in each world", () => {
    for (const mode of LEVEL_MODES) expect(byMode(mode).length).toBeGreaterThan(0);
    expect(campaignSpec(1).mode).toBe("gates");
    expect(campaignSpec(2).mode).toBe("loot");
    expect(campaignSpec(3).mode).toBe("mixed");
  });

  test("a gates level has no barrels and plenty of gates", () => {
    for (const { level } of byMode("gates")) {
      const s = shape(level);
      expect(s.barrels).toBe(0);
      expect(s.gates).toBeGreaterThanOrEqual(3);
    }
  });

  test("a loot level starts with a bigger squad and out-barrels gates", () => {
    for (const { level } of byMode("loot")) {
      const s = shape(level);
      expect(level.startSquad).toBeGreaterThan(2);
      expect(s.barrels).toBeGreaterThan(s.gates);
    }
  });

  test("a mixed level has gates, barrels and hordes all together", () => {
    const mixed = byMode("mixed").map((m) => shape(m.level));
    expect(mixed.filter((s) => s.gates > 0 && s.barrels > 0 && s.hordes > 0).length).toBeGreaterThan(mixed.length / 2);
  });

  test("loot levels are where vehicles come from", () => {
    const vehicles = (m: LevelMode) => byMode(m).reduce((sum, { level }) => sum + level.barrels.filter((b) => b.reward.kind === "vehicle").length, 0);
    expect(vehicles("loot")).toBeGreaterThan(0);
    expect(vehicles("gates")).toBe(0);
  });
});

describe("variety", () => {
  const kindsIn = (n: number) => new Set<EnemyKind>(levelOf(n).waves.map((w) => w.kind));
  const seenIn = (from: number, to: number) => {
    const all = new Set<EnemyKind>();
    for (let n = from; n <= to; n++) for (const k of kindsIn(n)) all.add(k);
    return all;
  };

  test("every twist is used, and neighbouring levels are not alike", () => {
    expect(new Set(campaign.map((n) => campaignSpec(n).twist))).toEqual(new Set(LEVEL_TWISTS));
    let alike = 0;
    for (let n = 1; n < 30; n++) if (campaignSpec(n).twist === campaignSpec(n + 1).twist && campaignSpec(n).mode === campaignSpec(n + 1).mode) alike++;
    expect(alike).toBe(0);
  });

  test("new enemies arrive with the worlds: nothing but runners and brutes in the first world", () => {
    for (const k of seenIn(1, 10)) expect(["runner", "brute"]).toContain(k);
    expect(seenIn(11, 20).has("sprinter") || seenIn(11, 20).has("shield")).toBe(true);
    expect(seenIn(21, 30).has("bomber")).toBe(true);
    expect(seenIn(31, 40).has("shooter")).toBe(true);
    for (const k of seenIn(1, 30)) expect(k).not.toBe("shooter");
  });

  test("levels differ from each other in what they send, not only in how many", () => {
    const signatures = new Set(wide.slice(10, 40).map((n) => [...kindsIn(n)].sort().join(",")));
    expect(signatures.size).toBeGreaterThanOrEqual(5);
  });

  test("gates are not always a good one next to a bad one: there are dilemmas", () => {
    const all = wide.flatMap((n) => pairs(levelOf(n)));
    const bothBad = all.filter(([a, b]) => a.op === "add" && b.op === "add" && a.value < 0 && b.value < 0);
    const bothGood = all.filter(([a, b]) => a.value > 0 && b.value > 0);
    // a big red gate beside a small blue one: worth shooting up if the weapon is good enough
    const pump = all.filter(([a, b]) => {
      const [bad, good] = a.value < b.value ? [a, b] : [b, a];
      return bad.op === "add" && bad.value <= -8 && good.value > 0 && good.value < -bad.value;
    });
    expect(bothBad.length).toBeGreaterThan(0);
    expect(bothGood.length).toBeGreaterThan(0);
    expect(pump.length).toBeGreaterThan(0);
  });

  test("the very first gates of the campaign are plain: one good, one bad", () => {
    const [a, b] = pairs(levelOf(1))[0];
    expect(Math.sign(a.value)).not.toBe(Math.sign(b.value));
  });
});

describe("length and punishment", () => {
  test("a level is a long stretch of road: well over twice what it once was", () => {
    for (const n of first30) expect(campaignLevel(n).length).toBeGreaterThanOrEqual(250);
    expect(Math.min(...first30.map((n) => campaignLevel(n).length))).toBeGreaterThan(260);
  });

  test("punishments you cannot argue with: dividing gates, locked gates and traps all show up", () => {
    const all = wide.map((n) => campaignLevel(n));
    expect(all.some((l) => l.gates.some((g) => g.op === "div"))).toBe(true);
    expect(all.some((l) => l.gates.some((g) => g.locked))).toBe(true);
    expect(all.some((l) => l.traps.some((t) => t.kind === "spikes"))).toBe(true);
    expect(all.some((l) => l.traps.some((t) => t.kind === "mine"))).toBe(true);
    // a dividing gate is always locked: shooting it up never helps
    for (const l of all) for (const g of l.gates) if (g.op === "div") expect(g.locked).toBe(true);
  });

  test("the learning levels have no traps, no air strikes and no dividing gates", () => {
    for (const n of [1, 2]) {
      const l = campaignLevel(n);
      expect(l.traps.length).toBe(0);
      expect(l.events.length).toBe(0);
      expect(l.gates.some((g) => g.op === "div")).toBe(false);
    }
  });

  test("the world starts attacking on its own from level 6: air strikes, more of them later", () => {
    expect(campaignLevel(5).events.length).toBe(0);
    expect(campaignLevel(6).events.length).toBeGreaterThanOrEqual(1);
    expect(campaignLevel(30).events.length).toBeGreaterThanOrEqual(2);
    for (const e of campaignLevel(6).events) expect(e.kind).toBe("airstrike");
  });
});

describe("balance, tied to the shop", () => {
  // a seed other than the ones the calibration played with, so this is not the test grading its own homework
  const seedOf = (n: number) => n * 104729 + 17;
  const withShop = (n: number) => play(campaignLevel(n), seedOf(n), (s) => botInput(s), expectedUpgrades(n));
  const withoutShop = (n: number) => play(campaignLevel(n), seedOf(n), (s) => botInput(s), NO_UPGRADES);
  const middling = (n: number) => play(campaignLevel(n), seedOf(n), (s) => botInput(s, AVERAGE_BOT), expectedUpgrades(n));
  const idle = (n: number) => play(campaignLevel(n), seedOf(n), () => IDLE, expectedUpgrades(n));
  const wins = (run: (n: number) => ReturnType<typeof withShop>, levels = first30) => levels.filter((n) => run(n).status === "won").length;
  const slow = 90_000;

  test("the first two levels need nothing from the shop", () => {
    expect(wins(withoutShop, [1, 2])).toBe(2);
  }, slow);

  test("from level 3 on, a good player who never visits the shop is stuck", () => {
    const later = first30.filter((n) => n >= SHOP_FROM_LEVEL);
    expect(wins(withoutShop, later)).toBeLessThanOrEqual(Math.floor(later.length * 0.15));
  }, slow);

  test("with what the shop would have given them, a good player beats most levels, and it costs them soldiers", () => {
    const won = first30.map((n) => withShop(n)).filter((s) => s.status === "won");
    expect(won.length).toBeGreaterThanOrEqual(21);
    expect(won.filter((s) => s.losses > 0).length / won.length).toBeGreaterThanOrEqual(0.8);
  }, slow);

  test("a middling player does worse than a good one, and one who never moves hardly wins", () => {
    const good = wins(withShop);
    const mid = wins(middling);
    expect(mid).toBeLessThan(good - 6);
    expect(mid).toBeGreaterThanOrEqual(3);
    expect(wins(idle)).toBeLessThanOrEqual(3);
  }, slow);

  test("the learning levels forgive a middling player", () => {
    expect(wins(middling, [2, 3])).toBe(2);
  }, slow);

  test("bosses are beatable with the shop, and not without it", () => {
    const bosses = [5, 10, 15, 20, 25, 30];
    expect(wins(withShop, bosses)).toBeGreaterThanOrEqual(4);
    expect(wins(withoutShop, bosses)).toBe(0);
  }, slow);

  test("the table of pressures is in step with the generator: calibrating again gives the same answers", () => {
    for (const n of [3, 12, 30]) expect(calibratePressure(n)).toBe(PRESSURES[n].pressure);
  }, slow);
});
