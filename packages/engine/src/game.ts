import {
  BARREL_RADIUS,
  BOMBER_BLAST_SOLDIERS,
  BOMBER_SPLASH_DAMAGE,
  BOMBER_SPLASH_RADIUS,
  BOSS_ACTIVE_RANGE,
  BOSS_SLAM_HALF_WIDTH,
  BOSS_SLAM_INTERVAL,
  BOSS_SLAM_KILL_SHARE,
  BOSS_SLAM_WARN,
  BOSS_STANDOFF,
  BOSS_SUMMON_COUNT,
  BOSS_SUMMON_INTERVAL,
  COLUMN_HALF_WIDTH,
  COLUMN_SPACING,
  CONTACT_DISTANCE,
  ENEMY_STATS,
  ENEMY_STEER,
  ENEMY_STEER_RANGE,
  FIRE_RANGE,
  GATE_MAX_VALUE,
  GATE_MUL_MAX_VALUE,
  GATE_MUL_STEP_DAMAGE,
  GATE_STEP_DAMAGE,
  GATE_STEP_GROWTH,
  MINE_HP,
  MINE_KILL_SHARE,
  MINE_RADIUS,
  SPIKES_HALF_WIDTH,
  SPIKES_KILL_SHARE,
  STRIKE_CORRIDOR_REACH,
  STRIKE_CORRIDORS,
  STRIKE_HALF_WIDTH,
  STRIKE_KILL_SHARE,
  STRIKE_WARN,
  LANE_HALF_WIDTH,
  MAX_COLUMNS,
  MAX_SQUAD,
  MAX_VEHICLES,
  RUN_SPEED,
  SHOOTER_FIRE_INTERVAL,
  SHOOTER_RANGE,
  SPAWN_AHEAD,
  STRAFE_SPEED,
  TICK_RATE,
  VEHICLE_COLUMN_HALF_WIDTH,
  VEHICLE_GAP,
  VEHICLE_STATS,
  WAVE_ROW_SPACING,
  WEAPON_DPS,
} from "./constants";
import { nextRandom } from "./rng";
import { NO_UPGRADES, bonusSoldiers, damageMultiplier, lossMultiplier, type Upgrades } from "./upgrades";
import { WEAPON_KINDS, type Enemy, type EnemyKind, type GameState, type Hazard, type Input, type LevelDef, type Reward, type WaveDef } from "./types";

/** How many firing columns a squad of this size spreads into. */
export const squadColumns = (count: number) => Math.max(1, Math.min(MAX_COLUMNS, Math.ceil(Math.sqrt(count))));

/** Half the width the squad takes across the road (units). */
export const squadHalfWidth = (count: number) => ((squadColumns(count) - 1) * COLUMN_SPACING) / 2 + 0.3;

/** The x of every firing column, left to right. */
export function columnXs(x: number, count: number): number[] {
  const cols = squadColumns(count);
  return Array.from({ length: cols }, (_, i) => x + (i - (cols - 1) / 2) * COLUMN_SPACING);
}

/**
 * The x of every vehicle: they take turns on the right and the left of the squad, each pair a step further out,
 * and never leave the road.
 */
export function vehicleXs(x: number, count: number, vehicles: number): number[] {
  const half = squadHalfWidth(count);
  return Array.from({ length: vehicles }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const out = half + VEHICLE_GAP + Math.floor(i / 2) * VEHICLE_GAP;
    return Math.max(-LANE_HALF_WIDTH + 0.6, Math.min(LANE_HALF_WIDTH - 0.6, x + side * out));
  });
}

/** How many soldiers stand in column `i` (the first columns take the remainder). */
const soldiersInColumn = (count: number, i: number) => {
  const cols = squadColumns(count);
  return Math.floor(count / cols) + (i < count % cols ? 1 : 0);
};

/** A fresh run of `level`, with whatever the player has bought. */
export function createGame(level: LevelDef, seed: number, upgrades: Upgrades = NO_UPGRADES): GameState {
  const state: GameState = {
    tick: 0,
    rng: seed >>> 0,
    status: "playing",
    distance: 0,
    squad: { x: 0, count: Math.min(MAX_SQUAD, level.startSquad + bonusSoldiers(upgrades)), weapon: level.startWeapon, vehicles: [] },
    gates: [],
    barrels: [],
    traps: [],
    pendingEvents: [...level.events].sort((a, b) => a.at - b.at),
    enemies: [],
    pending: [...level.waves].sort((a, b) => a.at - b.at),
    losses: 0,
    coins: 0,
    damageMul: damageMultiplier(upgrades),
    lossMul: lossMultiplier(upgrades),
    lossCarry: 0,
    nextId: 1,
    length: level.length,
    theme: level.theme,
    lastGate: null,
    volleys: [],
    enemyShots: [],
    hazards: [],
    lastSlam: null,
    lastImpact: null,
    popped: [],
    plane: null,
  };
  for (const g of level.gates) state.gates.push({ ...g, id: state.nextId++, progress: 0, used: false });
  for (const b of level.barrels) state.barrels.push({ ...b, id: state.nextId++, maxHp: b.hp });
  for (const t of level.traps) state.traps.push({ ...t, id: state.nextId++, hp: t.kind === "mine" ? MINE_HP : 0, used: false });
  // the boss is on the road from the start, so the player sees it waiting far ahead
  if (level.boss) spawnGroup(state, "boss", 1, 0, 0, level.boss.z, level.boss.hp);
  return state;
}

/** Put `count` enemies of one kind on the road at `z`: rows, a little scattered. */
function spawnGroup(state: GameState, kind: EnemyKind, count: number, centre: number, spread: number, z: number, hp?: number) {
  const stats = ENEMY_STATS[kind];
  const perRow = Math.max(1, Math.min(count, Math.floor(spread / 0.9) + 1));
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const jitterX = (nextRandom(state) - 0.5) * 0.3;
    const jitterZ = (nextRandom(state) - 0.5) * 0.6;
    const spreadX = perRow > 1 ? (col / (perRow - 1) - 0.5) * spread : 0;
    const x = Math.max(-LANE_HALF_WIDTH + stats.radius, Math.min(LANE_HALF_WIDTH - stats.radius, centre + spreadX + jitterX));
    const maxHp = hp ?? stats.hp;
    state.enemies.push({
      id: state.nextId++,
      kind,
      x,
      z: z + row * WAVE_ROW_SPACING + jitterZ,
      hp: maxHp,
      maxHp,
      cooldown: kind === "shooter" ? SHOOTER_FIRE_INTERVAL : 0,
      summon: kind === "boss" ? BOSS_SUMMON_INTERVAL / 2 : 0,
    });
  }
}

function spawnWave(state: GameState, wave: WaveDef) {
  spawnGroup(state, wave.kind, wave.count, wave.x, wave.spread, wave.at + (wave.ahead ?? SPAWN_AHEAD), wave.hp);
}

function giveReward(state: GameState, reward: Reward) {
  if (reward.kind === "weapon") {
    if (WEAPON_KINDS.indexOf(reward.weapon) > WEAPON_KINDS.indexOf(state.squad.weapon)) state.squad.weapon = reward.weapon;
  } else if (reward.kind === "vehicle") {
    if (state.squad.vehicles.length < MAX_VEHICLES) state.squad.vehicles.push(reward.vehicle);
  } else if (reward.kind === "soldiers") {
    state.squad.count = Math.min(MAX_SQUAD, state.squad.count + reward.count);
  } else {
    state.coins += reward.count;
  }
}

/** Take `n` soldiers from the squad, less what the armour upgrade saves. Returns how many were actually lost. */
function loseSoldiers(state: GameState, n: number) {
  // the armour spares a share of every hit; the fractions that cannot be split add up until they make a soldier
  const owed = n * state.lossMul + state.lossCarry;
  const wanted = Math.floor(owed + 1e-9);
  state.lossCarry = owed - wanted;
  const lost = Math.min(wanted, state.squad.count);
  state.squad.count -= lost;
  state.losses += lost;
  if (state.squad.count <= 0) state.status = "lost";
  return lost;
}

/** How many soldiers stand in the columns that a strip `x ± half` touches. */
function soldiersInStrip(state: GameState, x: number, half: number): number {
  let total = 0;
  columnXs(state.squad.x, state.squad.count).forEach((cx, i) => {
    if (Math.abs(cx - x) <= half + COLUMN_HALF_WIDTH) total += soldiersInColumn(state.squad.count, i);
  });
  return total;
}

/**
 * What a column hits: the first enemy or barrel in front of it, so a barrel in the lane shields the enemies behind
 * it until it breaks. A gate is not in the way: it only takes the fire when nothing else is in the column.
 * `pierce` ignores armor.
 */
type Target = { z: number; apply: (damage: number, pierce: boolean) => void };

function firstTarget(state: GameState, x: number, half = COLUMN_HALF_WIDTH): Target | null {
  const { distance } = state;
  const reach = distance + FIRE_RANGE;
  const ahead = (z: number) => z > distance && z <= reach;
  const nearest = (things: Target[]) => things.reduce<Target | null>((best, t) => (!best || t.z < best.z ? t : best), null);

  const blockers: Target[] = [];
  for (const e of state.enemies) {
    const stats = ENEMY_STATS[e.kind];
    if (e.hp <= 0 || !ahead(e.z) || Math.abs(e.x - x) > half + stats.radius) continue;
    blockers.push({ z: e.z, apply: (damage, pierce) => void (e.hp -= pierce ? damage : damage * stats.armor) });
  }
  for (const b of state.barrels) {
    if (b.hp <= 0 || !ahead(b.z) || Math.abs(b.x - x) > half + BARREL_RADIUS) continue;
    blockers.push({ z: b.z, apply: (damage) => void (b.hp -= damage) });
  }
  for (const t of state.traps) {
    if (t.kind !== "mine" || t.hp <= 0 || t.used || !ahead(t.z) || Math.abs(t.x - x) > half + 0.5) continue;
    blockers.push({ z: t.z, apply: (damage) => void (t.hp -= damage) });
  }
  const hit = nearest(blockers);
  if (hit) return hit;

  const gates: Target[] = [];
  for (const g of state.gates) {
    if (g.used || g.locked || !ahead(g.z) || x < g.x - g.width / 2 || x >= g.x + g.width / 2) continue;
    gates.push({
      z: g.z,
      apply: (damage) => {
        const max = g.op === "mul" ? GATE_MUL_MAX_VALUE : GATE_MAX_VALUE;
        g.progress += damage;
        for (;;) {
          const step = g.op === "mul" ? GATE_MUL_STEP_DAMAGE : GATE_STEP_DAMAGE * (1 + Math.max(0, g.value) / GATE_STEP_GROWTH);
          if (g.value >= max || g.progress < step) break;
          g.progress -= step;
          g.value++;
        }
      },
    });
  }
  return nearest(gates);
}

/** Add a gate's effect to the squad. */
function applyGate(state: GameState, id: number) {
  const g = state.gates.find((gate) => gate.id === id)!;
  const before = state.squad.count;
  if (g.op === "add") state.squad.count = Math.min(MAX_SQUAD, before + g.value);
  else if (g.op === "mul") state.squad.count = Math.min(MAX_SQUAD, before * g.value);
  else state.squad.count = Math.max(1, Math.ceil(before / g.value));
  // soldiers a gate takes count as losses too: they cost stars
  if (state.squad.count < before) state.losses += before - state.squad.count;
  const good = state.squad.count >= before;
  const text = g.op === "add" ? (g.value >= 0 ? `+${g.value}` : `${g.value}`) : g.op === "mul" ? `×${g.value}` : `÷${g.value}`;
  state.lastGate = { id: g.id, text, good, tick: state.tick };
  if (state.squad.count <= 0) {
    state.squad.count = 0;
    state.status = "lost";
  }
}

/** Remove enemies whose hit points ran out; a bomber going off can finish off its neighbours, so keep going until it settles. */
function removeDead(state: GameState) {
  for (;;) {
    const dead = state.enemies.filter((e) => e.hp <= 0);
    if (!dead.length) return;
    state.enemies = state.enemies.filter((e) => e.hp > 0);
    for (const e of dead) {
      if (e.kind !== "bomber") continue;
      for (const other of state.enemies) if (Math.hypot(other.x - e.x, other.z - e.z) <= BOMBER_SPLASH_RADIUS) other.hp -= BOMBER_SPLASH_DAMAGE;
    }
  }
}

/** The boss, if it is still on the road. */
const bossOf = (state: GameState) => state.enemies.find((e) => e.kind === "boss");

/** Let one enemy act: walk, shoot, slam or blow up. Returns false when it is gone. */
function actEnemy(state: GameState, e: Enemy): boolean {
  const stats = ENEMY_STATS[e.kind];
  const squad = state.squad;
  const gap = e.z - state.distance;

  if (e.kind === "boss") {
    if (gap > BOSS_ACTIVE_RANGE) return true;
    if (e.cooldown > 0) e.cooldown--;
    else if (!state.hazards.some((h) => h.kind === "slam")) {
      // the strip is marked where the squad stands now; it has the warning time to get out of it
      state.hazards.push({ id: state.nextId++, kind: "slam", x: squad.x, halfWidth: BOSS_SLAM_HALF_WIDTH, ticks: BOSS_SLAM_WARN, share: BOSS_SLAM_KILL_SHARE });
      e.cooldown = BOSS_SLAM_INTERVAL;
    }
    if (e.summon > 0) e.summon--;
    else {
      spawnGroup(state, "runner", BOSS_SUMMON_COUNT, 0, 5, e.z - 3);
      e.summon = BOSS_SUMMON_INTERVAL;
    }
    return true;
  }

  if (e.kind === "shooter") {
    // walks up to its firing range, backs away when the squad closes in, and fights hand to hand when caught
    if (gap > SHOOTER_RANGE) e.z -= stats.speed / TICK_RATE;
    else if (gap < SHOOTER_RANGE - 2) e.z += stats.speed / TICK_RATE;
    if (gap <= CONTACT_DISTANCE) {
      loseSoldiers(state, 1);
      return false;
    }
    if (gap > SHOOTER_RANGE) return true;
    if (e.cooldown > 0) e.cooldown--;
    else {
      e.cooldown = SHOOTER_FIRE_INTERVAL;
      loseSoldiers(state, 1);
      state.enemyShots.push({ x: e.x, z: e.z });
    }
    return true;
  }

  e.z -= stats.speed / TICK_RATE;
  if (gap < ENEMY_STEER_RANGE) {
    const steer = ENEMY_STEER / TICK_RATE;
    e.x += Math.max(-steer, Math.min(steer, squad.x - e.x));
  }
  const touching = e.z - state.distance <= CONTACT_DISTANCE && Math.abs(e.x - squad.x) <= squadHalfWidth(squad.count) + stats.radius + 0.3;
  if (touching) {
    loseSoldiers(state, e.kind === "bomber" ? BOMBER_BLAST_SOLDIERS : stats.damage);
    return false;
  }
  return e.z > state.distance - 2;
}

/** Count down the marked strips (the boss's slam, a bomber's bombs) and smash the ones that run out. */
function resolveHazards(state: GameState) {
  state.hazards = state.hazards.filter((h: Hazard) => {
    if (--h.ticks > 0) return true;
    const lost = loseSoldiers(state, Math.ceil(soldiersInStrip(state, h.x, h.halfWidth) * h.share));
    if (h.kind === "slam") state.lastSlam = { x: h.x, tick: state.tick, lost };
    else state.lastImpact = { kind: "bomb", x: h.x, z: state.distance + 8, tick: state.tick, lost };
    return false;
  });
}

/** Start an air strike: the plane flies over and marks one strip after another, each smashed a moment after it is marked. */
function stepEvents(state: GameState) {
  while (state.pendingEvents.length && state.pendingEvents[0].at <= state.distance) {
    const ev = state.pendingEvents.shift()!;
    if (ev.kind === "airstrike") state.plane = { t: 0, bombs: ev.bombs };
  }
  const plane = state.plane;
  if (!plane) return;
  const before = plane.t;
  plane.t += 1 / (TICK_RATE * 2.6);
  // one pass of bombs per slice of the flight: they fall on both sides of a safe corridor, so there is always a way through
  for (let i = 0; i < plane.bombs; i++) {
    const at = (i + 1) / (plane.bombs + 1);
    if (before < at && plane.t >= at) {
      const corridor = STRIKE_CORRIDORS[Math.floor(nextRandom(state) * STRIKE_CORRIDORS.length)];
      for (const side of [-1, 1]) {
        const x = corridor + side * STRIKE_CORRIDOR_REACH;
        if (Math.abs(x) > LANE_HALF_WIDTH - 0.2) continue;
        state.hazards.push({ id: state.nextId++, kind: "bomb", x, halfWidth: STRIKE_HALF_WIDTH, ticks: STRIKE_WARN, share: STRIKE_KILL_SHARE });
      }
    }
  }
  if (plane.t >= 1) state.plane = null;
}

/** The squad meets the traps it runs over: spikes cut the soldiers over them, a mine blows up under the ones near it. */
function crossTraps(state: GameState, before: number) {
  for (const t of state.traps) {
    if (t.used || !(before < t.z && t.z <= state.distance)) continue;
    t.used = true;
    if (t.hp <= 0 && t.kind === "mine") continue;
    const half = t.kind === "spikes" ? SPIKES_HALF_WIDTH : MINE_RADIUS;
    const share = t.kind === "spikes" ? SPIKES_KILL_SHARE : MINE_KILL_SHARE;
    const lost = loseSoldiers(state, Math.ceil(soldiersInStrip(state, t.x, half) * share));
    if (lost > 0 || t.kind === "mine") state.lastImpact = { kind: t.kind, x: t.x, z: t.z, tick: state.tick, lost };
  }
}

/** Advance the run by one tick. Mutates `state`. */
export function step(state: GameState, input: Input): void {
  if (state.status !== "playing") return;
  state.tick++;
  state.enemyShots = [];
  state.popped = [];
  const squad = state.squad;

  // sliding across the road
  const edge = Math.max(0, LANE_HALF_WIDTH - squadHalfWidth(squad.count));
  const reach = STRAFE_SPEED / TICK_RATE;
  if (input.target !== null) squad.x += Math.max(-reach, Math.min(reach, input.target - squad.x));
  else squad.x += Math.max(-1, Math.min(1, input.move)) * reach;
  squad.x = Math.max(-edge, Math.min(edge, squad.x));

  // running down the track: the squad halts in front of the boss until it is dead, and stops at the finish line
  const before = state.distance;
  const boss = bossOf(state);
  const blocked = !!boss && boss.z - state.distance <= BOSS_STANDOFF;
  if (!blocked) state.distance = Math.min(state.length, before + RUN_SPEED / TICK_RATE);

  for (const g of state.gates) {
    if (g.used || !(before < g.z && g.z <= state.distance)) continue;
    g.used = true;
    if (squad.x >= g.x - g.width / 2 && squad.x < g.x + g.width / 2) applyGate(state, g.id);
  }
  crossTraps(state, before);
  if (state.status !== "playing") return;
  stepEvents(state);

  while (state.pending.length && state.pending[0].at <= state.distance) spawnWave(state, state.pending.shift()!);

  // shooting: every column fires straight ahead at the first thing it meets; tanks and helicopters pierce armor
  state.volleys = [];
  const damage = (WEAPON_DPS[squad.weapon] * state.damageMul) / TICK_RATE;
  columnXs(squad.x, squad.count).forEach((x, i) => {
    const target = firstTarget(state, x);
    if (target) target.apply(damage * soldiersInColumn(squad.count, i), false);
    state.volleys.push({ x, z: target ? target.z : state.distance + FIRE_RANGE, hit: !!target });
  });
  vehicleXs(squad.x, squad.count, squad.vehicles.length).forEach((x, i) => {
    const vehicle = squad.vehicles[i];
    const target = firstTarget(state, x, VEHICLE_COLUMN_HALF_WIDTH);
    if (target) target.apply((VEHICLE_STATS[vehicle].dps * state.damageMul) / TICK_RATE, vehicle !== "moto");
    state.volleys.push({ vehicle, x, z: target ? target.z : state.distance + FIRE_RANGE, hit: !!target });
  });

  removeDead(state);
  state.barrels = state.barrels.filter((b) => {
    if (b.hp > 0) return true;
    giveReward(state, b.reward);
    return false;
  });
  state.barrels = state.barrels.filter((b) => b.z > state.distance - 2);
  // a mine that was shot to pieces goes off harmlessly; one left behind is forgotten
  state.traps = state.traps.filter((t) => {
    if (t.kind === "mine" && t.hp <= 0 && !t.used) {
      state.popped.push({ x: t.x, z: t.z });
      return false;
    }
    return t.z > state.distance - 3;
  });

  // rebuilt by hand: the boss adds minions to `state.enemies` while it acts, and a filter would drop them
  const acting = state.enemies;
  state.enemies = [];
  for (const e of acting) if (actEnemy(state, e)) state.enemies.push(e);
  resolveHazards(state);

  if (state.status !== "playing") return;
  if (state.distance >= state.length && !bossOf(state)) state.status = "won";
}

/**
 * 0 stars for a lost run; 1 for a win; 2 and 3 when most of the squad made it, counting everyone
 * lost to enemies against everyone left standing.
 */
export function starsFor(state: GameState): 0 | 1 | 2 | 3 {
  if (state.status !== "won") return 0;
  const survived = state.squad.count / Math.max(1, state.squad.count + state.losses);
  return survived >= 0.95 ? 3 : survived >= 0.75 ? 2 : 1;
}
