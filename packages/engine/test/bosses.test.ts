import { describe, expect, test } from "bun:test";
import {
  BOSS_ACTIVE_RANGE,
  BOSS_FIGHT_SECONDS,
  BOSS_FINAL_FIGHT_SECONDS,
  BOSS_FURY_PACE,
  BOSS_PRESSURE_RANGE,
  BOSS_TOUGHNESS,
  BOSS_KINDS,
  BOSS_MINIONS,
  BOSS_STANDOFF,
  CHILL_SLOW,
  ICE_WARN,
  IDLE,
  KEG_LANES,
  MECH_GAP_TICKS,
  METEOR_SPOTS,
  SKILLED_BOT,
  STRAFE_SPEED,
  TICK_RATE,
  YETI_COMBO_GAP,
  BOSS_ATTACK_INTERVAL,
  botInput,
  bossArena,
  bossOf as findBoss,
  campaignLevel,
  createGame,
  step,
  type BossKind,
  type Enemy,
  type GameState,
  type Input,
} from "../src";
import { PRESSURES } from "../src/pressures";
import { emptyLevel, run, runUntil } from "./helpers";

/** A road with a boss of `kind` at z 100; the squad halts in front of it at 86. No minions unless asked for. */
const bossGame = (kind: BossKind, patch: { startSquad?: number; hp?: number; minions?: number } = {}) =>
  createGame(emptyLevel({ length: 140, startSquad: patch.startSquad ?? 900, startWeapon: "pistol", boss: { kind, z: 100, hp: patch.hp ?? 1e9, minions: patch.minions ?? 0 } }), 1);

/** The boss's body, in a test that knows it is still on the road. */
const bossOf = (s: GameState) => findBoss(s) as Enemy;

/** Run up to the boss with it holding its attacks, so a test can set up the fight it wants. */
function atTheBoss(s: GameState) {
  s.bossFight!.cooldown = 1e9;
  runUntil(s, TICK_RATE * 20, (x) => x.distance >= 100 - BOSS_STANDOFF - 0.01);
}

describe("every boss", () => {
  test("waits on the road from the start, where the player can see it", () => {
    const s = bossGame("general");
    expect(bossOf(s).z).toBeCloseTo(100, 0);
  });

  test("blocks the way: the squad halts in front of it until it is dead", () => {
    const s = bossGame("general");
    run(s, TICK_RATE * 25);
    expect(s.status).toBe("playing");
    expect(s.distance).toBeCloseTo(100 - BOSS_STANDOFF, 0);
  });

  test("dying lets the squad run on to the finish line, and only then does the level end", () => {
    const s = bossGame("general", { hp: 800 });
    run(s, TICK_RATE * 40);
    expect(bossOf(s)).toBeUndefined();
    expect(s.status).toBe("won");
    expect(s.distance).toBe(140);
  });

  test("calls the minions of its world, and every group is bigger than the one before", () => {
    for (const kind of BOSS_KINDS) {
      const s = bossGame(kind, { minions: 4 });
      s.bossFight!.cooldown = 1e9;
      const groups: number[] = [];
      for (let i = 0; i < TICK_RATE * 30; i++) {
        const before = new Set(s.enemies.map((e) => e.id));
        step(s, IDLE);
        s.bossFight!.cooldown = 1e9;
        const fresh = s.enemies.filter((e) => !before.has(e.id) && e.kind !== "boss");
        if (fresh.length) {
          expect(fresh.every((e) => e.kind === BOSS_MINIONS[kind])).toBe(true);
          groups.push(fresh.length);
        }
      }
      expect(groups.length).toBeGreaterThanOrEqual(2);
      expect(groups[1]).toBeGreaterThan(groups[0]);
    }
  });

  test("below half its hit points it is enraged, and waits less between attacks", () => {
    const calm = bossGame("mech");
    atTheBoss(calm);
    calm.bossFight!.cooldown = 0;
    runUntil(calm, TICK_RATE * 5, (x) => x.hazards.length > 0);
    expect(calm.bossFight!.cooldown).toBeGreaterThan(BOSS_ATTACK_INTERVAL.mech - 3);

    const angry = bossGame("mech");
    atTheBoss(angry);
    bossOf(angry).hp = bossOf(angry).maxHp * 0.4;
    angry.bossFight!.cooldown = 0;
    runUntil(angry, TICK_RATE * 5, (x) => x.hazards.length > 0);
    expect(angry.bossFight!.enraged).toBe(true);
    expect(angry.bossFight!.cooldown).toBeLessThanOrEqual(Math.round(BOSS_ATTACK_INTERVAL.mech * BOSS_FURY_PACE));
  });

  test("when it dies, what it set in motion is over too", () => {
    const s = bossGame("demon");
    runUntil(s, TICK_RATE * 20, (x) => x.fires.length > 0);
    expect(s.fires.length).toBeGreaterThan(0);
    bossOf(s).hp = 1;
    run(s, 2);
    expect(s.bossFight).toBeNull();
    expect(s.fires).toEqual([]);
    expect(s.hazards).toEqual([]);
  });
});

describe("the General", () => {
  test("fires a missile at where the squad stands, which blows up on the soldiers there", () => {
    const s = bossGame("general", { startSquad: 3 });
    runUntil(s, TICK_RATE * 20, (x) => x.bossHits.some((h) => h.kind === "missile"));
    const hit = s.bossHits.find((h) => h.kind === "missile")!;
    expect(hit.lost).toBeGreaterThan(0);
  });

  test("a squad that steps out of its way loses nothing", () => {
    const s = bossGame("general", { startSquad: 3 });
    const away = (x: GameState): Input => {
      const m = x.projectiles[0];
      return { move: 0, target: m ? (m.targetX <= 0 ? 3.3 : -3.3) : null };
    };
    runUntil(s, TICK_RATE * 20, (x) => x.bossHits.some((h) => h.kind === "missile"), away);
    expect(s.bossHits.find((h) => h.kind === "missile")!.lost).toBe(0);
    expect(s.squad.count).toBe(3);
  });

  test("a missile the columns under it shoot down in time does no harm", () => {
    const s = bossGame("general", { startSquad: 60 });
    const downed = runUntil(s, TICK_RATE * 20, (x) => x.popped.some((p) => p.kind === "missile"));
    expect(downed).toBe(true);
    expect(s.squad.count).toBe(60);
  });

  test("enraged, it fires a salvo of three", () => {
    const s = bossGame("general");
    atTheBoss(s);
    bossOf(s).hp = bossOf(s).maxHp * 0.4;
    s.bossFight!.cooldown = 0;
    run(s, 1);
    expect(s.projectiles.filter((p) => p.kind === "missile").length).toBe(3);
  });
});

describe("the Warlord", () => {
  test("rolls a row of kegs across the road with one lane left open", () => {
    const s = bossGame("warlord");
    runUntil(s, TICK_RATE * 20, (x) => x.projectiles.length > 0);
    const lanes = s.projectiles.map((p) => p.x).sort((a, b) => a - b);
    expect(s.projectiles.every((p) => p.kind === "keg")).toBe(true);
    expect(lanes.length).toBe(KEG_LANES.length - 1);
    for (const x of lanes) expect(KEG_LANES).toContain(x);
  });

  test("a small squad in the open lane loses nothing; one in front of a keg it cannot break loses soldiers", () => {
    const roll = (dodge: boolean) => {
      const s = bossGame("warlord", { startSquad: 3 });
      const open = (x: GameState) => KEG_LANES.find((l) => !x.projectiles.some((p) => p.targetX === l));
      const player = (x: GameState): Input => {
        if (!x.projectiles.length) return IDLE;
        const lane = open(x)!;
        return { move: 0, target: dodge ? lane : x.projectiles[0].targetX };
      };
      runUntil(s, TICK_RATE * 20, (x) => x.bossHits.some((h) => h.kind === "keg"), player);
      return s.squad.count;
    };
    expect(roll(true)).toBe(3);
    expect(roll(false)).toBeLessThan(3);
  });

  test("kegs can be shot to pieces before they arrive", () => {
    const s = bossGame("warlord", { startSquad: 200 });
    expect(runUntil(s, TICK_RATE * 20, (x) => x.popped.some((p) => p.kind === "keg"))).toBe(true);
  });
});

describe("the Mecha", () => {
  test("its shield stops every shot that does not come through the opening", () => {
    const s = bossGame("mech", { startSquad: 4 });
    atTheBoss(s);
    s.bossFight!.gap = 0;
    s.bossFight!.gapTicks = 1e9;
    const boss = bossOf(s);
    run(s, TICK_RATE, { move: 0, target: 3.3 });
    const full = boss.hp;
    run(s, TICK_RATE * 2, { move: 0, target: 3.3 });
    expect(boss.hp).toBe(full);
    run(s, TICK_RATE * 2, { move: 0, target: 0 });
    expect(boss.hp).toBeLessThan(full);
  });

  test("its laser fires down the opening", () => {
    const s = bossGame("mech");
    runUntil(s, TICK_RATE * 20, (x) => x.hazards.length > 0);
    expect(s.hazards[0].kind).toBe("laser");
    expect(s.hazards[0].x).toBe(s.bossFight!.gap!);
  });

  test("the opening moves now and then", () => {
    const s = bossGame("mech");
    atTheBoss(s);
    const first = s.bossFight!.gap;
    run(s, MECH_GAP_TICKS + 5);
    expect(s.bossFight!.gap).not.toBe(first);
  });
});

describe("the Yeti", () => {
  test("its ice freezes the soldiers it catches: they stop shooting, and the squad slides slower", () => {
    const s = bossGame("yeti", { startSquad: 9 });
    runUntil(s, TICK_RATE * 20, (x) => x.chill !== null);
    expect(s.chill!.share).toBeGreaterThan(0);
    s.bossFight!.cooldown = 1e9;
    s.hazards = [];
    const from = s.squad.x;
    run(s, 10, { move: 1, target: null });
    expect(s.squad.x - from).toBeCloseTo((10 * STRAFE_SPEED * CHILL_SLOW) / TICK_RATE, 5);
  });

  test("the slam comes right after the ice", () => {
    const s = bossGame("yeti");
    runUntil(s, TICK_RATE * 20, (x) => x.hazards.some((h) => h.kind === "ice"));
    const iceAt = s.tick;
    runUntil(s, TICK_RATE * 5, (x) => x.hazards.some((h) => h.kind === "slam"));
    expect(s.tick - iceAt).toBeLessThanOrEqual(ICE_WARN + YETI_COMBO_GAP + 2);
  });

  test("stepping out of the ice keeps every soldier shooting", () => {
    const s = bossGame("yeti", { startSquad: 3 });
    const away = (x: GameState): Input => {
      const ice = x.hazards.find((h) => h.kind === "ice");
      return { move: 0, target: ice ? (ice.x <= 0 ? 3.3 : -3.3) : null };
    };
    runUntil(s, TICK_RATE * 20, (x) => x.bossHits.some((h) => h.kind === "ice"), away);
    expect(s.chill).toBeNull();
  });
});

describe("the Demon", () => {
  test("its meteors leave a spot of the road clear, and the road burns where they fell", () => {
    const s = bossGame("demon");
    runUntil(s, TICK_RATE * 20, (x) => x.hazards.some((h) => h.kind === "meteor"));
    const marked = s.hazards.map((h) => h.x);
    expect(marked.length).toBe(2);
    expect(METEOR_SPOTS.some((x) => !marked.includes(x))).toBe(true);
    runUntil(s, TICK_RATE * 5, (x) => x.fires.length > 0);
    expect(s.fires.map((f) => f.x).sort()).toEqual([...marked].sort());
  });

  test("the fire burns the soldiers standing in it, and only them", () => {
    const burn = (fireX: number, squadX: number) => {
      const s = bossGame("demon", { startSquad: 20 });
      atTheBoss(s);
      run(s, TICK_RATE, { move: 0, target: squadX });
      s.fires.push({ id: 9999, x: fireX, halfWidth: 0.8, ticks: 90 });
      run(s, 90, { move: 0, target: squadX });
      return s.squad.count;
    };
    expect(burn(-2, -2)).toBeLessThan(20);
    expect(burn(3, -2)).toBe(20);
  });

  test("enraged, there is still always a spot that is neither marked nor burning", () => {
    const s = bossGame("demon");
    atTheBoss(s);
    bossOf(s).hp = bossOf(s).maxHp * 0.4;
    s.bossFight!.cooldown = 0;
    let volleys = 0;
    for (let i = 0; i < TICK_RATE * 40; i++) {
      const before = s.hazards.length;
      step(s, IDLE);
      if (s.hazards.length > before) {
        volleys++;
        const covered = (x: number) => s.hazards.some((h) => Math.abs(h.x - x) < 0.1) || s.fires.some((f) => Math.abs(f.x - x) < f.halfWidth);
        expect(METEOR_SPOTS.some((x) => !covered(x))).toBe(true);
      }
    }
    expect(volleys).toBeGreaterThanOrEqual(5);
  });
});

describe("the bot against the bosses", () => {
  /** Soldiers left and damage done after `seconds` in front of a boss. */
  const fight = (kind: BossKind, player: (s: GameState) => Input, seconds = 30) => {
    const s = bossGame(kind, { startSquad: 12 });
    const start = bossOf(s).hp;
    runUntil(s, TICK_RATE * seconds, () => false, player);
    return { left: s.squad.count, damage: start - (bossOf(s)?.hp ?? 0) };
  };

  test("a good player keeps more soldiers than one who stands still, against every boss but the Mecha", () => {
    for (const kind of ["general", "warlord", "yeti", "demon"] as const) {
      expect(fight(kind, (s) => botInput(s, SKILLED_BOT)).left).toBeGreaterThan(fight(kind, () => IDLE).left);
    }
  });

  test("against the Mecha, a good player goes where the shots get through", () => {
    expect(fight("mech", (s) => botInput(s, SKILLED_BOT)).damage).toBeGreaterThan(fight("mech", () => IDLE).damage);
  });
});

describe("the boss arena", () => {
  test("puts each boss a moment ahead, in its own world, and the fight can be won", () => {
    BOSS_KINDS.forEach((kind, world) => {
      const level = bossArena(kind);
      expect(level.boss!.kind).toBe(kind);
      expect(level.world).toBe(world);
      const s = createGame(level, 3);
      runUntil(s, TICK_RATE * 5, (x) => !!x.bossFight?.awake);
      expect(s.bossFight!.awake).toBe(true);
    });
    const s = createGame(bossArena("general"), 3);
    runUntil(s, TICK_RATE * 120, () => false, (x) => botInput(x, SKILLED_BOT));
    expect(s.status).toBe("won");
  });
});

describe("the campaign's bosses", () => {
  test("every world has its own boss, on both of its boss levels", () => {
    BOSS_KINDS.forEach((kind, world) => {
      expect(campaignLevel(world * 10 + 5).boss!.kind).toBe(kind);
      expect(campaignLevel(world * 10 + 10).boss!.kind).toBe(kind);
    });
  });

  test("a boss has seconds of the squad's fire in hit points, and the world's last one more than its middle one", () => {
    BOSS_KINDS.forEach((kind, world) => {
      const mid = campaignLevel(world * 10 + 5).boss!;
      const last = campaignLevel(world * 10 + 10).boss!;
      // the squad's damage per second when the boss wakes up, as the calibration measured it, and how far the pressure stretched the fight
      const fire = (n: number, z: number) => PRESSURES[n].fire[z - BOSS_ACTIVE_RANGE];
      const stretch = (n: number) => Math.max(BOSS_PRESSURE_RANGE[0], Math.min(BOSS_PRESSURE_RANGE[1], PRESSURES[n].pressure));
      expect(mid.hp / fire(world * 10 + 5, mid.z)).toBeCloseTo(BOSS_FIGHT_SECONDS * BOSS_TOUGHNESS[kind] * stretch(world * 10 + 5), 0);
      expect(last.hp / fire(world * 10 + 10, last.z)).toBeCloseTo(BOSS_FINAL_FIGHT_SECONDS * BOSS_TOUGHNESS[kind] * stretch(world * 10 + 10), 0);
    });
  });
});
