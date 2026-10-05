import {
  BARREL_RADIUS,
  COLUMN_HALF_WIDTH,
  BOSS_STANDOFF,
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
  SPIKES_HALF_WIDTH,
  SPIKES_KILL_SHARE,
  RUN_SPEED,
  VEHICLE_STATS,
  WEAPON_DPS,
} from "./constants";
import { squadHalfWidth } from "./game";
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

/** A number in [0, 1) that depends only on the gate. */
const hash = (id: number) => ((Math.imul(id, 2654435761) >>> 0) % 10007) / 10007;

/**
 * A player: heads for the best gate of the next pair, lines up with barrels when the road is clear,
 * and otherwise faces the horde.
 */
export function botInput(state: GameState, skill: BotSkill = SKILLED_BOT): Input {
  const { distance } = state;
  const ahead = (z: number, range: number) => z > distance && z - distance < range;

  const enemies = state.enemies.filter((e) => e.kind !== "boss" && ahead(e.z, FIRE_RANGE));
  const closest = enemies.length ? Math.min(...enemies.map((e) => e.z - distance)) : Infinity;

  // strips marked on the road (the boss's slam, a bomber's bombs): head for the spot the fewest of them cover
  if (skill.dodge && state.hazards.length) {
    // the strip that lands first is the one to be clear of now; the ones that land a moment later come after it
    const soonest = Math.min(...state.hazards.map((h) => h.ticks));
    const next = state.hazards.filter((h) => h.ticks <= soonest + 12);
    const half = squadHalfWidth(state.squad.count);
    const room = LANE_HALF_WIDTH - half;
    let best = state.squad.x;
    let bestCost = Infinity;
    for (let x = -room; x <= room + 1e-6; x += 0.4) {
      const cost = next.reduce((sum, h) => sum + (Math.abs(x - h.x) <= h.halfWidth + COLUMN_HALF_WIDTH + (half - 0.3) + 0.2 ? h.share * 10 : 0), 0) + Math.abs(x - state.squad.x) * 0.15;
      if (cost < bestCost) {
        bestCost = cost;
        best = x;
      }
    }
    return { move: 0, target: best };
  }

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
    if (pair.length > 1 && hash(best.id) < skill.mistakes) best = pair.find((g) => g !== best)!;
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
  if (boss && boss.z - distance <= BOSS_STANDOFF + 30) return { move: 0, target: 0 };
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
  const room = LANE_HALF_WIDTH - half;
  let best = squad.x;
  let bestCost = Infinity;
  for (let x = -room; x <= room + 1e-6; x += 0.4) {
    let cost = Math.abs(x - squad.x) * 0.1;
    for (const t of near) {
      const reach = t.kind === "spikes" ? SPIKES_HALF_WIDTH : MINE_RADIUS;
      if (Math.abs(x - t.x) <= reach + half + 0.2) cost += t.kind === "spikes" ? SPIKES_KILL_SHARE * 10 : MINE_KILL_SHARE * 10;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = x;
    }
  }
  return bestCost > 0.5 || Math.abs(best - squad.x) > 0.3 ? best : null;
}
