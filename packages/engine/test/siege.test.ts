import { describe, expect, test } from "bun:test";
import {
  IDLE,
  LEGION_PER_ROW,
  LEGION_ROW_SPACING,
  LEGION_SPEED,
  LEGION_WAKE,
  SIEGE_BANNER_X,
  SIEGE_CONTACT,
  SIEGE_SCROLL_SPEED,
  SIEGE_HALF_WIDTH,
  SIEGE_SAFE,
  SIEGE_SKILLED,
  SIEGE_HP_UNIT,
  SIEGE_WALL_STOP,
  CHAMPION_KILL_RATE,
  createSiege,
  legionDepth,
  siegeBotInput,
  siegeColumnXs,
  siegeHalfWidth,
  siegeLevel,
  stepSiege,
  wallSiegeLevel,
  type Input,
  type SiegeLevel,
  type SiegeState,
} from "../src";

/** A small siege to test one rule at a time: no banners, a legion far away, a boss with some hit points. */
const small = (patch: Partial<SiegeLevel> = {}): SiegeLevel => ({ startSquad: 10, startWeapon: "rifle", banners: [], legion: { z: 300, count: 600 }, bossHp: 500, theme: "castle", ...patch });

const run = (s: SiegeState, ticks: number, input: Input = IDLE) => {
  for (let i = 0; i < ticks && s.status === "playing"; i++) stepSiege(s, input);
};

/** Play to the end with a bot (or a safety cap) and return the final state. */
function play(level: SiegeLevel, player: (s: SiegeState) => Input, seed = 1): SiegeState {
  const s = createSiege(level, seed);
  for (let i = 0; i < 30 * 400 && s.status === "playing"; i++) stepSiege(s, player(s));
  return s;
}

describe("siege: the bridge", () => {
  test("the state is plain JSON", () => {
    const s = createSiege(siegeLevel(), 7);
    run(s, 200, { move: 1, target: null });
    expect(structuredClone(s)).toEqual(JSON.parse(JSON.stringify(s)));
  });

  test("the squad stays on the bridge, wide or not", () => {
    for (const count of [1, 40, 900]) {
      const s = createSiege(small({ startSquad: count }), 1);
      run(s, 120, { move: 0, target: 99 });
      expect(s.squad.x + siegeHalfWidth(count)).toBeLessThanOrEqual(SIEGE_HALF_WIDTH + 1e-9);
      run(s, 120, { move: 0, target: -99 });
      expect(s.squad.x - siegeHalfWidth(count)).toBeGreaterThanOrEqual(-SIEGE_HALF_WIDTH - 1e-9);
    }
  });

  test("a squad of any size fits a banner lane: that is how it chooses one", () => {
    for (const count of [1, 40, 999]) {
      const columns = siegeColumnXs(SIEGE_BANNER_X, count);
      expect(Math.min(...columns)).toBeGreaterThan(2.4);
      expect(Math.max(...columns)).toBeLessThan(SIEGE_HALF_WIDTH + 0.5);
    }
  });
});

describe("siege: banners", () => {
  test("running through a banner adds its number; the other lane gives nothing", () => {
    const level = small({ banners: [{ x: -SIEGE_BANNER_X, z: 10, value: 5 }, { x: SIEGE_BANNER_X, z: 12, value: 99 }], legion: { z: 400, count: 10 } });
    const s = createSiege(level, 1);
    run(s, 30 * 6, { move: 0, target: -SIEGE_BANNER_X });
    // the 5 of the lane it ran through, plus what its own fire added on the way; nothing of the 99
    expect(s.squad.count).toBeGreaterThanOrEqual(15);
    expect(s.squad.count).toBeLessThan(25);
    expect(s.banners.every((b) => b.used)).toBe(true);
  });

  test("shooting a banner in the squad's lane raises it", () => {
    const level = small({ startSquad: 40, banners: [{ x: -SIEGE_BANNER_X, z: 30, value: 1 }], legion: { z: 400, count: 10 } });
    const s = createSiege(level, 1);
    run(s, 30, { move: 0, target: -SIEGE_BANNER_X });
    expect(s.banners[0].value).toBeGreaterThan(1);
  });

  test("a banner stops rising at its own maximum", () => {
    const level = small({ startSquad: 400, banners: [{ x: -SIEGE_BANNER_X, z: 30, value: 1, max: 3 }], legion: { z: 400, count: 10 } });
    const s = createSiege(level, 1);
    run(s, 30 * 3, { move: 0, target: -SIEGE_BANNER_X });
    expect(s.banners[0].value).toBe(3);
  });

  test("a squad on the carpet does not shoot the banners", () => {
    const level = small({ startSquad: 40, banners: [{ x: -SIEGE_BANNER_X, z: 30, value: 1 }, { x: SIEGE_BANNER_X, z: 30, value: 1 }], legion: { z: 400, count: 10 } });
    const s = createSiege(level, 1);
    run(s, 30 * 2);
    expect(s.banners.map((b) => b.value)).toEqual([1, 1]);
  });
});

describe("siege: the legion", () => {
  test("it sleeps until the squad is close, then marches", () => {
    const s = createSiege(small({ legion: { z: 400, count: 100 } }), 1);
    run(s, 30);
    expect(s.legion.awake).toBe(false);
    expect(s.legion.z).toBe(400);
    while (s.status === "playing" && !s.legion.awake) stepSiege(s, IDLE);
    expect(s.legion.z - s.distance).toBeLessThanOrEqual(LEGION_WAKE);
    const at = s.legion.z;
    run(s, 10);
    expect(s.legion.z).toBeLessThan(at);
  });

  test("the squad never advances: the ground scrolls under it, and a legion in contact is carried along pinned to it", () => {
    const s = createSiege(small({ startSquad: 3, legion: { z: 60, count: 5000, wake: 200 } }), 1);
    run(s, 30 * 4);
    expect(s.distance).toBeCloseTo(SIEGE_SCROLL_SPEED * 4, 1);
    while (s.status === "playing" && s.legion.z - s.distance > SIEGE_CONTACT + 0.01) stepSiege(s, IDLE);
    const at = s.distance;
    run(s, 15);
    // the ground kept scrolling and the front stayed on the squad
    expect(s.distance).toBeGreaterThan(at);
    expect(s.legion.z - s.distance).toBeCloseTo(SIEGE_CONTACT, 3);
  });

  test("shooting from the carpet eats the legion, and the front keeps marching whatever falls", () => {
    const s = createSiege(small({ startSquad: 60, legion: { z: 60, count: 600 } }), 1);
    const front = s.legion.z;
    run(s, 30 * 5);
    expect(s.legion.count).toBeLessThan(600);
    // the rows behind close up: the front is where the march took it, not pushed back by the dead
    expect(s.legion.z).toBeCloseTo(front - LEGION_SPEED * 5, 0);
    expect(legionDepth(s.legion.count)).toBeLessThan(legionDepth(600));
  });

  test("columns in a lane do not hit the legion", () => {
    const s = createSiege(small({ startSquad: 10, legion: { z: 60, count: 600 } }), 1);
    run(s, 30 * 3, { move: 0, target: -SIEGE_BANNER_X });
    expect(s.legion.count).toBe(600);
  });

  test("the legion in contact cuts down an idle squad", () => {
    const s = createSiege(small({ startSquad: 5, legion: { z: 60, count: 5000 } }), 1);
    run(s, 30 * 120);
    expect(s.status).toBe("lost");
    expect(s.losses).toBe(5);
  });

  test("the boss takes no damage until the legion is gone, then fights alone", () => {
    const s = createSiege(small({ startSquad: 200, legion: { z: 60, count: 100 }, bossHp: 800 }), 1);
    run(s, 30 * 4);
    expect(s.legion.count).toBeLessThan(100);
    expect(s.boss.hp).toBe(800);
    run(s, 30 * 60);
    expect(s.legion.count).toBe(0);
    expect(s.status).toBe("won");
    expect(s.boss.hp).toBe(0);
  });

  test("the boss stands behind the last row while the legion lives", () => {
    const s = createSiege(small({ legion: { z: 100, count: 240 } }), 1);
    expect(s.boss.z).toBeCloseTo(100 + ((240 / LEGION_PER_ROW) - 1) * LEGION_ROW_SPACING + 4, 5);
  });
});

describe("siege: the test level", () => {
  test("the bot that takes the big banners wins", () => {
    const s = play(siegeLevel(), (st) => siegeBotInput(st, SIEGE_SKILLED));
    expect(s.status).toBe("won");
  });

  test("the bot that stays in the safe lane is overrun", () => {
    const s = play(siegeLevel(), (st) => siegeBotInput(st, SIEGE_SAFE));
    expect(s.status).toBe("lost");
  });

  test("a squad that does nothing loses", () => {
    expect(play(siegeLevel(), () => IDLE).status).toBe("lost");
  });

  test("the big banners are worth the trip: the greedy squad gets bigger than the safe one", () => {
    const peak = (skill: typeof SIEGE_SKILLED) => {
      const s = createSiege(siegeLevel(), 1);
      let most = s.squad.count;
      for (let i = 0; i < 30 * 40 && s.status === "playing"; i++) {
        stepSiege(s, siegeBotInput(s, skill));
        most = Math.max(most, s.squad.count);
      }
      return most;
    };
    expect(peak(SIEGE_SKILLED)).toBeGreaterThan(peak(SIEGE_SAFE) * 1.3);
  });
});

describe("siege: walls", () => {
  const withWall = (patch: Partial<SiegeLevel> = {}) =>
    small({ startSquad: 40, banners: [{ x: SIEGE_BANNER_X, z: 60, value: 99 }], walls: [{ x: SIEGE_BANNER_X, z: 40, hp: 100 }], legion: { z: 400, count: 10 }, ...patch });

  test("a wall across the squad's lane stops it short, and the banner behind it stays out of reach", () => {
    const s = createSiege(withWall(), 1);
    // far from its own fire: a lone knight needs minutes to break 1000 hit points
    s.squad.count = 1;
    run(s, 30 * 20, { move: 0, target: SIEGE_BANNER_X });
    expect(s.distance).toBeCloseTo(40 - SIEGE_WALL_STOP, 1);
    expect(s.banners[0].used).toBe(false);
  });

  test("the other lane runs past it", () => {
    const s = createSiege(withWall(), 1);
    run(s, 30 * 24, { move: 0, target: -SIEGE_BANNER_X });
    expect(s.distance).toBeGreaterThan(60);
  });

  test("the fire of the columns breaks it, the number shown is in units, and then the squad runs on and takes the banner", () => {
    const s = createSiege(withWall(), 1);
    expect(s.walls[0].hp).toBe(100 * SIEGE_HP_UNIT);
    run(s, 30 * 14, { move: 0, target: SIEGE_BANNER_X });
    expect(s.walls[0].hp).toBeLessThanOrEqual(0);
    run(s, 30 * 10, { move: 0, target: SIEGE_BANNER_X });
    expect(s.squad.count).toBeGreaterThanOrEqual(40 + 99);
  });

  test("a squad on the carpet does not shoot the wall", () => {
    const s = createSiege(withWall(), 1);
    run(s, 30 * 4);
    expect(s.walls[0].hp).toBe(100 * SIEGE_HP_UNIT);
  });
});

describe("siege: champions", () => {
  const champion = (patch: Partial<SiegeLevel> = {}) => small({ startSquad: 30, legion: { z: 60, count: 200, wake: 200 }, champions: [{ after: 1, hp: 40 }], ...patch });

  test("one comes out of the legion once it is awake, and walks at the squad", () => {
    const s = createSiege(champion(), 1);
    run(s, 10);
    expect(s.champions).toHaveLength(0);
    run(s, 40);
    expect(s.champions).toHaveLength(1);
    const z = s.champions[0].z;
    run(s, 10);
    expect(s.champions[0].z).toBeLessThan(z);
  });

  test("the squad shoots it before the legion behind it, and the fight is not won while it stands", () => {
    const s = createSiege(champion({ startSquad: 5 }), 1);
    run(s, 30 * 6);
    // 5 soldiers cannot out-shoot 400 hit points quickly: the legion has not lost a soldier to them
    expect(s.legion.count).toBeGreaterThan(190);
    const big = createSiege(champion({ startSquad: 200, legion: { z: 60, count: 10, wake: 200 } }), 1);
    run(big, 30 * 30);
    expect(big.status).toBe("won");
    expect(big.champions).toHaveLength(0);
  });

  test("in contact it cuts the squad down", () => {
    const s = createSiege(champion({ startSquad: 3, champions: [{ after: 0, hp: 5000 }], legion: { z: 60, count: 5000, wake: 200 } }), 1);
    run(s, 30 * 40);
    expect(s.losses).toBeGreaterThan(0);
    expect(CHAMPION_KILL_RATE).toBeGreaterThan(1);
  });
});

describe("siege: the wall level", () => {
  test("the bot that breaks the wall in time wins", () => {
    expect(play(wallSiegeLevel(), (st) => siegeBotInput(st, SIEGE_SKILLED)).status).toBe("won");
  });

  test("the bot that ignores the wall and the big banners is overrun", () => {
    expect(play(wallSiegeLevel(), (st) => siegeBotInput(st, SIEGE_SAFE)).status).toBe("lost");
  });

  test("a squad that does nothing loses", () => {
    expect(play(wallSiegeLevel(), () => IDLE).status).toBe("lost");
  });

  test("the wall is what keeps the big banners away: a bot that never shoots it stays smaller", () => {
    const peak = (skill: typeof SIEGE_SKILLED) => {
      const s = createSiege(wallSiegeLevel(), 1);
      let most = s.squad.count;
      for (let i = 0; i < 30 * 45 && s.status === "playing"; i++) {
        stepSiege(s, siegeBotInput(s, skill));
        most = Math.max(most, s.squad.count);
      }
      return most;
    };
    expect(peak(SIEGE_SKILLED)).toBeGreaterThan(peak({ greedy: true, walls: false }) * 1.15);
  });
});
