import {
  BARREL_RADIUS,
  COLUMN_HALF_WIDTH,
  BOSS_STANDOFF,
  FIRE_BURN_SHARE,
  ENEMY_STATS,
  FIRE_RANGE,
  GATE_MAX_VALUE,
  GATE_MUL_MAX_VALUE,
  GATE_MUL_STEP_DAMAGE,
  GATE_STEP_DAMAGE,
  GATE_STEP_GROWTH,
  LANE_HALF_WIDTH,
  MAX_VEHICLES,
  MINE_KILL_SHARE,
  MINE_RADIUS,
  PROJECTILE_STATS,
  TICK_RATE,
  SPIKES_HALF_WIDTH,
  SPIKES_KILL_SHARE,
  RUN_SPEED,
  VEHICLE_STATS,
  WEAPON_DPS,
} from "./constants";
import { columnXs, squadColumns, squadHalfWidth, ticksToLand } from "./game";
import { WEAPON_KINDS, type Barrel, type Gate, type GameState, type Input } from "./types";

/** The barrel is worth a detour only while the nearest enemy is farther than this (units). */
const SAFE_DISTANCE = 18;

/** An input that does nothing: the squad stays put and shoots straight ahead. */
export const IDLE: Input = { move: 0, target: null };

/** How well a bot plays. */
export interface BotSkill {
  /** counts on shooting a gate up while approaching it, not only on the number it shows now */
  pump: boolean;
  /** share of gate choices it gets wrong, decided by the gate itself so the same level always plays the same */
  mistakes: number;
  /** steps out of the strips the boss and the bombers mark on the road, and steers around traps */
  dodge: boolean;
  /** changes which gates it misjudges: a person does not make the same slip on every try (0 for the calibration) */
  slips?: number;
}

/** Plays the way the tests expect a good player to. */
export const SKILLED_BOT: BotSkill = { pump: true, mistakes: 0, dodge: true };
/** Reads the numbers on the gates and nothing more, and misjudges one choice in four. */
export const AVERAGE_BOT: BotSkill = { pump: false, mistakes: 0.35, dodge: false };

/** What shooting does to a gate: its value after `damage` more points of hits. */
function pumped(g: Gate, damage: number): number {
  let value = g.value;
  let progress = g.progress + damage;
  const max = g.op === "mul" ? GATE_MUL_MAX_VALUE : GATE_MAX_VALUE;
  for (;;) {
    const step = g.op === "mul" ? GATE_MUL_STEP_DAMAGE : GATE_STEP_DAMAGE * (1 + Math.max(0, value) / GATE_STEP_GROWTH);
    if (value >= max || progress < step) return value;
    progress -= step;
    value++;
  }
}

/** What a gate is worth to the squad if it goes through it: soldiers gained or lost. `shotUp` counts on the fire it takes on the way. */
function worth(state: GameState, g: Gate, shotUp: boolean): number {
  if (g.op === "div") return -state.squad.count * (1 - 1 / g.value);
  if (g.locked) shotUp = false;
  let value = g.value;
  if (shotUp) {
    const { squad } = state;
    const seconds = Math.max(0, (g.z - state.distance) / RUN_SPEED);
    // only the columns over the gate's lane shoot it; a big squad spills over into the next lane
    const share = Math.min(1, LANE_HALF_WIDTH / Math.max(0.5, squadHalfWidth(squad.count) * 1.4));
    const vehicles = squad.vehicles.reduce((sum, v) => sum + VEHICLE_STATS[v].dps, 0) * 0.5;
    const dps = (squad.count * WEAPON_DPS[squad.weapon] * share + vehicles) * state.damageMul;
    value = pumped(g, dps * seconds);
  }
  return g.op === "mul" ? state.squad.count * (value - 1) : value;
}

/** How much a barrel's reward is worth to the squad right now. */
function barrelValue(state: GameState, b: Barrel): number {
  const r = b.reward;
  if (r.kind === "weapon") return WEAPON_KINDS.indexOf(r.weapon) > WEAPON_KINDS.indexOf(state.squad.weapon) ? 40 + WEAPON_DPS[r.weapon] : 0;
  if (r.kind === "vehicle") return state.squad.vehicles.length < MAX_VEHICLES ? 30 + VEHICLE_STATS[r.vehicle].dps / 4 : 0;
  if (r.kind === "soldiers") return r.count;
  return 1;
}

/** A number in [0, 1) that depends only on the gate (and on `slips`). */
const hash = (id: number, slips = 0) => ((Math.imul(id + slips * 7919, 2654435761) >>> 0) % 10007) / 10007;

/** How much the bot minds standing in fire, against a blow that lands (`share` × 10). */
const FIRE_DREAD = FIRE_BURN_SHARE * 30;

/** Whether a squad centred at `x` has soldiers in the strip `at ± halfWidth`. */
const overlaps = (state: GameState, x: number, at: number, halfWidth: number) => Math.abs(x - at) <= halfWidth + COLUMN_HALF_WIDTH + (squadHalfWidth(state.squad.count) - 0.3) + 0.2;

/** The spot across the road where `cost` is lowest, looked at every 0.4 units of the room the squad has. */
function bestSpot(state: GameState, cost: (x: number) => number): { x: number; cost: number } {
  const room = LANE_HALF_WIDTH - squadHalfWidth(state.squad.count);
  let best = { x: state.squad.x, cost: Infinity };
  for (let x = -room; x <= room + 1e-6; x += 0.4) {
    const c = cost(x);
    if (c < best.cost) best = { x, cost: c };
  }
  return best;
}

/**
 * Where to stand to get out of what is about to hit: the marked strips, and the missiles and kegs that the squad,
 * standing there, could not shoot down before they land. A wide squad that cannot get clear of a row of kegs is better
 * off under the one it can break. Null when nothing is coming.
 */
function dodge(state: GameState): number | null {
  const { hazards, projectiles, squad } = state;
  if (!hazards.length && !projectiles.length) return null;
  // the blow that lands first is the one to be clear of now; the ones that land a moment later come after it
  const landing = projectiles.map((p) => ({ p, ticks: ticksToLand(state, p) }));
  const soonest = Math.min(...hazards.map((h) => h.ticks), ...landing.map((l) => l.ticks));
  const marks = hazards.filter((h) => h.ticks <= soonest + 12);
  const flying = landing.filter((l) => l.ticks <= soonest + 12);
  const perColumn = (squad.count / squadColumns(squad.count)) * WEAPON_DPS[squad.weapon] * state.damageMul;
  /** what the missiles and kegs on their way would cost a squad standing at `x`: the ones it could not shoot down from there */
  const flyingCost = (x: number) => {
    let cost = 0;
    const columns = columnXs(x, squad.count);
    for (const { p, ticks } of flying) {
      const stats = PROJECTILE_STATS[p.kind];
      // a column shoots it only if no minion stands in front of it: the nearest thing in a column takes the fire
      const clear = (c: number) => !state.enemies.some((e) => e.kind !== "boss" && e.z > state.distance && e.z < p.z && Math.abs(e.x - c) <= COLUMN_HALF_WIDTH + ENEMY_STATS[e.kind].radius);
      const under = columns.filter((c) => Math.abs(c - p.x) <= COLUMN_HALF_WIDTH + stats.radius && clear(c)).length;
      if (under * perColumn * (ticks / TICK_RATE) > p.hp * 1.3) continue;
      if (overlaps(state, x, p.targetX, stats.blast)) cost += stats.share * 10;
    }
    return cost;
  };
  // nothing marked and nothing on its way would land where the squad stands: carry on with the plan
  if (!marks.length && (!flying.length || flyingCost(squad.x) === 0)) return null;
  return bestSpot(state, (x) => {
    let cost = marks.reduce((sum, h) => sum + (overlaps(state, x, h.x, h.halfWidth) ? h.share * 10 : 0), 0) + Math.abs(x - squad.x) * 0.15;
    if (flying.length) cost += flyingCost(x);
    for (const f of state.fires) if (overlaps(state, x, f.x, f.halfWidth)) cost += FIRE_DREAD;
    return cost;
  }).x;
}

/** The spot closest to `target` that keeps the squad out of the fire on the road, or the least burning one. */
function clearOfFire(state: GameState, target: number): number {
  return bestSpot(state, (x) => {
    let burning = 0;
    for (const f of state.fires) if (overlaps(state, x, f.x, f.halfWidth)) burning++;
    return burning * 100 + Math.abs(x - target);
  }).x;
}

/**
 * A player: gets out of whatever is about to hit the squad, heads for the best gate of the next pair, lines up with
 * barrels when the road is clear, and otherwise faces the horde, keeping out of the fire.
 */
export function botInput(state: GameState, skill: BotSkill = SKILLED_BOT): Input {
  if (!skill.dodge) return plan(state, skill);
  const away = dodge(state);
  if (away !== null) return { move: 0, target: away };
  const input = plan(state, skill);
  return state.fires.length ? { move: 0, target: clearOfFire(state, input.target ?? state.squad.x) } : input;
}

/** What to do when nothing is about to hit the squad. */
function plan(state: GameState, skill: BotSkill): Input {
  const { distance } = state;
  const ahead = (z: number, range: number) => z > distance && z - distance < range;

  const enemies = state.enemies.filter((e) => e.kind !== "boss" && ahead(e.z, FIRE_RANGE));
  const closest = enemies.length ? Math.min(...enemies.map((e) => e.z - distance)) : Infinity;

  // the gate to head for: the best of the next pair
  const gates = state.gates.filter((g) => !g.used && ahead(g.z, 22));
  let gateLane: number | null = null;
  let gateGap = Infinity;
  if (gates.length) {
    const nearest = Math.min(...gates.map((g) => g.z));
    const pair = gates.filter((g) => g.z === nearest);
    const score = (g: Gate) => Math.max(worth(state, g, false), skill.pump ? worth(state, g, true) : -Infinity);
    let best = pair.reduce((a, b) => (score(b) > score(a) ? b : a));
    // a slip of judgement: take the other lane
    if (pair.length > 1 && hash(best.id, skill.slips) < skill.mistakes) best = pair.find((g) => g !== best)!;
    gateLane = best.x;
    gateGap = nearest - distance;
  }
  // a gate that is about to be crossed comes first; with a horde on top of the squad, facing it comes before heading for a gate far off
  if (gateLane !== null && gateGap < 8) return { move: 0, target: gateLane };
  // traps ahead: steer to the lane that costs the least, shooting mines on the way when there is time
  const trap = skill.dodge ? nearestTrap(state) : null;
  if (trap) return { move: 0, target: trap };

  if (gateLane !== null && closest > 16) return { move: 0, target: gateLane };

  const boss = state.enemies.find((e) => e.kind === "boss");
  // with the horde still far off, open the barrel first: its reward is worth more than a head start on the shooting
  const cluster = state.barrels.filter((b) => ahead(b.z, FIRE_RANGE));
  const front = cluster.length ? Math.min(...cluster.map((b) => b.z)) : 0;
  const barrel = cluster.filter((b) => Math.abs(b.z - front) < 1.5).reduce<Barrel | undefined>((best, b) => (!best || barrelValue(state, b) > barrelValue(state, best) ? b : best), undefined);
  if (barrel && closest > SAFE_DISTANCE) return { move: 0, target: Math.max(-LANE_HALF_WIDTH, Math.min(LANE_HALF_WIDTH, barrel.x)) };

  if (enemies.length) {
    // a barrel in the lane would soak up the fire meant for the horde behind it: step out of its way
    if (skill.dodge && closest < 20) {
      const half = squadHalfWidth(state.squad.count);
      const room = LANE_HALF_WIDTH - half;
      const blocking = state.barrels.find((b) => b.hp > 0 && ahead(b.z, closest + 1) && Math.abs(b.x - state.squad.x) < BARREL_RADIUS + half + 0.3);
      if (blocking) return { move: 0, target: Math.max(-room, Math.min(room, blocking.x >= state.squad.x ? blocking.x - BARREL_RADIUS - half - 0.5 : blocking.x + BARREL_RADIUS + half + 0.5)) };
    }
    // the closest threat, weighted by how hard it hits
    const hit = (e: GameState["enemies"][number]) => Math.max(1, ENEMY_STATS[e.kind].damage || 3);
    const threat = enemies.reduce((a, b) => ((b.z - distance) / hit(b) < (a.z - distance) / hit(a) ? b : a));
    return { move: 0, target: threat.x };
  }
  // in front of the boss, stand where the shots get through: the opening in the Mecha's shield, or the middle
  if (boss && boss.z - distance <= BOSS_STANDOFF + 30) return { move: 0, target: state.bossFight?.gap ?? 0 };
  return IDLE;
}

/** The x to head for to run clear of the traps in the next stretch, or null when there are none to worry about. */
function nearestTrap(state: GameState): number | null {
  const { distance, squad } = state;
  const near = state.traps.filter((t) => !t.used && t.z > distance && t.z - distance < 15 && !(t.kind === "mine" && t.hp <= 0));
  if (!near.length) return null;
  // a mine still far off is better shot than avoided; the squad shoots it as it goes
  const mines = near.filter((t) => t.kind === "mine" && t.z - distance > 9);
  if (mines.length === near.length) return null;
  const half = squadHalfWidth(squad.count);
  const best = bestSpot(state, (x) => {
    let cost = Math.abs(x - squad.x) * 0.1;
    for (const t of near) {
      const reach = t.kind === "spikes" ? SPIKES_HALF_WIDTH : MINE_RADIUS;
      if (Math.abs(x - t.x) <= reach + half + 0.2) cost += t.kind === "spikes" ? SPIKES_KILL_SHARE * 10 : MINE_KILL_SHARE * 10;
    }
    return cost;
  });
  return best.cost > 0.5 || Math.abs(best.x - squad.x) > 0.3 ? best.x : null;
}
