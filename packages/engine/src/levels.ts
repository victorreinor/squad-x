import { BOSS_FIGHT_SECONDS, BOSS_FINAL_FIGHT_SECONDS, BOSS_MINION_SECONDS, BOSS_ACTIVE_RANGE, BOSS_MINIONS, BOSS_PRESSURE_RANGE, BOSS_TOUGHNESS, ENEMY_STATS, LANE_HALF_WIDTH, MAX_SQUAD, VEHICLE_STATS, WEAPON_DPS } from "./constants";
import { nextRandom } from "./rng";
import {
  BOSS_KINDS,
  VEHICLE_KINDS,
  type BossKind,
  WEAPON_KINDS,
  type EnemyKind,
  type LevelDef,
  type LevelMode,
  type LevelTwist,
  type Reward,
  type VehicleKind,
  type WaveDef,
  type WeaponKind,
} from "./types";

/** The knobs that shape a generated level. Same spec, same level. */
export interface LevelSpec {
  seed: number;
  mode: LevelMode;
  twist: LevelTwist;
  /** from 0: decides which enemies can show up and which boss waits at the end */
  world: number;
  /** 1 (easy) and up; scales hordes, bad gates, barrel hit points and the boss */
  difficulty: number;
  /** how many patterns (gates, hordes, barrels) the road holds before the boss */
  patterns: number;
  theme: string;
  startSquad: number;
  startWeapon: WeaponKind;
  boss: boolean;
  /** how long the boss fight lasts for the squad a good player brings (seconds of its fire); read only when there is a boss */
  bossSeconds: number;
  /** how many air strikes the level has: the world starts attacking on its own */
  strikes: number;
  /** how hard the hordes and the boss hit, as a multiple of the usual; `calibratePressure` picks it by playing the level */
  pressure?: number;
  /** how strong a good player's squad really is at each distance of this level, measured by `measureSquad`: hordes and barrels are sized from it */
  trace?: SquadTrace;
}

/** The squad of a player running the level, sampled at every unit of the road: soldiers, and soldiers' and vehicles' damage per second. */
export interface SquadTrace {
  count: number[];
  fire: number[];
}

/** Scenery palettes the renderer knows, in the order the worlds appear. */
export const THEMES = ["bridge", "desert", "city", "snow", "volcano"] as const;

/** gates stop being plain additions once the squad is at least this big */
const MUL_MIN_POWER = 8;
/** the share of a barrel cluster's reward that the planning counts on, since the player cannot open everything */
const REALISM = 0.55;
/** the most enemies one generated horde holds */
const MAX_HORDE = 55;

/** The first level an air strike can happen on. */
export const STRIKE_FROM_LEVEL = 6;

/** Levels per world; the 5th and the 10th end in a boss. */
export const LEVELS_PER_WORLD = 10;

/** The mode of each level of a world, in order. Boss levels are mixed. */
const WORLD_MODES: readonly LevelMode[] = ["gates", "loot", "mixed", "gates", "mixed", "loot", "mixed", "gates", "loot", "mixed"];

/** The twist of each level of a world, in order: what makes it feel different from its neighbours. */
const WORLD_TWISTS: readonly LevelTwist[] = ["none", "swarm", "ambush", "traps", "none", "scarce", "elite", "rush", "swarm", "none"];

/** Soldiers a squad starts a level with, per mode: loot levels hand over a bigger squad to open barrels with. */
const START_SQUAD: Record<LevelMode, number> = { gates: 2, loot: 8, mixed: 4 };

/** How often each pattern comes up in a mode; the rest of the roll goes to barrels. */
const MODE_MIX: Record<LevelMode, { gates: number; horde: number }> = {
  gates: { gates: 0.45, horde: 0.55 },
  loot: { gates: 0.04, horde: 0.46 },
  mixed: { gates: 0.25, horde: 0.55 },
};

/** The enemies each world can send, in the order they are introduced. */
const WORLD_ENEMIES: readonly (readonly EnemyKind[])[] = [
  ["runner", "brute"],
  ["runner", "brute", "sprinter", "shield"],
  ["runner", "brute", "sprinter", "shield", "bomber"],
  ["runner", "brute", "sprinter", "shield", "bomber", "shooter"],
  ["runner", "brute", "sprinter", "shield", "bomber", "shooter"],
];

/** The spec of the n-th level of the campaign (1-based). */
export function campaignSpec(n: number): LevelSpec {
  const world = Math.floor((n - 1) / LEVELS_PER_WORLD);
  const inWorld = (n - 1) % LEVELS_PER_WORLD;
  const mode = WORLD_MODES[inWorld];
  return {
    seed: 1000 + n * 7919,
    mode,
    twist: WORLD_TWISTS[inWorld],
    world,
    difficulty: 1.3 + world * 2.2 + inWorld * 0.3,
    // twice the patterns it once had: a level is a stretch of road, not a corridor
    patterns: (7 + Math.floor(inWorld / 2)) * 2,
    theme: THEMES[world % THEMES.length],
    startSquad: START_SQUAD[mode],
    startWeapon: "pistol",
    boss: inWorld === LEVELS_PER_WORLD - 1 || inWorld === 4,
    // the boss that closes a world takes longer to bring down than the one halfway through it
    bossSeconds: inWorld === LEVELS_PER_WORLD - 1 ? BOSS_FINAL_FIGHT_SECONDS : BOSS_FIGHT_SECONDS,
    // the first bombers show up at level 6; later levels send more of them
    strikes: n < STRIKE_FROM_LEVEL ? 0 : n < STRIKE_FROM_LEVEL + 10 ? 1 : 2,
  };
}

const between = (state: { rng: number }, lo: number, hi: number) => lo + nextRandom(state) * (hi - lo);
const intBetween = (state: { rng: number }, lo: number, hi: number) => Math.floor(between(state, lo, hi + 1));

/** One of `items`, chosen with the given weights. */
function pickWeighted<T>(rng: { rng: number }, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let roll = nextRandom(rng) * total;
  for (const [item, w] of items) {
    roll -= w;
    if (roll < 0) return item;
  }
  return items[items.length - 1][0];
}

/** The weapon a barrel at this difficulty may hold. */
function weaponFor(difficulty: number): WeaponKind {
  if (difficulty < 2.5) return "rifle";
  if (difficulty < 5) return "smg";
  return "minigun";
}

/** The vehicle a barrel at this difficulty may hold: the tank only shows up later. */
function vehicleFor(rng: { rng: number }, difficulty: number): VehicleKind {
  const reachable = difficulty < 2.5 ? 1 : difficulty < 4.5 ? 2 : VEHICLE_KINDS.length;
  return VEHICLE_KINDS[Math.floor(nextRandom(rng) * reachable)];
}

/** How many soldiers' worth of firepower a vehicle adds, for sizing hordes and bosses. */
const vehiclePower = (v: VehicleKind) => Math.round(VEHICLE_STATS[v].dps / 8);

type GateKind = "plain" | "pump" | "tradeoff" | "lesser";

/** Build a level from a spec: a quick first fight, a road of patterns, then the finish or a boss on the road. */
export function generateLevel(spec: LevelSpec): LevelDef {
  const rng = { rng: spec.seed >>> 0 };
  const d = spec.difficulty;
  const twist = spec.twist;
  const mix = MODE_MIX[spec.mode];
  const enemies = WORLD_ENEMIES[Math.min(spec.world, WORLD_ENEMIES.length - 1)];
  const level: LevelDef = {
    mode: spec.mode,
    twist,
    world: spec.world,
    length: 0,
    startSquad: spec.startSquad,
    startWeapon: spec.startWeapon,
    gates: [],
    traps: [],
    events: [],
    barrels: [],
    waves: [],
    boss: null,
    theme: spec.theme,
  };
  // what a player who picks well should have by now; hordes and the boss are sized from it
  let power = spec.startSquad;
  // the strongest weapon a barrel on this road holds, to guess the firepower at the boss
  let bestWeapon: WeaponKind = spec.startWeapon;
  let gatePairs = 0;
  /** the power the squad has after each pattern, by where it is on the road, to look up what it has when a horde appears */
  const history: { z: number; power: number }[] = [{ z: 0, power: spec.startSquad }];
  const powerAt = (z: number) => history.filter((h) => h.z <= z).at(-1)!.power;
  /** firepower per soldier we can expect by now: halfway between the starting weapon and the best one handed out */
  const dpsEach = () => (WEAPON_DPS[spec.startWeapon] + WEAPON_DPS[bestWeapon]) / 2;
  // with a measured trace the squad is what a real run showed; without one it is the generator's own estimate
  const traced = (arr: number[] | undefined, z: number) => (arr && arr.length ? arr[Math.max(0, Math.min(arr.length - 1, Math.floor(z)))] : undefined);
  /** soldiers the squad has at distance z */
  const countAt = (z: number) => traced(spec.trace?.count, z) ?? powerAt(z);
  /** damage per second the squad deals at distance z */
  const fireAt = (z: number) => traced(spec.trace?.fire, z) ?? (powerAt(z) + vehicleBonus) * dpsEach();
  /** where the last horde appeared, so two never land on the squad together */
  let lastHorde = -Infinity;
  /** how much of its full size a horde gets: the first ones are lighter so the squad has time to grow */
  let ramp = 1;
  /** soldiers' worth of firepower from vehicles the road has handed out so far */
  let vehicleBonus = 0;
  /** how far ahead of the squad a horde shows up: an ambush gives no time to see it coming */
  const ahead = twist === "ambush" ? 22 : 42;

  const wave = (z: number, kind: EnemyKind, count: number, spread: number, x = between(rng, -1, 1), hp?: number): WaveDef => {
    const wanted = Math.max(1, Math.round(count));
    // a crowd past what fits on the road is not a wall of more monsters but tougher ones
    const size = Math.min(MAX_HORDE, wanted);
    const w: WaveDef = { at: z - ahead, kind, count: size, x, spread, ahead };
    if (hp) w.hp = hp;
    else if (wanted > size) w.hp = Math.round(ENEMY_STATS[kind].hp * (wanted / size));
    level.waves.push(w);
    return w;
  };

  const addGatePair = (z: number) => {
    // sized from the squad the player really has when it gets here, not from the generator's own guess
    const here = countAt(z - 8);
    const p = Math.max(here, 4);
    const weights: [GateKind, number][] =
      gatePairs === 0 && d < 2
        ? [["plain", 1]]
        : twist === "traps"
          ? [["plain", 0.2], ["pump", 0.2], ["tradeoff", 0.2], ["lesser", 0.4]]
          : d < 1.8
            ? [["plain", 0.9], ["pump", 0.1]]
            : [["plain", 0.55], ["pump", 0.08], ["tradeoff", 0.15], ["lesser", 0.22]];
    let kind = pickWeighted(rng, weights);
    // multiplying or dividing a tiny squad is worth nothing, so early gates only add
    if ((kind === "tradeoff" || kind === "lesser") && here < MUL_MIN_POWER) kind = "plain";
    const left = nextRandom(rng) < 0.5 ? -2 : 2;
    const put = (x: number, op: "add" | "mul" | "div", value: number, locked = false) => level.gates.push({ x, z, width: LANE_HALF_WIDTH, op, value, ...(locked ? { locked: true } : {}) });
    gatePairs++;
    // the punishing lane halves the squad some of the time; otherwise it takes a fixed number
    const halves = here >= 10 && d >= 2 && nextRandom(rng) < Math.min(0.5, 0.18 + d * 0.04);

    if (kind === "pump") {
      // a big red gate that a strong enough weapon can shoot up past a small blue one: the only red you can argue with
      const blue = Math.max(3, Math.round(p * between(rng, 0.15, 0.3)));
      put(left, "add", blue);
      put(-left, "add", -Math.max(8, Math.round(p * between(rng, 0.7, 1.0))));
      power += blue;
    } else if (kind === "tradeoff") {
      // a bonus that is better now against a multiplier that is better for a big squad
      const times = nextRandom(rng) < 0.12 && d > 3 ? 3 : 2;
      const bonus = Math.max(4, Math.round(p * between(rng, 0.7, 1.5)));
      put(left, "add", bonus);
      put(-left, "mul", times);
      power = Math.min(MAX_SQUAD, power + Math.min(bonus, p * (times - 1)));
    } else if (kind === "lesser") {
      // both lanes cost soldiers and neither can be shot up: take the smaller loss
      const small = Math.max(3, Math.round(p * between(rng, 0.1, 0.2)));
      put(left, "add", -small, true);
      if (halves) {
        put(-left, "div", 2, true);
      } else {
        put(-left, "add", -Math.max(small + 3, Math.round(p * between(rng, 0.35, 0.6))), true);
      }
      power = Math.max(2, power - small);
    } else {
      const mulChance = here < MUL_MIN_POWER ? 0 : Math.min(0.5, 0.25 + d * 0.03);
      if (nextRandom(rng) < mulChance) {
        const times = nextRandom(rng) < 0.12 && d > 3 ? 3 : 2;
        put(left, "mul", times);
        if (halves) put(-left, "div", 2, true);
        else put(-left, "add", -Math.min(Math.max(3, Math.round(p * between(rng, 0.2, 0.5))), Math.max(1, here - 1)), true);
        power = Math.min(MAX_SQUAD, power * times);
      } else {
        const good = Math.max(4, Math.round(p * between(rng, 0.2, 0.45)));
        put(left, "add", good);
        if (halves) {
          put(-left, "div", 2, true);
        } else {
          // early on the red gate must not wipe the squad out: a wrong lane costs most of it, not all
          const bad = Math.max(2, Math.round(good * between(rng, 0.7, 1.4)));
          // in the learning levels a wrong lane stings but does not end the run
          const cap = d < 1.8 ? Math.max(2, Math.floor(here * 0.3)) : gatePairs <= 2 ? Math.max(1, here - 1) : Infinity;
          put(-left, "add", -Math.min(bad, cap), true);
        }
        power = Math.min(MAX_SQUAD, power + good);
      }
    }
  };

  /** Traps across the road: spikes to steer around, mines to shoot or steer around. They cost the squad what it walks into. */
  const addTraps = (z: number) => {
    if (nextRandom(rng) < 0.5) {
      // spikes: one strip, or two with a gap between that a small squad slips through and a big one only half fits
      const x = between(rng, -2.4, 2.4);
      level.traps.push({ kind: "spikes", x, z });
      if (nextRandom(rng) < 0.5) level.traps.push({ kind: "spikes", x: x > 0 ? x - 3.8 : x + 3.8, z: z + 0.1 });
    } else {
      // mines laid out in a loose line
      const count = 2 + Math.floor(nextRandom(rng) * 3);
      for (let i = 0; i < count; i++) level.traps.push({ kind: "mine", x: -3 + (6 * (i + 0.5)) / count + between(rng, -0.4, 0.4), z: z + between(rng, -2, 2) });
    }
    // the planning counts on losing a little to them
    power = Math.max(2, Math.round(power * 0.94));
  };

  const addHorde = (z: number) => {
    lastHorde = z;
    // runners the squad can shoot down before they land (about 2.3 s of useful fire at 6 hp each), scaled up with difficulty
    // the horde lands before the squad reaches the pattern right before it, so size it for the squad as it is when the horde appears
    const capacity = (fireAt(z - ahead + 4) * 2.3) / 6;
    // loot levels grow the squad only by opening barrels, so their hordes are lighter
    const base = 2 + capacity * (0.55 + d * 0.11) * ramp * (twist === "ambush" ? 0.5 : 1) * (spec.mode === "loot" ? 0.8 : 1) * (spec.pressure ?? 1);
    const crowd = twist === "swarm" ? (spec.mode === "loot" ? 1 : 1.25) : twist === "elite" ? 0.55 : 1;
    // a kind only shows up once the squad we expect can take it: a brute kills four soldiers on contact
    const now = countAt(z - ahead + 4);
    const picks: [EnemyKind, number][] = [["runner", twist === "elite" ? 0.5 : 3]];
    if (enemies.includes("sprinter") && now >= 8) picks.push(["sprinter", 2]);
    if (enemies.includes("brute") && now >= 12) picks.push(["brute", twist === "elite" ? 4 : 1.5]);
    if (enemies.includes("shield") && now >= 14) picks.push(["shield", twist === "elite" ? 4 : 1.5]);
    if (enemies.includes("bomber") && now >= 10) picks.push(["bomber", 1.5]);
    if (enemies.includes("shooter") && now >= 12) picks.push(["shooter", twist === "elite" ? 3 : 1]);
    const main = pickWeighted(rng, picks);
    // a second group comes with some hordes; the two share what the squad can take instead of adding up
    const extraRunners = main !== "runner" && nextRandom(rng) < 0.7;
    const extraKind = main === "runner" && picks.length > 1 && nextRandom(rng) < 0.55 ? pickWeighted(rng, picks.slice(1)) : null;
    const share = extraRunners || extraKind ? 0.65 : 1;
    const count = (kind: EnemyKind) =>
      kind === "runner" ? base * crowd * share :
      kind === "sprinter" ? base * 0.8 * crowd * share :
      kind === "brute" ? Math.max(1, Math.floor(now / (twist === "elite" ? 5 : 9))) :
      kind === "shield" ? Math.max(2, Math.floor(now / (twist === "elite" ? 5 : 8))) :
      kind === "bomber" ? 2 + Math.floor(d / 2) :
      2 + Math.floor(d / 3);
    wave(z, main, count(main), main === "runner" || main === "sprinter" ? 6.4 : 4.6);
    if (extraRunners) wave(z + 4, "runner", base * 0.35 * crowd, 6.4);
    if (extraKind) wave(z + 3, extraKind, count(extraKind), 4.6);
  };

  const addBarrels = (z: number) => {
    // loot levels set out up to three barrels side by side, so choosing which to open is the point
    const loot = spec.mode === "loot";
    const roll = nextRandom(rng);
    const count = loot ? (roll < 0.2 ? 1 : roll < 0.65 ? 2 : 3) : roll < 0.4 ? 2 : 1;
    const xs = count === 1 ? [between(rng, -2, 2)] : count === 2 ? [-1.9, 1.9] : [-2.5, 0, 2.5];
    // the player can count on opening one barrel of a cluster before the next horde, not all of them
    let gain = 0;
    xs.forEach((x) => {
      const reward = pickReward(rng, d, loot, twist === "scarce", countAt(z - 40));
      if (reward.kind === "soldiers") gain = Math.max(gain, reward.count);
      if (reward.kind === "vehicle") {
        gain = Math.max(gain, vehiclePower(reward.vehicle));
        vehicleBonus += (vehiclePower(reward.vehicle) / 2) * REALISM;
      }
      if (reward.kind === "weapon" && WEAPON_KINDS.indexOf(reward.weapon) > WEAPON_KINDS.indexOf(bestWeapon)) bestWeapon = reward.weapon;
      // opening one takes about 3 seconds of the squad's fire, so a barrel is a decision, not a wall
      // sized for the weapon the level starts with: a better one is a bonus, not something to count on
      const fire = countAt(z - 40) * WEAPON_DPS[spec.startWeapon];
      level.barrels.push({ x, z, hp: Math.max(25, Math.round(fire * between(rng, 2.2, 3.4))), reward });
    });
    // nobody collects everything: count only part of what the cluster holds, or the estimate runs away from the real squad
    power = Math.min(MAX_SQUAD, power + gain * REALISM);
  };

  // the fight starts at once: a small group is already on its way before the first pattern
  lastHorde = 26;
  wave(26, "runner", Math.max(2, Math.round(power * 0.6 + 1)), 5, 0);

  let z = 50;
  for (let i = 0; i < spec.patterns; i++) {
    ramp = 0.3 + (0.7 * i) / Math.max(1, spec.patterns - 1);
    const rushing = twist === "rush";
    const gates = mix.gates + (rushing ? 0.25 : 0);
    if (i === 0) {
      // the first pattern is the level's own idea, but only after that first fight
      if (spec.mode === "loot") addBarrels(z);
      else if (spec.mode === "gates") addGatePair(z);
      else addHorde(z);
    } else if (i === 1 && spec.mode !== "gates") {
      // after the opening, the squad gets something to grow with before the pressure builds
      if (nextRandom(rng) < 0.5) addGatePair(z);
      else addBarrels(z);
    } else {
      const roll = nextRandom(rng);
      const trapChance = i < 2 || d < 1.8 ? 0 : spec.mode === "loot" ? 0.1 : Math.min(0.28, 0.12 + d * 0.02);
      if (nextRandom(rng) < trapChance) {
        addTraps(z);
        history.push({ z, power });
        z += between(rng, 10, 15);
        continue;
      }
      let kind: "gates" | "horde" | "barrels" = roll < gates ? "gates" : roll < gates + mix.horde ? "horde" : "barrels";
      // too soon after the last horde: give the squad a breather with gates or barrels, whichever the level is about
      if (kind === "horde" && z - lastHorde < (spec.mode === "loot" ? 26 : 22)) kind = spec.mode === "gates" ? "gates" : nextRandom(rng) < 0.5 ? "gates" : "barrels";
      if (kind === "gates") addGatePair(z);
      else if (kind === "horde") addHorde(z);
      else addBarrels(z);
    }
    history.push({ z, power });
    z += rushing ? between(rng, 9, 13) : spec.mode === "loot" ? between(rng, 13, 18) : between(rng, 12, 18);
  }

  // from level 6 the world attacks on its own: bombers fly over at set points of the run
  for (let k = 0; k < spec.strikes; k++) level.events.push({ at: Math.round(z * (spec.strikes === 1 ? 0.55 : 0.35 + k * 0.35)), kind: "airstrike", bombs: 2 + Math.min(2, spec.world) });

  if (spec.boss) {
    const at = Math.round(z + 12);
    const kind = BOSS_KINDS[spec.world % BOSS_KINDS.length];
    // the fight is measured in seconds of the fire of the squad a good player brings, so no boss falls in a moment or
    // drags on for minutes; the hordes before it and its minions are what the pressure turns up. The squad is taken as
    // it is when the boss wakes up, before its first attack
    const fire = Math.max(1, fireAt(at - BOSS_ACTIVE_RANGE));
    const minion = ENEMY_STATS[BOSS_MINIONS[kind]];
    const minions = Math.max(3, Math.round((fire * BOSS_MINION_SECONDS * (spec.pressure ?? 1)) / (minion.hp / minion.armor)));
    const [least, most] = BOSS_PRESSURE_RANGE;
    const stretch = Math.max(least, Math.min(most, spec.pressure ?? 1));
    level.boss = { kind, z: at, hp: Math.round(fire * spec.bossSeconds * BOSS_TOUGHNESS[kind] * stretch), minions };
    level.length = at + 28;
  } else {
    level.length = Math.round(z + 18);
  }
  return level;
}

/**
 * A short road straight to one boss, for watching its attack up close (`?chefao=` in the client): a middling squad with
 * a submachine gun, the boss a moment away and lasting about as long as the hardest boss of its world.
 */
export function bossArena(kind: BossKind): LevelDef {
  const world = BOSS_KINDS.indexOf(kind);
  const squad = 40;
  const fire = squad * WEAPON_DPS.smg;
  const z = 40;
  return {
    mode: "mixed",
    twist: "none",
    world,
    length: z + 20,
    startSquad: squad,
    startWeapon: "smg",
    gates: [],
    traps: [],
    events: [],
    barrels: [],
    waves: [],
    boss: { kind, z, hp: Math.round(fire * BOSS_FINAL_FIGHT_SECONDS * BOSS_TOUGHNESS[kind]), minions: 4 },
    theme: THEMES[world % THEMES.length],
  };
}

function pickReward(rng: { rng: number }, difficulty: number, loot: boolean, scarce: boolean, power: number): Reward {
  // weights of [weapon, vehicle, soldiers, coins]; a scarce level hardly ever holds the good stuff
  const gear = scarce ? 0.2 : 1;
  const w: [string, number][] = loot
    ? [["weapon", 30 * gear], ["vehicle", 25 * gear], ["soldiers", 35], ["coins", 10]]
    : [["weapon", 40 * gear], ["vehicle", (difficulty >= 2 ? 8 : 0) * gear], ["soldiers", 40], ["coins", 12]];
  const kind = pickWeighted(rng, w);
  if (kind === "weapon") return { kind: "weapon", weapon: weaponFor(difficulty + nextRandom(rng)) };
  if (kind === "vehicle") return { kind: "vehicle", vehicle: vehicleFor(rng, difficulty) };
  if (kind === "soldiers") return { kind: "soldiers", count: Math.max(5, Math.round(power * between(rng, 0.2, 0.45))) };
  return { kind: "coins", count: intBetween(rng, 10, 30) };
}
