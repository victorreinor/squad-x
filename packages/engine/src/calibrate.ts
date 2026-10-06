import { SKILLED_BOT, botInput, type BotSkill } from "./bot";
import { createGame, step } from "./game";
import { campaignSpec, generateLevel, type SquadTrace } from "./levels";
import { VEHICLE_STATS, WEAPON_DPS } from "./constants";
import { PRESSURES } from "./pressures";
import type { LevelDef } from "./types";
import { NO_UPGRADES, SHOP_FROM_LEVEL, expectedUpgrades, type Upgrades } from "./upgrades";

/** The pressures to try, hardest first: each a bit under the one before. */
export const PRESSURE_LADDER: number[] = Array.from({ length: 40 }, (_, i) => Math.round(16 * 0.88 ** i * 100) / 100);
/** How many times a bot plays a candidate level: enough that a target like "half the tries" is not decided by luck. */
const TRIALS = 8;
/**
 * A boss level is played more: its fight is nearly all or nothing, and going down the ladder with 8 tries found a
 * pressure where the good player happened to win 6 of those 8 and won 44% of other tries.
 */
const BOSS_TRIALS = 48;
/** How many levels the first stretch is gentle: even a middling player gets through without upgrades. */
const GENTLE_LEVELS = 2;
/**
 * The share of its tries a good player with the expected upgrades must win: the campaign asks for persistence, so a
 * level usually takes more than one go. The first levels are gentle. A boss fight is a cliff: the squad that arrives a
 * little short of the good player's loses every time, so a boss level must leave the good player a wide margin.
 */
const WIN_SHARE = { gentle: 0.75, level: 0.45, boss: 0.85 };
/** The player without the upgrades counts as getting through when they win this share of the tries: then the level is made harder. */
const WITHOUT_SHARE = 0.4;

/** Plays a level through with a bot and the given upgrades; true if it wins. */
function wins(level: LevelDef, seed: number, skill: BotSkill, upgrades: Upgrades): boolean {
  const state = createGame(level, seed, upgrades);
  for (let i = 0; i < 30 * 900 && state.status === "playing"; i++) step(state, botInput(state, skill));
  return state.status === "won";
}

/** How many of `trials` plays the bot wins, giving up early once the count is out of reach of `needed`. */
function winCount(level: LevelDef, skill: BotSkill, upgrades: Upgrades, base: number, needed: number, trials: number): number {
  let won = 0;
  for (let seed = 1; seed <= trials && won + (trials - seed + 1) >= needed; seed++) if (wins(level, seed * 7919 + base, skill, upgrades)) won++;
  return won;
}

/** How many runs the squad is measured on: the trace is their median, so one run that went badly does not shape the level. */
const TRACE_RUNS = 3;

/**
 * How strong a good player's squad really is, mile by mile: a good bot plays the level at an easy pressure with the
 * upgrades a typical player has, a few times, and its soldiers and damage per second are written down at every unit of
 * road; the trace is the median of the runs at each unit.
 */
export function measureSquad(n: number, upgrades: Upgrades, previous?: SquadTrace): SquadTrace {
  const spec = campaignSpec(n);
  const level = generateLevel({ ...spec, pressure: 0.6, trace: previous });
  const runs = Array.from({ length: TRACE_RUNS }, (_, k) => traceRun(level, (k + 1) * 7919 + spec.seed, upgrades));
  const length = Math.max(...runs.map((r) => r.count.length));
  const median = (pick: (r: SquadTrace) => number[], at: number) => runs.map((r) => pick(r)[Math.min(at, pick(r).length - 1)]).sort((a, b) => a - b)[Math.floor(TRACE_RUNS / 2)];
  return {
    count: Array.from({ length }, (_, at) => median((r) => r.count, at)),
    fire: Array.from({ length }, (_, at) => median((r) => r.fire, at)),
  };
}

/** One run of a good bot on `level`, its soldiers and damage per second written down at every unit of road. */
function traceRun(level: LevelDef, seed: number, upgrades: Upgrades): SquadTrace {
  const state = createGame(level, seed, upgrades);
  const count: number[] = [];
  const fire: number[] = [];
  for (let i = 0; i < 30 * 900 && state.status === "playing"; i++) {
    step(state, botInput(state, SKILLED_BOT));
    const at = Math.floor(state.distance);
    if (count[at] === undefined) {
      const { squad } = state;
      count[at] = squad.count;
      fire[at] = (squad.count * WEAPON_DPS[squad.weapon] + squad.vehicles.reduce((sum, v) => sum + VEHICLE_STATS[v].dps, 0)) * state.damageMul;
    }
  }
  // holes (the squad stood still in front of a boss) and the road past the end take the last value
  for (let at = 0; at < Math.max(count.length, level.length + 80); at++) {
    if (count[at] === undefined) {
      count[at] = count[at - 1] ?? level.startSquad;
      fire[at] = fire[at - 1] ?? WEAPON_DPS[level.startWeapon] * level.startSquad;
    }
  }
  return { count, fire };
}

/**
 * The squad trace of level `n` once it has settled. The gates are sized from the trace, and the trace comes from playing
 * the gates, so one measurement describes a level that no longer exists: measure again on the level it produced, a few times.
 */
export function settledTrace(n: number, upgrades: Upgrades): SquadTrace {
  let trace = measureSquad(n, upgrades);
  for (let i = 0; i < 3; i++) trace = measureSquad(n, upgrades, trace);
  return trace;
}

/**
 * How hard level `n` can be. A good player with the upgrades a typical player has by now must win `WIN_SHARE` of the
 * tries (4 of 8; 6 of 8 in the first levels, 18 of 24 for a boss), and the same player without them must not
 * get through (fewer than 4 of 8, or 10 of 24) from `SHOP_FROM_LEVEL` on: the pressure is nudged up while the first still
 * holds up a little lower until the second is true. The first levels are different: gentle, no shop needed.
 */
export function calibratePressure(n: number): number {
  const spec = campaignSpec(n);
  const have = expectedUpgrades(n);
  const gentle = n <= GENTLE_LEVELS;
  // hordes and barrels are sized from the squad a good player really has here, so pressure means "how far past a fair fight"
  const trace = settledTrace(n, gentle ? NO_UPGRADES : have);
  const level = (pressure: number) => generateLevel({ ...spec, pressure, trace });
  const trials = spec.boss ? BOSS_TRIALS : TRIALS;
  const share = gentle ? WIN_SHARE.gentle : spec.boss ? WIN_SHARE.boss : WIN_SHARE.level;
  const most = Math.ceil(trials * share);
  const some = Math.ceil(trials * (share - 0.15));
  const enough = Math.ceil(trials * WITHOUT_SHARE);
  const good = (pressure: number, needed: number) => winCount(level(pressure), SKILLED_BOT, gentle ? NO_UPGRADES : have, spec.seed, needed, trials) >= needed;
  const without = (pressure: number) => winCount(level(pressure), SKILLED_BOT, NO_UPGRADES, spec.seed, enough, trials) >= enough;
  // the gentle levels stay low whatever the bots can take
  const ladder = gentle ? PRESSURE_LADDER.filter((p) => p <= 1.2) : PRESSURE_LADDER;
  for (let i = 0; i < ladder.length; i++) {
    const p = ladder[i];
    if (!good(p, most)) continue;
    if (gentle || !without(p)) return p;
    // it is beatable but the shop is not needed: make it harder as long as the player with the shop still manages
    for (let up = 1; up <= 3 && i - up >= 0; up++) {
      const harder = ladder[i - up];
      if (!good(harder, some)) break;
      if (!without(harder)) return harder;
    }
    return p;
  }
  return ladder[ladder.length - 1];
}

/** Level `n` of the campaign, at the pressure and squad trace the table says (or the standard ones for a level the table does not know). */
export function campaignLevel(n: number): LevelDef {
  const known = PRESSURES[n];
  if (!known) return generateLevel({ ...campaignSpec(n), pressure: 1 });
  return generateLevel({ ...campaignSpec(n), pressure: known.pressure, trace: { count: known.count, fire: known.fire } });
}
