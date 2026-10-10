import {
  CHAMPION_KILL_RATE,
  CHAMPION_RADIUS,
  CHAMPION_SPEED,
  CHAMPION_STEER,
  COLUMN_HALF_WIDTH,
  FIRE_RANGE,
  GATE_STEP_DAMAGE,
  GATE_STEP_GROWTH,
  LEGION_HP,
  LEGION_KILL_RATE,
  LEGION_PER_ROW,
  LEGION_ROW_SPACING,
  LEGION_SPEED,
  LEGION_WAKE,
  MAX_SQUAD,
  SIEGE_BANNER_MAX,
  SIEGE_BANNER_WIDTH,
  SIEGE_BANNER_X,
  SIEGE_BOSS_KILL_RATE,
  SIEGE_BOSS_RADIUS,
  SIEGE_BOSS_SPEED,
  SIEGE_BOSS_TAIL_GAP,
  SIEGE_CARPET_HALF,
  SIEGE_CONTACT,
  SIEGE_COLUMN_SPACING,
  SIEGE_HALF_WIDTH,
  SIEGE_HP_UNIT,
  SIEGE_MAX_COLUMNS,
  SIEGE_ROAD_SECONDS,
  SIEGE_SCROLL_SPEED,
  SIEGE_WALL_DEPTH,
  SIEGE_WALL_STOP,
  STRAFE_SPEED,
  TICK_RATE,
  WEAPON_DPS,
} from "./constants";
import { nextRandom } from "./rng";
import type { Input, Volley, WeaponKind } from "./types";

/**
 * A banner standing in one of the two lanes beside the carpet: running through it adds its number to the squad, and
 * shooting it while nothing else is in the column raises the number.
 */
export interface SiegeBanner {
  id: number;
  x: number;
  z: number;
  width: number;
  value: number;
  /** the most shooting can raise `value` to */
  max: number;
  /** damage soaked since `value` last went up */
  progress: number;
  /** the squad already went through (or past) it */
  used: boolean;
}

/**
 * The red army: a body of `count` soldiers, `LEGION_PER_ROW` across, whose front row is at `z`. The squad's fire eats it
 * from the front (so `z` moves back as rows fall) and the rows behind keep their place.
 */
export interface Legion {
  x: number;
  z: number;
  count: number;
  /** how many it started with, for its bar */
  maxCount: number;
  /** how close the squad has to come to wake it (units), and how fast it marches (units/s) */
  wake: number;
  speed: number;
  /** the squad came close enough: the legion marches from now on */
  awake: boolean;
  /** the tick it woke up on, or -1 */
  awokeAt: number;
  /** damage dealt to the front row that has not yet made a kill */
  carry: number;
}

/** The boss at the back of the legion: it walks behind its last row, and when the legion is gone it comes on alone. */
export interface SiegeBoss {
  x: number;
  z: number;
  hp: number;
  maxHp: number;
}

/**
 * A block of stone across a banner lane. It stops the squad and takes the fire of the columns in its lane until its hit
 * points run out; what lies behind it can only be reached once it is down.
 */
export interface SiegeWall {
  id: number;
  x: number;
  z: number;
  width: number;
  /** how far the lane behind it stays walled off, from its front face back (units): a side wall runs along it */
  depth: number;
  hp: number;
  maxHp: number;
}

/** A big red fighter that comes out of the legion on its own, walks at the squad and, in contact, cuts it down. */
export interface Champion {
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
}

/** One siege: what is on the bridge, written by `siegeLevel` or by hand. */
export interface SiegeLevel {
  startSquad: number;
  startWeapon: WeaponKind;
  banners: { x: number; z: number; value: number; max?: number }[];
  /** where the front row of the legion stands at the start, how many soldiers it has and how close the squad has to come to wake it (default `LEGION_WAKE`) */
  legion: { z: number; count: number; wake?: number; speed?: number };
  /** how fast the ground scrolls under the squad (units/s), default `SIEGE_SCROLL_SPEED` */
  scroll?: number;
  bossHp: number;
  theme: string;
  /** walls across a lane, with their hit points in `SIEGE_HP_UNIT`s (what the player reads) */
  walls?: { x: number; z: number; hp: number; depth?: number }[];
  /** champions the legion sends out, each `after` seconds of the legion being awake, with hit points in `SIEGE_HP_UNIT`s */
  champions?: { after: number; hp: number }[];
}

/** Everything about one siege run. JSON-serializable. */
export interface SiegeState {
  tick: number;
  rng: number;
  status: "playing" | "won" | "lost";
  /** how far the ground has scrolled under the squad, which never moves: the z of the squad on the road */
  distance: number;
  /** how fast the ground scrolls (units/s) */
  scroll: number;
  /** the road's length: past the boss, for the camera and the scenery */
  length: number;
  squad: { x: number; count: number; weapon: WeaponKind };
  banners: SiegeBanner[];
  walls: SiegeWall[];
  champions: Champion[];
  /** champions not sent yet, in order of `after` (ticks of the legion being awake) */
  pendingChampions: { after: number; hp: number }[];
  legion: Legion;
  boss: SiegeBoss;
  /** how many soldiers the squad has lost to the legion and the boss */
  losses: number;
  lossCarry: number;
  nextId: number;
  theme: string;
  /** the last banner the squad ran through, for the HUD pop-up */
  lastBanner: { id: number; text: string; tick: number } | null;
  /** this tick's shots, derived each tick */
  volleys: Volley[];
  /** red soldiers shot down and soldiers lost this tick, for effects and sounds */
  killedNow: number;
  lostNow: number;
}

/** The first row to the last of a legion of `count` soldiers (units). */
export const legionDepth = (count: number) => Math.max(0, Math.ceil(count / LEGION_PER_ROW) - 1) * LEGION_ROW_SPACING;

/** How many firing columns a squad of this size spreads into. */
export const siegeColumns = (count: number) => Math.max(1, Math.min(SIEGE_MAX_COLUMNS, Math.ceil(Math.sqrt(count))));

/** Half the width the squad takes across the bridge (units). */
export const siegeHalfWidth = (count: number) => ((siegeColumns(count) - 1) * SIEGE_COLUMN_SPACING) / 2 + 0.3;

/** The x of every firing column, left to right. */
export const siegeColumnXs = (x: number, count: number) => Array.from({ length: siegeColumns(count) }, (_, i) => x + (i - (siegeColumns(count) - 1) / 2) * SIEGE_COLUMN_SPACING);

/** How many soldiers stand in column `i` (the first columns take the remainder). */
const soldiersIn = (count: number, i: number) => Math.floor(count / siegeColumns(count)) + (i < count % siegeColumns(count) ? 1 : 0);

/** slack for comparing a front pinned at the contact distance: a sum of floats lands a hair above it */
const EPSILON = 1e-6;

/** What the squad runs up against: the legion while it stands, and the boss after. */
const legionAlive = (s: SiegeState) => s.legion.count > 0;

/** The z of the first thing the squad has to fight: a champion on its way, the legion while it stands, the boss after. */
const frontZ = (s: SiegeState) => Math.min(legionAlive(s) ? s.legion.z : s.boss.z, ...s.champions.map((c) => c.z));

/** How far the squad may run before a wall in its way stops it (units): `Infinity` when nothing is in the way. */
function wallLimit(s: SiegeState): number {
  const half = siegeHalfWidth(s.squad.count);
  let limit = Infinity;
  for (const w of s.walls) {
    if (w.hp <= 0 || w.z < s.distance) continue;
    if (Math.abs(s.squad.x - w.x) < w.width / 2 + half) limit = Math.min(limit, w.z - SIEGE_WALL_STOP);
  }
  return limit;
}

/** A fresh siege of `level`. */
export function createSiege(level: SiegeLevel, seed: number): SiegeState {
  const state: SiegeState = {
    tick: 0,
    rng: seed >>> 0,
    status: "playing",
    distance: 0,
    scroll: level.scroll ?? SIEGE_SCROLL_SPEED,
    length: level.legion.z + legionDepth(level.legion.count) + SIEGE_BOSS_TAIL_GAP + 30 + (level.scroll ?? SIEGE_SCROLL_SPEED) * SIEGE_ROAD_SECONDS,
    squad: { x: 0, count: level.startSquad, weapon: level.startWeapon },
    banners: [],
    walls: [],
    champions: [],
    pendingChampions: (level.champions ?? []).map((c) => ({ after: Math.round(c.after * TICK_RATE), hp: c.hp * SIEGE_HP_UNIT })).sort((a, b) => a.after - b.after),
    legion: { x: 0, z: level.legion.z, count: level.legion.count, maxCount: level.legion.count, wake: level.legion.wake ?? LEGION_WAKE, speed: level.legion.speed ?? LEGION_SPEED, awake: false, awokeAt: -1, carry: 0 },
    boss: { x: 0, z: 0, hp: level.bossHp, maxHp: level.bossHp },
    losses: 0,
    lossCarry: 0,
    nextId: 1,
    theme: level.theme,
    lastBanner: null,
    volleys: [],
    killedNow: 0,
    lostNow: 0,
  };
  for (const b of level.banners) state.banners.push({ ...b, max: b.max ?? SIEGE_BANNER_MAX, id: state.nextId++, width: SIEGE_BANNER_WIDTH, progress: 0, used: false });
  for (const w of level.walls ?? []) state.walls.push({ id: state.nextId++, x: w.x, z: w.z, width: SIEGE_BANNER_WIDTH, depth: w.depth ?? SIEGE_WALL_DEPTH, hp: w.hp * SIEGE_HP_UNIT, maxHp: w.hp * SIEGE_HP_UNIT });
  anchorBoss(state);
  return state;
}

/** While the legion stands the boss stays behind its last row. */
function anchorBoss(state: SiegeState) {
  if (legionAlive(state)) state.boss.z = state.legion.z + legionDepth(state.legion.count) + SIEGE_BOSS_TAIL_GAP;
}

/** Take `n` soldiers (a fraction at a time) from the squad. */
function lose(state: SiegeState, n: number) {
  const owed = n + state.lossCarry;
  const wanted = Math.floor(owed + 1e-9);
  state.lossCarry = owed - wanted;
  const lost = Math.min(wanted, state.squad.count);
  state.squad.count -= lost;
  state.losses += lost;
  state.lostNow += lost;
  if (state.squad.count <= 0) {
    state.squad.count = 0;
    state.status = "lost";
  }
}

/** The banner a column shoots when nothing else is in it: the first one ahead in its lane. */
function bannerAhead(state: SiegeState, x: number): SiegeBanner | null {
  let best: SiegeBanner | null = null;
  for (const b of state.banners) {
    if (b.used || b.z <= state.distance || b.z > state.distance + FIRE_RANGE) continue;
    if (x < b.x - b.width / 2 - COLUMN_HALF_WIDTH || x > b.x + b.width / 2 + COLUMN_HALF_WIDTH) continue;
    if (!best || b.z < best.z) best = b;
  }
  return best;
}

/** Raise a banner by the damage it took. */
function pump(b: SiegeBanner, damage: number) {
  b.progress += damage;
  for (;;) {
    const cost = GATE_STEP_DAMAGE * (1 + Math.max(0, b.value) / GATE_STEP_GROWTH);
    if (b.value >= b.max || b.progress < cost) break;
    b.progress -= cost;
    b.value++;
  }
}

/** What a column shoots: how far away it is and what its damage does. */
interface Target {
  z: number;
  apply: (damage: number) => void;
}

/**
 * The first thing a column meets. A champion, the legion (on the carpet) or the boss (once the legion is gone) comes
 * first, as a barrel does in the campaign; if there is none, the nearest of the wall and the banner in the column's lane.
 */
function firstTarget(state: SiegeState, x: number): Target | null {
  const { distance, legion, boss } = state;
  const ahead = (z: number) => z > distance && z <= distance + FIRE_RANGE;
  const fighters: Target[] = [];
  for (const c of state.champions) {
    if (c.hp > 0 && ahead(c.z) && Math.abs(x - c.x) <= CHAMPION_RADIUS + COLUMN_HALF_WIDTH) fighters.push({ z: c.z, apply: (d) => void (c.hp -= d) });
  }
  if (legionAlive(state)) {
    if (ahead(legion.z) && Math.abs(x - legion.x) <= SIEGE_CARPET_HALF + COLUMN_HALF_WIDTH) fighters.push({ z: legion.z, apply: (d) => void (legion.carry += d) });
  } else if (boss.hp > 0 && ahead(boss.z) && Math.abs(x - boss.x) <= SIEGE_BOSS_RADIUS + COLUMN_HALF_WIDTH) {
    fighters.push({ z: boss.z, apply: (d) => void (boss.hp -= d) });
  }
  const nearest = (list: Target[]) => list.reduce<Target | null>((best, t) => (!best || t.z < best.z ? t : best), null);
  const hit = nearest(fighters);
  if (hit) return hit;

  const lane: Target[] = [];
  for (const w of state.walls) {
    if (w.hp > 0 && ahead(w.z) && Math.abs(x - w.x) <= w.width / 2 + COLUMN_HALF_WIDTH) lane.push({ z: w.z, apply: (d) => void (w.hp -= d) });
  }
  const banner = bannerAhead(state, x);
  if (banner) lane.push({ z: banner.z, apply: (d) => pump(banner, d) });
  return nearest(lane);
}

/** How many red soldiers of the front row touch a squad of this size standing at `x`. */
export function soldiersInContact(state: SiegeState): number {
  const half = siegeHalfWidth(state.squad.count);
  const overlap = Math.max(0, Math.min(state.squad.x + half, state.legion.x + SIEGE_CARPET_HALF) - Math.max(state.squad.x - half, state.legion.x - SIEGE_CARPET_HALF));
  const across = (SIEGE_CARPET_HALF * 2) / LEGION_PER_ROW;
  return Math.min(Math.min(LEGION_PER_ROW, state.legion.count), Math.max(3, Math.round(overlap / across)));
}

/** Advance the siege by one tick. Mutates `state`. */
export function stepSiege(state: SiegeState, input: Input): void {
  if (state.status !== "playing") return;
  state.tick++;
  state.killedNow = 0;
  state.lostNow = 0;
  const { squad, legion, boss } = state;

  const edge = Math.max(0, SIEGE_HALF_WIDTH - siegeHalfWidth(squad.count));
  const reach = STRAFE_SPEED / TICK_RATE;
  const was = squad.x;
  if (input.target !== null) squad.x += Math.max(-reach, Math.min(reach, input.target - squad.x));
  else squad.x += Math.max(-1, Math.min(1, input.move)) * reach;
  squad.x = Math.max(-edge, Math.min(edge, squad.x));
  // a wall is solid, and a side wall runs along the lane behind it: a squad outside the lane cannot slide into it
  // once it is level with the wall, only through its front (which is shut until the wall is down)
  for (const w of state.walls) {
    if (state.distance < w.z - SIEGE_WALL_STOP + 0.05 || state.distance >= w.z + w.depth) continue;
    const gap = w.width / 2 + siegeHalfWidth(squad.count);
    if (Math.abs(was - w.x) >= gap && Math.abs(squad.x - w.x) < gap) squad.x = w.x + Math.sign(was - w.x) * gap;
  }

  if (!legion.awake && legion.z - state.distance <= legion.wake) {
    legion.awake = true;
    legion.awokeAt = state.tick;
  }
  // champions walk out of the front of the legion, one after another, once it is awake
  while (legion.awake && state.pendingChampions.length && state.tick - legion.awokeAt >= state.pendingChampions[0].after) {
    const next = state.pendingChampions.shift()!;
    const x = legion.x + (nextRandom(state) - 0.5) * SIEGE_CARPET_HALF;
    state.champions.push({ id: state.nextId++, x, z: legion.z - 0.5, hp: next.hp, maxHp: next.hp });
  }

  // the ground scrolls under the squad without a pause, and only a wall in the squad's lane stops it
  const before = state.distance;
  const limit = wallLimit(state);
  if (state.distance < limit) state.distance = Math.min(limit, state.distance + state.scroll / TICK_RATE);
  for (const b of state.banners) {
    if (b.used || !(before < b.z && b.z <= state.distance)) continue;
    b.used = true;
    if (squad.x >= b.x - b.width / 2 && squad.x < b.x + b.width / 2) {
      squad.count = Math.min(MAX_SQUAD, squad.count + b.value);
      state.lastBanner = { id: b.id, text: `+${b.value}`, tick: state.tick };
    }
  }

  // shooting: each column fires at the nearest thing in it. A champion, the legion and the boss come before the wall
  // and the banners; on the carpet the legion is the target, in a lane the wall or the banners are
  state.volleys = [];
  const damage = WEAPON_DPS[squad.weapon] / TICK_RATE;
  siegeColumnXs(squad.x, squad.count).forEach((x, i) => {
    const target = firstTarget(state, x);
    if (target) target.apply(damage * soldiersIn(squad.count, i));
    state.volleys.push({ x, z: target ? target.z : state.distance + FIRE_RANGE, hit: !!target });
  });
  if (legion.carry > 0 && legionAlive(state)) {
    const kills = Math.min(legion.count, Math.floor(legion.carry / LEGION_HP));
    legion.carry -= kills * LEGION_HP;
    legion.count -= kills;
    // the rows behind close up on the front: it keeps marching, whatever falls
    state.killedNow = kills;
    if (legion.count <= 0) legion.carry = 0;
  }
  state.champions = state.champions.filter((c) => c.hp > 0);

  // the champions walk at the squad and, in contact, cut it down
  for (const c of state.champions) {
    const steer = CHAMPION_STEER / TICK_RATE;
    c.x = Math.max(-SIEGE_HALF_WIDTH + CHAMPION_RADIUS, Math.min(SIEGE_HALF_WIDTH - CHAMPION_RADIUS, c.x + Math.max(-steer, Math.min(steer, squad.x - c.x))));
    if (c.z - state.distance > SIEGE_CONTACT + EPSILON) c.z = Math.max(state.distance + SIEGE_CONTACT, c.z - CHAMPION_SPEED / TICK_RATE);
    else {
      c.z = state.distance + SIEGE_CONTACT;
      lose(state, CHAMPION_KILL_RATE / TICK_RATE);
    }
  }
  // a wall that is down stays in the list, for the rubble, with no hit points
  // the legion marches and, in contact, cuts the squad down; once it is gone the boss does the same
  if (legionAlive(state)) {
    if (legion.awake) {
      if (legion.z - state.distance > SIEGE_CONTACT + EPSILON) legion.z = Math.max(state.distance + SIEGE_CONTACT, legion.z - legion.speed / TICK_RATE);
      else {
        // in contact the front is pinned to the squad: the ground keeps scrolling and it is carried along
        legion.z = state.distance + SIEGE_CONTACT;
        lose(state, (soldiersInContact(state) * LEGION_KILL_RATE) / TICK_RATE);
      }
    }
    anchorBoss(state);
  } else if (boss.hp > 0 && legion.awake) {
    if (boss.z - state.distance > SIEGE_CONTACT + EPSILON) boss.z = Math.max(state.distance + SIEGE_CONTACT, boss.z - SIEGE_BOSS_SPEED / TICK_RATE);
    else {
      boss.z = state.distance + SIEGE_CONTACT;
      lose(state, SIEGE_BOSS_KILL_RATE / TICK_RATE);
    }
  }

  if (state.status !== "playing") return;
  if (!legionAlive(state) && boss.hp <= 0 && !state.champions.length && !state.pendingChampions.length) {
    boss.hp = 0;
    state.status = "won";
  }
}

/** 1 star for a win; 2 and 3 when most of the squad made it, counting everyone lost against everyone left. */
export function siegeStars(state: SiegeState): 0 | 1 | 2 | 3 {
  if (state.status !== "won") return 0;
  const survived = state.squad.count / Math.max(1, state.squad.count + state.losses);
  return survived >= 0.95 ? 3 : survived >= 0.75 ? 2 : 1;
}

/**
 * The test siege. The squad stands still and the ground scrolls under it, so the banners come at it down the lanes without
 * stopping: a long chain of `+2` down the left lane (each grows as the squad shoots it, so the chain snowballs with the
 * squad) and, down the right lane, a pair of `+99` every so often. The legion marches at the squad and, in contact, kills
 * it until one side is gone, so the squad has to keep growing while it fights, and leaving the carpet for a lane costs
 * the shots it would have fired at the legion. The squad starts as a single knight.
 */
export function siegeLevel(): SiegeLevel {
  const banners: SiegeLevel["banners"] = [];
  for (let i = 0; i < 220; i++) banners.push({ x: -SIEGE_BANNER_X, z: 14 + i * 2.8, value: 2, max: 10 });
  for (let z = 60; z < 700; z += 90) for (let k = 0; k < 2; k++) banners.push({ x: SIEGE_BANNER_X, z: z + k * 4.4, value: 99 });
  return { startSquad: 1, startWeapon: "rifle", banners, legion: { z: 230, count: 4000, wake: 125, speed: 4.6 }, bossHp: 40000, theme: "castle" };
}

/**
 * The wall siege: the same bridge, but the `+99` banners come down the right lane behind walls of stone, and the legion
 * sends out champions on its own, one after another. A wall stops the ground in its lane until it is shot down, so the
 * squad has to choose, again and again, between the legion (on the carpet) and the next wall (in the lane), with the
 * legion in contact killing it all the while.
 */
export function wallSiegeLevel(): SiegeLevel {
  const banners: SiegeLevel["banners"] = [];
  for (let i = 0; i < 220; i++) banners.push({ x: -SIEGE_BANNER_X, z: 14 + i * 2.8, value: 2, max: 10 });
  const walls: NonNullable<SiegeLevel["walls"]> = [];
  for (let z = 100, k = 0; z < 700; z += 110, k++) {
    walls.push({ x: SIEGE_BANNER_X, z, hp: 450 + k * 50, depth: 22 });
    for (let b = 0; b < 3; b++) banners.push({ x: SIEGE_BANNER_X, z: z + 6 + b * 4.4, value: 99 });
  }
  return {
    startSquad: 1,
    startWeapon: "rifle",
    banners,
    walls,
    champions: [
      { after: 3, hp: 120 },
      { after: 14, hp: 430 },
      { after: 26, hp: 375 },
      { after: 40, hp: 600 },
    ],
    legion: { z: 230, count: 4000, wake: 125, speed: 4.6 },
    bossHp: 40000,
    theme: "castle",
  };
}

/** How a bot plays the siege. */
export interface SiegeBotSkill {
  /** crosses to the right lane for the big banners (otherwise it stays on the left) */
  greedy: boolean;
  /** goes for a wall when it can break it before the legion arrives (otherwise it never shoots one) */
  walls: boolean;
}

export const SIEGE_SKILLED: SiegeBotSkill = { greedy: true, walls: true };
export const SIEGE_SAFE: SiegeBotSkill = { greedy: false, walls: false };

/** How far ahead a bot looks for banners worth a lane, and for a wall worth breaking (units). */
const BOT_LOOKAHEAD = 20;
const BOT_WALL_REACH = 45;
/** the longest a bot will stand shooting a wall, and the time it takes that it will spend even with the legion on top of it (seconds) */
const BOT_WALL_PATIENCE = 24;
const BOT_WALL_QUICK = 8;

/**
 * The input of a bot for this tick: the lane with the most banner value ahead, a wall when it can be broken in time,
 * and the carpet when the fight is on.
 */
export function siegeBotInput(state: SiegeState, skill: SiegeBotSkill = SIEGE_SKILLED): Input {
  const { distance, legion } = state;
  const standing = state.walls.filter((w) => w.hp > 0 && w.z + w.depth > distance);
  // a banner behind a wall in its own lane cannot be reached yet
  const reachable = (b: { x: number; z: number }) => !standing.some((w) => Math.sign(w.x) === Math.sign(b.x) && w.z < b.z);
  const worth = (side: -1 | 1) =>
    state.banners.reduce((sum, b) => sum + (!b.used && Math.sign(b.x) === side && b.z > distance && b.z <= distance + BOT_LOOKAHEAD && reachable(b) ? b.value : 0), 0);

  // a wall is worth the time it takes if the squad breaks it long before the legion is on top of it
  const wall = skill.walls ? standing.find((w) => w.z - distance <= BOT_WALL_REACH) : undefined;
  if (wall) {
    const breaks = wall.hp / Math.max(1, state.squad.count * WEAPON_DPS[state.squad.weapon]);
    // the legion marches at the squad while the ground scrolls it closer still
    const contact = legion.awake ? (legion.z - distance - SIEGE_CONTACT) / (legion.speed + state.scroll) : Infinity;
    if (breaks <= BOT_WALL_PATIENCE && (breaks < contact - 4 || breaks <= BOT_WALL_QUICK)) return { move: 0, target: wall.x };
  }

  const left = worth(-1);
  const right = skill.greedy ? worth(1) : 0;
  const fighting = frontZ(state) - distance <= FIRE_RANGE;
  // in a fight the carpet is where the arrows count; a lane is only worth leaving it for while there is a lot in it
  const best = Math.max(left, right);
  if (fighting && best < 30) return { move: 0, target: 0 };
  if (best === 0) return { move: 0, target: 0 };
  return { move: 0, target: right > left ? SIEGE_BANNER_X : -SIEGE_BANNER_X };
}
