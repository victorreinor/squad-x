import type { EnemyKind } from "./types";

/** simulation ticks per second */
export const TICK_RATE = 30;
/** milliseconds per tick */
export const TICK_MS = 1000 / TICK_RATE;

/** the road spans x in [-LANE_HALF_WIDTH, +LANE_HALF_WIDTH] (units) */
export const LANE_HALF_WIDTH = 4;
/** how fast the squad runs down the track (units/s) */
export const RUN_SPEED = 6;
/** how fast the squad slides sideways (units/s) */
export const STRAFE_SPEED = 9;

/** the most soldiers the squad can ever hold */
export const MAX_SQUAD = 999;
/** most firing columns the squad spreads into */
export const MAX_COLUMNS = 9;
/** distance between two firing columns (units) */
export const COLUMN_SPACING = 0.7;

/** how far ahead enemies and barrels can be hit (units) */
export const FIRE_RANGE = 38;
/** half-width of one firing column: a target is in the column when |dx| <= this + the target's radius (units) */
export const COLUMN_HALF_WIDTH = 0.45;

/** how far ahead of the squad a wave appears (units) */
export const SPAWN_AHEAD = 42;
/** enemies touch the squad when this close in z (units) */
export const CONTACT_DISTANCE = 0.9;
/** how fast enemies slide sideways toward the squad (units/s) */
export const ENEMY_STEER = 2.2;
/** enemies keep their own lane until this close to the squad, then close in (units) */
export const ENEMY_STEER_RANGE = 16;

/** damage that raises an adding gate from 0 to 1; it costs more the higher the number already is */
export const GATE_STEP_DAMAGE = 45;
/** every this many points of value make the next step cost one more `GATE_STEP_DAMAGE` */
export const GATE_STEP_GROWTH = 8;
/** damage that raises a multiplying gate's number by one */
export const GATE_MUL_STEP_DAMAGE = 1500;
/** the highest a shot-up adding gate's number can climb */
export const GATE_MAX_VALUE = 60;
/** the highest a shot-up multiplying gate's number can climb */
export const GATE_MUL_MAX_VALUE = 6;

/** the weapon table: damage per second for each soldier holding it */
export const WEAPON_DPS = { pistol: 4, rifle: 7, smg: 10, minigun: 16 } as const;

/**
 * per enemy kind: hit points, speed (units/s), soldiers lost on contact, body radius (units) and `armor`, the share of
 * a soldier's damage that gets through (vehicle shells ignore it)
 */
export const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number; damage: number; radius: number; armor: number }> = {
  runner: { hp: 6, speed: 3.4, damage: 1, radius: 0.4, armor: 1 },
  sprinter: { hp: 4, speed: 6.8, damage: 1, radius: 0.35, armor: 1 },
  brute: { hp: 40, speed: 2.2, damage: 4, radius: 0.7, armor: 1 },
  shield: { hp: 34, speed: 2.6, damage: 2, radius: 0.65, armor: 0.45 },
  bomber: { hp: 9, speed: 3.1, damage: 0, radius: 0.45, armor: 1 },
  shooter: { hp: 14, speed: 3.2, damage: 0, radius: 0.45, armor: 1 },
  boss: { hp: 400, speed: 0, damage: 0, radius: 2.2, armor: 1 },
};

/** soldiers a bomber kills when it reaches the squad */
export const BOMBER_BLAST_SOLDIERS = 6;
/** a bomber shot dead blows up the enemies within this radius for this much damage (units, hit points) */
export const BOMBER_SPLASH_RADIUS = 2.4;
export const BOMBER_SPLASH_DAMAGE = 28;
/** a shooter stops this far from the squad and fires every this many ticks, one soldier each shot */
export const SHOOTER_RANGE = 16;
export const SHOOTER_FIRE_INTERVAL = 38;

/** the squad halts this far in front of the boss and fights it standing (units) */
export const BOSS_STANDOFF = 14;
/** the boss starts attacking once the squad is this close (units) */
export const BOSS_ACTIVE_RANGE = 34;
/** ticks between two slams, the warning the player gets on the road before a slam lands, and its half-width (units) */
export const BOSS_SLAM_INTERVAL = 140;
export const BOSS_SLAM_WARN = 34;
export const BOSS_SLAM_HALF_WIDTH = 1.0;
/** the share of the soldiers standing in the strip that a slam takes */
export const BOSS_SLAM_KILL_SHARE = 0.6;
/** ticks between two groups of minions the boss calls, and how many come */
export const BOSS_SUMMON_INTERVAL = 270;
export const BOSS_SUMMON_COUNT = 7;
/** how far apart enemies of one wave stand, front to back (units) */
export const WAVE_ROW_SPACING = 1.1;
/** half-width of a barrel (units) */
export const BARREL_RADIUS = 0.9;

/** per vehicle kind: damage per second of its own gun (it fires no matter how many soldiers there are) */
export const VEHICLE_STATS = {
  moto: { dps: 28 },
  heli: { dps: 55 },
  tank: { dps: 90 },
} as const;
/** the most vehicles that can run with the squad at once */
export const MAX_VEHICLES = 4;
/** gap between the squad's edge and the first vehicle beside it, and between vehicles on one side (units) */
export const VEHICLE_GAP = 1.45;
/** half-width of a vehicle's shot: it sweeps a wider strip of road than one soldier's column (units) */
export const VEHICLE_COLUMN_HALF_WIDTH = 1.6;

/** how much of a squad's soldiers a dividing gate (`÷N`) leaves behind is `1 / N`; this is the most it can divide by */
export const GATE_DIV_MAX = 4;

/** spikes across the road: half-width of the strip (units) and the share of the soldiers standing in it that it kills */
export const SPIKES_HALF_WIDTH = 1.25;
export const SPIKES_KILL_SHARE = 0.4;
/** a mine: hit points (shoot it before you reach it), blast radius (units) and the share of the soldiers in the blast it kills */
export const MINE_HP = 14;
export const MINE_RADIUS = 1.7;
export const MINE_KILL_SHARE = 0.6;

/** an air strike: how many ticks of warning the player gets, how wide each bomb's blast is (half-width, units) and the share it kills */
export const STRIKE_WARN = 48;
export const STRIKE_HALF_WIDTH = 1.15;
export const STRIKE_KILL_SHARE = 0.55;
/** the middles of the safe corridors an air strike can leave, and how far the bombs fall from the middle of one (units) */
export const STRIKE_CORRIDORS = [-2.4, 0, 2.4];
export const STRIKE_CORRIDOR_REACH = 3.7;
