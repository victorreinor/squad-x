import {
  BARREL_RADIUS,
  BOMBER_BLAST_SOLDIERS,
  BOMBER_SPLASH_DAMAGE,
  BOMBER_SPLASH_RADIUS,
  BOSS_ACTIVE_RANGE,
  BOSS_ATTACK_INTERVAL,
  BOSS_FURY_AT,
  BOSS_FURY_PACE,
  BOSS_LAUNCH_AHEAD,
  BOSS_MAX_MINIONS,
  BOSS_MINIONS,
  BOSS_SLAM_HALF_WIDTH,
  BOSS_SLAM_KILL_SHARE,
  BOSS_SLAM_WARN,
  BOSS_STANDOFF,
  BOSS_SUMMON_GROWTH,
  BOSS_SUMMON_INTERVAL,
  CHILL_SLOW,
  CHILL_TICKS,
  FIRE_BURN_SHARE,
  FIRE_INTERVAL,
  FIRE_TICKS,
  ICE_HALF_WIDTH,
  ICE_WARN,
  KEG_LANES,
  LASER_KILL_SHARE,
  LASER_WARN,
  MECH_GAP_HALF_WIDTH,
  MECH_GAP_TICKS,
  MECH_GAPS,
  MECH_SHIELD_AHEAD,
  METEOR_HALF_WIDTH,
  METEOR_KILL_SHARE,
  METEOR_SPOTS,
  METEOR_WARN,
  PROJECTILE_COLUMNS,
  PROJECTILE_STATS,
  YETI_COMBO_GAP,
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
import { nextRandom, pickRandom } from "./rng";
import { NO_UPGRADES, bonusSoldiers, damageMultiplier, lossMultiplier, type Upgrades } from "./upgrades";
import { WEAPON_KINDS, type BossFight, type Enemy, type EnemyKind, type GameState, type Hazard, type Input, type LevelDef, type Projectile, type Reward, type WaveDef } from "./types";

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
    bossFight: null,
    projectiles: [],
    fires: [],
    chill: null,
    bossHits: [],
    lastImpact: null,
    popped: [],
    plane: null,
  };
  for (const g of level.gates) state.gates.push({ ...g, id: state.nextId++, progress: 0, used: false });
  for (const b of level.barrels) state.barrels.push({ ...b, id: state.nextId++, maxHp: b.hp });
  for (const t of level.traps) state.traps.push({ ...t, id: state.nextId++, hp: t.kind === "mine" ? MINE_HP : 0, used: false });
  // the boss is on the road from the start, so the player sees it waiting far ahead
  if (level.boss) {
    const { kind, z, hp, minions } = level.boss;
    spawnGroup(state, "boss", 1, 0, 0, z, hp);
    state.bossFight = {
      kind,
      awake: false,
      enraged: false,
      cooldown: 0,
      next: "ice",
      summon: BOSS_SUMMON_INTERVAL / 2,
      minions,
      gap: kind === "mech" ? pickRandom(state, MECH_GAPS) : null,
      gapTicks: MECH_GAP_TICKS,
    };
  }
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

/** How many soldiers stand in the columns that a strip `x ± half` touches: what a blow on that strip can hit. */
export function soldiersInStrip(state: GameState, x: number, half: number): number {
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
  const gap = state.bossFight?.gap ?? null;
  for (const e of state.enemies) {
    const stats = ENEMY_STATS[e.kind];
    if (e.hp <= 0 || !ahead(e.z) || Math.abs(e.x - x) > half + stats.radius) continue;
    // the Mecha's shield takes every shot that does not come through its opening
    if (e.kind === "boss" && gap !== null && Math.abs(x - gap) > MECH_GAP_HALF_WIDTH) blockers.push({ z: e.z - MECH_SHIELD_AHEAD, apply: () => {} });
    else blockers.push({ z: e.z, apply: (damage, pierce) => void (e.hp -= pierce ? damage : damage * stats.armor) });
  }
  // a missile or a keg on its way is in front of the boss: it takes the fire of the columns under it
  for (const p of state.projectiles) {
    if (p.hp <= 0 || !ahead(p.z) || Math.abs(p.x - x) > half + PROJECTILE_STATS[p.kind].radius) continue;
    blockers.push({ z: p.z, apply: (damage) => void (p.hp -= damage) });
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

/** The boss's body, if it is still on the road. */
export const bossOf = (state: GameState) => state.enemies.find((e) => e.kind === "boss");

/** Let one enemy act: walk, shoot, slam or blow up. Returns false when it is gone. */
function actEnemy(state: GameState, e: Enemy): boolean {
  const stats = ENEMY_STATS[e.kind];
  const squad = state.squad;
  const gap = e.z - state.distance;

  if (e.kind === "boss") {
    if (gap <= BOSS_ACTIVE_RANGE && state.bossFight) {
      state.bossFight.awake = true;
      actBoss(state, e, state.bossFight);
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

/** Mark a strip of road for a blow that lands after `warn` ticks. Every mark but the bomber's is the boss's. */
function mark(state: GameState, kind: Hazard["kind"], x: number, halfWidth: number, warn: number, share: number) {
  state.hazards.push({ id: state.nextId++, kind, from: kind === "bomb" ? "plane" : "boss", x, halfWidth, ticks: warn, warn, share });
}

/**
 * Set a missile or a keg off from in front of the boss toward `targetX`. It is as tough as `PROJECTILE_COLUMNS` of the
 * squad's columns can shoot down in `hpSeconds`, the squad as it is right now.
 */
function launch(state: GameState, boss: Enemy, kind: Projectile["kind"], x: number, targetX: number) {
  const { count, weapon } = state.squad;
  const perColumn = (count / squadColumns(count)) * WEAPON_DPS[weapon] * state.damageMul;
  const hp = Math.max(1, Math.round(perColumn * PROJECTILE_COLUMNS * PROJECTILE_STATS[kind].hpSeconds));
  state.projectiles.push({ id: state.nextId++, kind, x, z: boss.z - BOSS_LAUNCH_AHEAD, targetX, hp });
}

/** Ticks before a missile or a keg reaches the squad. */
export const ticksToLand = (state: GameState, p: Projectile) => (p.z - state.distance - CONTACT_DISTANCE) / (PROJECTILE_STATS[p.kind].speed / TICK_RATE);

/**
 * A boss's turn: it calls minions (more every time), grows enraged below half its hit points, and attacks in its own
 * way once the last attack is over. Every attack is marked or seen coming, so there is always a way to get out of it.
 */
function actBoss(state: GameState, e: Enemy, fight: BossFight) {
  if (!fight.enraged && e.hp <= e.maxHp * BOSS_FURY_AT) fight.enraged = true;
  const pace = fight.enraged ? BOSS_FURY_PACE[fight.kind] : 1;

  if (fight.summon > 0) fight.summon--;
  else {
    // past a crowd that fits on the road, the minions come tougher instead of more
    const count = Math.min(BOSS_MAX_MINIONS, Math.round(fight.minions));
    const kind = BOSS_MINIONS[fight.kind];
    if (count > 0) spawnGroup(state, kind, count, 0, 5, e.z - 3, Math.round(ENEMY_STATS[kind].hp * Math.max(1, fight.minions / count)));
    fight.minions *= BOSS_SUMMON_GROWTH;
    fight.summon = BOSS_SUMMON_INTERVAL;
  }

  const busy = state.projectiles.length > 0 || state.hazards.some((h) => h.from === "boss");
  // the opening in the Mecha's shield moves now and then, but never under a laser that is about to fire
  if (fight.gap !== null && !busy && --fight.gapTicks <= 0) {
    fight.gap = pickRandom(state, MECH_GAPS.filter((x) => x !== fight.gap));
    fight.gapTicks = Math.round(MECH_GAP_TICKS * pace);
  }
  if (fight.cooldown > 0) {
    fight.cooldown--;
    return;
  }
  if (busy) return;
  fight.cooldown = Math.round(BOSS_ATTACK_INTERVAL[fight.kind] * pace);
  const squad = state.squad;

  if (fight.kind === "general") {
    // a missile at where the squad stands now, its blast on the road; enraged, still one at a time, only sooner
    const edge = LANE_HALF_WIDTH - PROJECTILE_STATS.missile.blast / 2;
    launch(state, e, "missile", e.x, Math.max(-edge, Math.min(edge, squad.x)));
  } else if (fight.kind === "warlord") {
    // a row of kegs across the road, one lane left open
    const open = pickRandom(state, KEG_LANES);
    for (const x of KEG_LANES) if (x !== open) launch(state, e, "keg", x, x);
  } else if (fight.kind === "mech") {
    // the laser fires down the opening: the one place the Mecha can be hurt from is the one place it shoots at
    mark(state, "laser", fight.gap ?? 0, MECH_GAP_HALF_WIDTH, LASER_WARN, LASER_KILL_SHARE);
  } else if (fight.kind === "yeti") {
    // the ice first, where the squad stands; the slam right after it lands, where the squad is by then
    if (fight.next === "ice") {
      mark(state, "ice", squad.x, ICE_HALF_WIDTH, ICE_WARN, 1);
      fight.cooldown = ICE_WARN + YETI_COMBO_GAP;
      fight.next = "slam";
    } else {
      mark(state, "slam", squad.x, BOSS_SLAM_HALF_WIDTH, BOSS_SLAM_WARN, BOSS_SLAM_KILL_SHARE);
      fight.next = "ice";
    }
  } else {
    // meteors on all but one spot of the road, the clear one never on fire; two fall at once, three when enraged
    const clear = METEOR_SPOTS.filter((x) => !state.fires.some((f) => Math.abs(f.x - x) < f.halfWidth));
    const safe = pickRandom(state, clear.length ? clear : METEOR_SPOTS);
    const others = METEOR_SPOTS.filter((x) => x !== safe);
    if (!fight.enraged) others.splice(Math.floor(nextRandom(state) * others.length), 1);
    for (const x of others) mark(state, "meteor", x, METEOR_HALF_WIDTH, METEOR_WARN, METEOR_KILL_SHARE);
  }
}

/** Missiles fly and kegs roll toward the squad; one that gets there blows up on the soldiers in its strip. */
function moveProjectiles(state: GameState) {
  state.projectiles = state.projectiles.filter((p) => {
    const stats = PROJECTILE_STATS[p.kind];
    // a missile closes in on its mark so it gets there just as it reaches the squad
    p.x += (p.targetX - p.x) / Math.max(1, ticksToLand(state, p));
    p.z -= stats.speed / TICK_RATE;
    if (p.z - state.distance > CONTACT_DISTANCE) return true;
    const lost = loseSoldiers(state, Math.ceil(soldiersInStrip(state, p.targetX, stats.blast) * stats.share));
    state.bossHits.push({ kind: p.kind, x: p.targetX, z: state.distance + 0.5, lost });
    return false;
  });
}

/** Count down the marked strips and let the ones that run out land: bombs, slams, lasers and meteors kill, ice freezes. */
function resolveHazards(state: GameState) {
  state.hazards = state.hazards.filter((h: Hazard) => {
    if (--h.ticks > 0) return true;
    const inStrip = soldiersInStrip(state, h.x, h.halfWidth);
    if (h.kind === "ice") {
      if (inStrip > 0) state.chill = { ticks: CHILL_TICKS, share: Math.min(1, inStrip / Math.max(1, state.squad.count)) };
      state.bossHits.push({ kind: "ice", x: h.x, z: state.distance + 4, lost: inStrip });
      return false;
    }
    const lost = loseSoldiers(state, Math.ceil(inStrip * h.share));
    if (h.kind === "bomb") state.lastImpact = { kind: "bomb", x: h.x, z: state.distance + 8, tick: state.tick, lost };
    else state.bossHits.push({ kind: h.kind, x: h.x, z: state.distance + 4, lost });
    // a meteor leaves the road burning where it fell
    if (h.kind === "meteor") state.fires.push({ id: state.nextId++, x: h.x, halfWidth: h.halfWidth, ticks: FIRE_TICKS });
    return false;
  });
}

/** The fire on the road takes a share of the soldiers standing in it every `FIRE_INTERVAL` ticks, until it goes out. */
function burnFires(state: GameState) {
  state.fires = state.fires.filter((f) => {
    f.ticks--;
    if (f.ticks % FIRE_INTERVAL === 0) {
      // no rounding up: a few soldiers at the edge of the flames burn slowly, the fractions adding up in `lossCarry`
      const lost = loseSoldiers(state, soldiersInStrip(state, f.x, f.halfWidth) * FIRE_BURN_SHARE);
      if (lost > 0) state.bossHits.push({ kind: "fire", x: f.x, z: state.distance + 2, lost });
    }
    return f.ticks > 0;
  });
}

/** With the boss dead, whatever it set in motion is over too: its missiles, kegs, marks, fires and ice. */
function endFight(state: GameState) {
  state.bossFight = null;
  state.projectiles = [];
  state.fires = [];
  state.chill = null;
  state.hazards = state.hazards.filter((h) => h.from !== "boss");
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
        mark(state, "bomb", x, STRIKE_HALF_WIDTH, STRIKE_WARN, STRIKE_KILL_SHARE);
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
  state.bossHits = [];
  const squad = state.squad;
  const chill = state.chill;

  // sliding across the road, slower with the Yeti's ice on the squad
  const edge = Math.max(0, LANE_HALF_WIDTH - squadHalfWidth(squad.count));
  const reach = (STRAFE_SPEED / TICK_RATE) * (chill ? CHILL_SLOW : 1);
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
  // frozen soldiers do not shoot
  state.volleys = [];
  const damage = ((WEAPON_DPS[squad.weapon] * state.damageMul) / TICK_RATE) * (chill ? 1 - chill.share : 1);
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
  // a mine, missile or keg that was shot to pieces goes off harmlessly; a mine left behind is forgotten
  state.traps = state.traps.filter((t) => {
    if (t.kind === "mine" && t.hp <= 0 && !t.used) {
      state.popped.push({ kind: "mine", x: t.x, z: t.z });
      return false;
    }
    return t.z > state.distance - 3;
  });
  state.projectiles = state.projectiles.filter((p) => {
    if (p.hp > 0) return true;
    state.popped.push({ kind: p.kind, x: p.x, z: p.z });
    return false;
  });
  if (state.bossFight && !bossOf(state)) endFight(state);

  // rebuilt by hand: the boss adds minions to `state.enemies` while it acts, and a filter would drop them
  const acting = state.enemies;
  state.enemies = [];
  for (const e of acting) if (actEnemy(state, e)) state.enemies.push(e);
  moveProjectiles(state);
  resolveHazards(state);
  burnFires(state);
  if (state.chill && --state.chill.ticks <= 0) state.chill = null;

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
