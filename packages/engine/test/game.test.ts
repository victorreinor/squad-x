import { describe, expect, test } from "bun:test";
import { BOSS_STANDOFF, BOSS_SLAM_WARN, IDLE, SKILLED_BOT, botInput, MAX_VEHICLES, RUN_SPEED, SHOOTER_RANGE, TICK_RATE, createGame, squadColumns, starsFor, step, vehicleXs, type Enemy, type GameState, type LevelDef } from "../src";
import { emptyLevel, run } from "./helpers";

const gate = (over: Partial<ReturnType<typeof emptyLevel>["gates"][number]> = {}) => ({ x: 0, z: 20, width: 8, op: "add" as const, value: 5, ...over });

describe("running", () => {
  test("the squad runs at RUN_SPEED and wins at the finish when there is no boss", () => {
    const s = createGame(emptyLevel({ length: 30 }), 1);
    run(s, TICK_RATE);
    expect(s.distance).toBeCloseTo(RUN_SPEED, 5);
    run(s, TICK_RATE * 10);
    expect(s.status).toBe("won");
    expect(s.distance).toBe(30);
  });

  test("sliding stops at the road edge, narrower for a bigger squad", () => {
    const small = createGame(emptyLevel({ startSquad: 1 }), 1);
    const big = createGame(emptyLevel({ startSquad: 100 }), 1);
    run(small, 60, { move: 1, target: null });
    run(big, 60, { move: 1, target: null });
    expect(small.squad.x).toBeGreaterThan(big.squad.x);
    expect(squadColumns(100)).toBeGreaterThan(squadColumns(1));
  });
});

describe("gates", () => {
  test("an adding gate adds soldiers once, only where the squad stands", () => {
    const s = createGame(emptyLevel({ gates: [gate({ x: -2, width: 4, value: 5, z: 4 }), gate({ x: 2, width: 4, value: -3, z: 4 })] }), 1);
    run(s, TICK_RATE * 2, { move: 0, target: -2 });
    // the squad shot the gate a little on the way in, so it adds whatever the number had become
    expect(s.squad.count).toBe(10 + s.gates[0].value);
    expect(s.lastGate?.text).toBe(`+${s.gates[0].value}`);
    const count = s.squad.count;
    run(s, 5);
    expect(s.squad.count).toBe(count);
  });

  test("the bad side of a pair costs soldiers", () => {
    const s = createGame(emptyLevel({ gates: [gate({ x: -2, width: 4, value: 5, z: 4 }), gate({ x: 2, width: 4, value: -3, z: 4 })] }), 1);
    run(s, TICK_RATE * 2, { move: 0, target: 2 });
    expect(s.squad.count).toBe(10 + s.gates[1].value);
    expect(s.squad.count).toBeLessThan(10);
    expect(s.lastGate?.good).toBe(false);
  });

  test("a multiplying gate multiplies", () => {
    const s = createGame(emptyLevel({ startSquad: 3, gates: [gate({ op: "mul", value: 4 })] }), 1);
    run(s, TICK_RATE * 6);
    expect(s.squad.count).toBe(12);
    expect(s.lastGate?.text).toBe("×4");
  });

  test("a gate that drains the squad to zero loses the run", () => {
    const s = createGame(emptyLevel({ startSquad: 3, gates: [gate({ value: -9 })] }), 1);
    run(s, TICK_RATE * 6);
    expect(s.status).toBe("lost");
    expect(s.squad.count).toBe(0);
  });

  test("shooting a gate raises its number, so a bad gate can turn good", () => {
    const s = createGame(emptyLevel({ startSquad: 30, gates: [gate({ value: -3, z: 30 })] }), 1);
    run(s, TICK_RATE * 3);
    expect(s.gates[0].value).toBeGreaterThan(-3);
  });
});

describe("combat", () => {
  test("a runner that reaches the squad costs one soldier; shot ones cost nothing", () => {
    const s = createGame(emptyLevel({ startSquad: 1, waves: [{ at: 0, kind: "runner", count: 1, x: 0, spread: 0 }] }), 1);
    run(s, TICK_RATE * 20);
    // one pistol soldier kills a 6 hp runner in 1.5 s, long before it arrives
    expect(s.losses).toBe(0);
    expect(s.enemies.length).toBe(0);
  });

  test("a horde bigger than the squad can shoot takes soldiers and can end the run", () => {
    const s = createGame(emptyLevel({ startSquad: 2, waves: [{ at: 0, kind: "runner", count: 60, x: 0, spread: 5 }] }), 1);
    run(s, TICK_RATE * 40);
    expect(s.status).toBe("lost");
  });

  test("the fire goes to the first thing in the lane: a barrel in front shields the enemies behind it, until it breaks", () => {
    const level = emptyLevel({
      startSquad: 20,
      barrels: [{ x: 0, z: 20, hp: 60, reward: { kind: "coins", count: 1 } }],
      waves: [{ at: 0, kind: "brute", count: 1, x: 0, spread: 0, ahead: 30, hp: 5000 }],
    });
    const s = createGame(level, 1);
    run(s, 15);
    expect(s.enemies[0].hp).toBe(5000);
    expect(s.barrels[0].hp).toBeLessThan(60);
    run(s, 40);
    expect(s.barrels.length).toBe(0);
    expect(s.enemies[0].hp).toBeLessThan(5000);
  });

  test("a gate does not shield anyone: enemies behind it are shot first", () => {
    const s = createGame(emptyLevel({ startSquad: 20, gates: [gate({ z: 12 })], waves: [{ at: 0, kind: "brute", count: 1, x: 0, spread: 0, ahead: 30 }] }), 1);
    const gateValue = s.gates[0].value;
    run(s, 15);
    expect(s.enemies[0].hp).toBeLessThan(40);
    expect(s.gates[0].value).toBe(gateValue);
  });

  test("with no enemy in the way, the fire goes to the gate", () => {
    const s = createGame(emptyLevel({ startSquad: 30, gates: [gate({ z: 30, value: -3 })] }), 1);
    run(s, TICK_RATE * 2);
    expect(s.gates[0].value).toBeGreaterThan(-3);
  });

  test("a barrel breaks into its reward", () => {
    const s = createGame(
      emptyLevel({ startSquad: 20, barrels: [{ x: 0, z: 30, hp: 40, reward: { kind: "weapon", weapon: "minigun" } }] }),
      1,
    );
    run(s, TICK_RATE * 6);
    expect(s.squad.weapon).toBe("minigun");
    expect(s.barrels.length).toBe(0);
  });

  test("a weaker weapon never replaces a stronger one", () => {
    const s = createGame(
      emptyLevel({ startWeapon: "smg", barrels: [{ x: 0, z: 25, hp: 5, reward: { kind: "weapon", weapon: "rifle" } }] }),
      1,
    );
    run(s, TICK_RATE * 6);
    expect(s.squad.weapon).toBe("smg");
  });

});

describe("determinism", () => {
  test("same level, seed and inputs give the same run", () => {
    const level = emptyLevel({ waves: [{ at: 5, kind: "runner", count: 20, x: 0, spread: 5 }] });
    const a = createGame(level, 42);
    const b = createGame(level, 42);
    run(a, 400);
    run(b, 400);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  test("a finished run ignores further steps", () => {
    const s = createGame(emptyLevel({ length: 5 }), 1);
    run(s, 100);
    const tick = s.tick;
    step(s, IDLE);
    expect(s.tick).toBe(tick);
  });
});

describe("stars", () => {
  test("none for a loss, three for a clean win, fewer as more soldiers fall", () => {
    const lost = createGame(emptyLevel(), 1);
    lost.status = "lost";
    expect(starsFor(lost)).toBe(0);
    const clean = createGame(emptyLevel({ length: 5 }), 1);
    run(clean, 100);
    expect(starsFor(clean)).toBe(3);
    clean.losses = clean.squad.count; // half the soldiers fell
    expect(starsFor(clean)).toBe(1);
    clean.losses = Math.round(clean.squad.count / 6);
    expect(starsFor(clean)).toBe(2);
  });
});

describe("vehicles", () => {
  const withVehicle = (vehicle: "moto" | "heli" | "tank") =>
    emptyLevel({ startSquad: 20, barrels: [{ x: 0, z: 20, hp: 5, reward: { kind: "vehicle", vehicle } }] });

  test("a barrel can hold a vehicle, and it joins the squad", () => {
    const s = createGame(withVehicle("tank"), 1);
    run(s, TICK_RATE * 4);
    expect(s.squad.vehicles).toEqual(["tank"]);
  });

  test("a vehicle adds its own gun column on top of the soldiers", () => {
    const level = { barrels: [{ x: 0, z: 45, hp: 99999, reward: { kind: "coins" as const, count: 1 } }] };
    const plain = createGame(emptyLevel({ startSquad: 4, ...level }), 1);
    const tank = createGame(emptyLevel({ startSquad: 4, ...level }), 1);
    tank.squad.vehicles.push("tank");
    run(plain, TICK_RATE * 4);
    run(tank, TICK_RATE * 4);
    const hit = (s: typeof plain) => 99999 - s.barrels[0].hp;
    expect(hit(tank)).toBeGreaterThan(hit(plain) * 3);
    expect(tank.volleys.some((v) => v.vehicle === "tank")).toBe(true);
  });

  test("a vehicle fires even when the squad is a single soldier", () => {
    const s = createGame(emptyLevel({ startSquad: 1, waves: [{ at: 0, kind: "brute", count: 1, x: 0, spread: 0 }] }), 1);
    s.squad.vehicles.push("heli");
    run(s, TICK_RATE * 9);
    expect(s.losses).toBe(0);
  });

  test("no more than MAX_VEHICLES, and they stay on the road", () => {
    const s = createGame(emptyLevel({ startSquad: 100 }), 1);
    for (let i = 0; i < MAX_VEHICLES + 2; i++) s.squad.vehicles.push("moto");
    s.squad.vehicles.length = Math.min(s.squad.vehicles.length, MAX_VEHICLES);
    expect(s.squad.vehicles.length).toBe(MAX_VEHICLES);
    for (const x of vehicleXs(3.5, 100, MAX_VEHICLES)) expect(Math.abs(x)).toBeLessThanOrEqual(4);
    // a full garage ignores a new vehicle
    const full = createGame(withVehicle("tank"), 1);
    full.squad.vehicles.push(...Array<"moto">(MAX_VEHICLES).fill("moto"));
    run(full, TICK_RATE * 4);
    expect(full.squad.vehicles.length).toBe(MAX_VEHICLES);
    expect(full.squad.vehicles.includes("tank")).toBe(false);
  });
});

describe("punishing gates", () => {
  test("a dividing gate halves the squad (rounding up, never to zero) and counts as losses", () => {
    const s = createGame(emptyLevel({ startSquad: 41, gates: [gate({ op: "div", value: 2, z: 5, locked: true })] }), 1);
    run(s, TICK_RATE * 2);
    expect(s.squad.count).toBe(21);
    expect(s.losses).toBe(20);
    expect(s.lastGate?.text).toBe("÷2");
    const one = createGame(emptyLevel({ startSquad: 1, gates: [gate({ op: "div", value: 2, z: 5, locked: true })] }), 1);
    run(one, TICK_RATE * 2);
    expect(one.squad.count).toBe(1);
  });

  test("a locked gate cannot be shot up: the fire goes past it", () => {
    const open = createGame(emptyLevel({ startSquad: 30, gates: [gate({ value: -9, z: 30 })] }), 1);
    const locked = createGame(emptyLevel({ startSquad: 30, gates: [gate({ value: -9, z: 30, locked: true })] }), 1);
    run(open, TICK_RATE * 2);
    run(locked, TICK_RATE * 2);
    expect(open.gates[0].value).toBeGreaterThan(-9);
    expect(locked.gates[0].value).toBe(-9);
  });

  test("the soldiers a gate takes cost stars", () => {
    const s = createGame(emptyLevel({ length: 40, startSquad: 20, gates: [gate({ value: -10, z: 5, locked: true })] }), 1);
    run(s, TICK_RATE * 20);
    expect(s.status).toBe("won");
    expect(s.losses).toBe(10);
    expect(starsFor(s)).toBeLessThan(3);
  });
});

describe("traps", () => {
  const crossing = (traps: LevelDef["traps"], squadX = 0, startSquad = 20) => {
    const s = createGame(emptyLevel({ startSquad, traps }), 1);
    run(s, TICK_RATE * 3, { move: 0, target: squadX });
    return s;
  };

  test("spikes cut the soldiers over them and leave the rest", () => {
    const s = crossing([{ kind: "spikes", x: 0, z: 10 }]);
    expect(s.squad.count).toBeLessThan(20);
    expect(s.squad.count).toBeGreaterThan(8);
    expect(s.lastImpact?.kind).toBe("spikes");
    expect(s.lastImpact?.lost).toBe(20 - s.squad.count);
  });

  test("steering around spikes costs nothing", () => {
    const hit = crossing([{ kind: "spikes", x: -3, z: 10 }], -3);
    const around = crossing([{ kind: "spikes", x: -3, z: 10 }], 3, 4);
    expect(hit.squad.count).toBeLessThan(20);
    expect(around.squad.count).toBe(4);
    expect(around.lastImpact).toBeNull();
  });

  test("a mine shot before the squad reaches it goes off harmlessly", () => {
    const s = createGame(emptyLevel({ startSquad: 20, traps: [{ kind: "mine", x: 0, z: 30 }] }), 1);
    run(s, TICK_RATE * 2);
    expect(s.traps.length).toBe(0);
    expect(s.squad.count).toBe(20);
    expect(s.lastImpact).toBeNull();
  });

  test("a mine the squad runs into blows up the soldiers beside it", () => {
    const s = createGame(emptyLevel({ startSquad: 1, startWeapon: "pistol", traps: [{ kind: "mine", x: 0, z: 6 }] }), 1);
    // one pistol soldier cannot shoot it in the time it has
    run(s, TICK_RATE * 2);
    expect(s.lastImpact?.kind).toBe("mine");
    expect(s.status).toBe("lost");
  });
});

describe("air strikes", () => {
  const strike = (patch: Partial<Parameters<typeof emptyLevel>[0]> = {}) =>
    createGame(emptyLevel({ startSquad: 20, events: [{ at: 12, kind: "airstrike", bombs: 3 }], ...patch }), 1);

  test("a plane flies over and marks the road before the bombs fall", () => {
    const s = strike();
    let marked = 0;
    for (let i = 0; i < TICK_RATE * 6; i++) {
      step(s, IDLE);
      marked = Math.max(marked, s.hazards.filter((h) => h.kind === "bomb").length);
    }
    expect(marked).toBeGreaterThanOrEqual(1);
    expect(s.plane).toBeNull();
  });

  test("a squad that stays where it is loses soldiers; one that steps aside loses none", () => {
    const stay = strike();
    run(stay, TICK_RATE * 8);
    expect(stay.squad.count).toBeLessThan(20);
    expect(stay.lastImpact?.kind).toBe("bomb");

    // a player who watches the marks and steps out of them
    const dodge = strike({ startSquad: 3 });
    for (let i = 0; i < TICK_RATE * 8; i++) step(dodge, botInput(dodge, SKILLED_BOT));
    expect(dodge.squad.count).toBe(3);
  });

  test("the strike happens once, at the distance it was set for", () => {
    const s = strike();
    expect(s.plane).toBeNull();
    run(s, TICK_RATE);
    expect(s.pendingEvents.length).toBe(1);
    run(s, TICK_RATE * 2);
    expect(s.pendingEvents.length).toBe(0);
  });
});
