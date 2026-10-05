import { SKILLED_BOT, botInput, type BotSkill } from "./bot";
import { createGame, step } from "./game";
import { campaignSpec, generateLevel, type SquadTrace } from "./levels";
import { VEHICLE_STATS, WEAPON_DPS } from "./constants";
import { PRESSURES } from "./pressures";
import type { LevelDef } from "./types";
import { NO_UPGRADES, expectedUpgrades, type Upgrades } from "./upgrades";

/** The pressures to try, hardest first: each a bit under the one before. */
export const PRESSURE_LADDER: number[] = Array.from({ length: 40 }, (_, i) => Math.round(16 * 0.88 ** i * 100) / 100);
/** How many times a bot plays a candidate level. */
const TRIALS = 5;
/** The first level that cannot be beaten without visiting the shop. */
export const SHOP_FROM_LEVEL = 3;
/** How many levels the first stretch is gentle: even a middling player gets through without upgrades. */
const GENTLE_LEVELS = 2;

/** Plays a level through with a bot and the given upgrades; true if it wins. */
function wins(level: LevelDef, seed: number, skill: BotSkill, upgrades: Upgrades): boolean {
  const state = createGame(level, seed, upgrades);
  for (let i = 0; i < 30 * 900 && state.status === "playing"; i++) step(state, botInput(state, skill));
  return state.status === "won";
}

/** How many of `TRIALS` plays the bot wins, giving up early once the count is out of reach of `needed`. */
function winCount(level: LevelDef, skill: BotSkill, upgrades: Upgrades, base: number, needed: number): number {
  let won = 0;
  for (let seed = 1; seed <= TRIALS && won + (TRIALS - seed + 1) >= needed; seed++) if (wins(level, seed * 7919 + base, skill, upgrades)) won++;
  return won;
}

/**
 * How strong a good player's squad really is, mile by mile: a good bot plays the level at an easy pressure with the
 * upgrades a typical player has, and its soldiers and damage per second are written down at every unit of road.
 */
export function measureSquad(n: number, upgrades: Upgrades, previous?: SquadTrace): SquadTrace {
  const spec = campaignSpec(n);
  const level = generateLevel({ ...spec, pressure: 0.6, trace: previous });
  const state = createGame(level, 7919 + spec.seed, upgrades);
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
 * How hard level `n` can be. A good player with the upgrades a typical player has by now must beat it (4 of 5), and the
 * same player without them must not (at most 2 of 5) from `SHOP_FROM_LEVEL` on: the pressure is nudged up while the
 * first still holds up (3 of 5) until the second is true. The first levels are different: gentle, no shop needed.
 */
export function calibratePressure(n: number): number {
  const spec = campaignSpec(n);
  const have = expectedUpgrades(n);
  const gentle = n <= GENTLE_LEVELS;
  // hordes and barrels are sized from the squad a good player really has here, so pressure means "how far past a fair fight"
  const trace = settledTrace(n, gentle ? NO_UPGRADES : have);
  const level = (pressure: number) => generateLevel({ ...spec, pressure, trace });
  const good = (pressure: number, needed: number) => winCount(level(pressure), SKILLED_BOT, gentle ? NO_UPGRADES : have, spec.seed, needed) >= needed;
  const without = (pressure: number) => winCount(level(pressure), SKILLED_BOT, NO_UPGRADES, spec.seed, 3) >= 3;
  // the gentle levels stay low whatever the bots can take
  const ladder = gentle ? PRESSURE_LADDER.filter((p) => p <= 1.2) : PRESSURE_LADDER;
  for (let i = 0; i < ladder.length; i++) {
    const p = ladder[i];
    if (!good(p, 4)) continue;
    if (gentle || !without(p)) return p;
    // it is beatable but the shop is not needed: make it harder as long as the player with the shop still manages
    for (let up = 1; up <= 3 && i - up >= 0; up++) {
      const harder = ladder[i - up];
      if (!good(harder, 3)) break;
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
