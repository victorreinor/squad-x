import type { BossKind, EnemyKind, Projectile } from "./types";

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
/** the boss wakes up and starts attacking once the squad is this close: as soon as its shots can reach the boss (units) */
export const BOSS_ACTIVE_RANGE = FIRE_RANGE;
/**
 * how long a boss fight lasts for the squad a good player brings to it: the boss of a world's 5th level and of its
 * 10th (seconds of that squad's fire). The minions and the attacks make the real fight longer.
 */
export const BOSS_FIGHT_SECONDS = 12;
export const BOSS_FINAL_FIGHT_SECONDS = 18;
/**
 * how far the calibration's pressure may stretch or shrink a boss's hit points: within these bounds, so a fight can be
 * tuned when the boss alone is too much or too little, and never falls in a moment or drags on
 */
export const BOSS_PRESSURE_RANGE = [0.7, 1.15] as const;
/** the share of those hit points each boss gets: the Mecha's shield already stops most of the fire, so it needs fewer */
export const BOSS_TOUGHNESS: Record<BossKind, number> = { general: 1, warlord: 1, mech: 0.65, yeti: 1, demon: 1 };
/** ticks between two attacks of each boss */
export const BOSS_ATTACK_INTERVAL: Record<BossKind, number> = { general: 120, warlord: 150, mech: 150, yeti: 180, demon: 170 };
/**
 * below this share of its hit points a boss is enraged, and from then on waits only this share of the time between
 * attacks. The General's fury is all in the pace, one missile right after the other: a salvo of three covered the whole
 * road, so there was nowhere to stand. At this pace his fury weighs what the salvo did (his levels calibrate to the same
 * pressure); any slower and the calibration makes up for it with a tougher boss and more minions
 */
export const BOSS_FURY_AT = 0.5;
export const BOSS_FURY_PACE: Record<BossKind, number> = { general: 0.35, warlord: 0.65, mech: 0.65, yeti: 0.65, demon: 0.65 };
/** the minions each boss calls: the enemy its world is known for */
export const BOSS_MINIONS: Record<BossKind, EnemyKind> = { general: "runner", warlord: "sprinter", mech: "shield", yeti: "brute", demon: "bomber" };
/** ticks between two groups of minions */
export const BOSS_SUMMON_INTERVAL = 270;
/** the hit points of the first group, in seconds of the fire of the squad a good player brings (s) */
export const BOSS_MINION_SECONDS = 0.8;
/** each group comes this many times bigger than the one before: a fight that drags on is a fight lost */
export const BOSS_SUMMON_GROWTH = 1.3;
/** the most minions in one group; past it they come tougher instead of more */
export const BOSS_MAX_MINIONS = 40;

/** the Yeti's slam: the warning the player gets on the road, its half-width (units) and the share of the soldiers in the strip it takes */
export const BOSS_SLAM_WARN = 34;
export const BOSS_SLAM_HALF_WIDTH = 1.0;
export const BOSS_SLAM_KILL_SHARE = 0.3;

/**
 * what the bosses send down the road, per kind (the General's missile, the Warlord's explosive keg): speed (units/s),
 * body radius for the columns that shoot it (units), half-width of its blast (units), the share of the soldiers in the
 * blast it kills, and its hit points in seconds of the fire of `PROJECTILE_COLUMNS` of the squad's columns, as the squad
 * is when it is launched (s): the same challenge for 40 soldiers or 400, and more damage from the shop shoots it down sooner.
 * A keg takes no more than the other bosses' blows (25% to 40% of the strip): a wide squad cannot get out of a row of
 * three, and at 60% each row took nearly half of it, so only a squad twice the expected size lived through the fight.
 * Its hit points stay: any fewer and a small squad standing still shoots every keg down in time, with nothing to dodge
 */
export const PROJECTILE_STATS: Record<Projectile["kind"], { speed: number; radius: number; blast: number; share: number; hpSeconds: number }> = {
  missile: { speed: 9, radius: 0.5, blast: 1.2, share: 0.5, hpSeconds: 0.9 },
  keg: { speed: 4.5, radius: 0.7, blast: 1, share: 0.35, hpSeconds: 1.7 },
};
/** how many of the squad's columns a missile or a keg is sized against: about as many as stand under one */
export const PROJECTILE_COLUMNS = 3;
/** how far in front of the boss its missiles and kegs set off (units) */
export const BOSS_LAUNCH_AHEAD = 2.5;
/** the lanes the Warlord's kegs roll down, one left open each time (x, units) */
export const KEG_LANES = [-3, -1, 1, 3];

/**
 * the Mecha's shield: where its opening can be (x, units) and its half-width (units), ticks before the opening moves,
 * and how far in front of the Mecha the shield stands (units). Its laser fires down the opening: warning (ticks) and the
 * share of the soldiers in the strip it kills
 */
export const MECH_GAPS = [-2.6, 0, 2.6];
export const MECH_GAP_HALF_WIDTH = 1.7;
export const MECH_GAP_TICKS = 150;
export const MECH_SHIELD_AHEAD = 2.8;
export const LASER_WARN = 30;
export const LASER_KILL_SHARE = 0.25;

/**
 * the Yeti's ice: warning (ticks) and half-width of the strip (units); the soldiers caught stop shooting and the squad
 * slides at this share of its speed for some ticks; the slam comes this many ticks after the ice lands
 */
export const ICE_WARN = 30;
export const ICE_HALF_WIDTH = 1.2;
export const CHILL_TICKS = 60;
export const CHILL_SLOW = 0.4;
export const YETI_COMBO_GAP = 4;

/**
 * the Demon's meteors: the spots they can fall on (x, units), one always left clear, how many fall at once (two, three
 * when enraged), warning (ticks), half-width (units) and share of the soldiers they kill. Each leaves the road burning
 * for some ticks, taking this share of the soldiers standing in the fire every few ticks
 */
export const METEOR_SPOTS = [-3, -1, 1, 3];
export const METEOR_WARN = 42;
export const METEOR_HALF_WIDTH = 0.7;
export const METEOR_KILL_SHARE = 0.25;
export const FIRE_TICKS = 90;
export const FIRE_INTERVAL = 15;
export const FIRE_BURN_SHARE = 0.025;
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

/**
 * an air strike: how many ticks of warning the player gets, how wide each bomb's blast is (half-width, units) and the
 * share it kills. The safe corridor holds five to seven columns and a squad of 65 or more spreads into nine, so a wide
 * squad takes a part of every pass whatever it does: the share is the one a boss's blow takes, not more
 */
export const STRIKE_WARN = 48;
export const STRIKE_HALF_WIDTH = 1.15;
export const STRIKE_KILL_SHARE = 0.3;
/** passes of bombs in one air strike: this many in the first world, one more per world after it, up to the most */
export const STRIKE_PASSES = 2;
export const STRIKE_MAX_PASSES = 3;
/** the middles of the safe corridors an air strike can leave, and how far the bombs fall from the middle of one (units) */
export const STRIKE_CORRIDORS = [-2.4, 0, 2.4];
export const STRIKE_CORRIDOR_REACH = 3.7;

/**
 * Siege mode (the castle bridge): a stone bridge with a red carpet down the middle and a lane of banners on each side.
 * The bridge spans x in [-SIEGE_HALF_WIDTH, +SIEGE_HALF_WIDTH]; the carpet, where the legion marches, is
 * x in [-SIEGE_CARPET_HALF, +SIEGE_CARPET_HALF] and the banner lanes are what is left either side of it (units).
 */
export const SIEGE_HALF_WIDTH = 5.2;
export const SIEGE_CARPET_HALF = 2.4;
/** how wide a banner is and how far from the middle of the road its middle is: it fills its lane (units) */
export const SIEGE_BANNER_WIDTH = SIEGE_HALF_WIDTH - SIEGE_CARPET_HALF;
export const SIEGE_BANNER_X = SIEGE_CARPET_HALF + SIEGE_BANNER_WIDTH / 2;
/** the most a shot-up banner can say */
export const SIEGE_BANNER_MAX = 99;
/**
 * The squad spreads into at most this many firing columns, this far apart (units): narrow enough to fit in a banner lane
 * however many soldiers there are, so a big squad can still choose a lane
 */
export const SIEGE_MAX_COLUMNS = 5;
export const SIEGE_COLUMN_SPACING = 0.55;

/**
 * The legion is one body of red soldiers, counted rather than simulated one by one: `LEGION_PER_ROW` across the
 * carpet, `LEGION_ROW_SPACING` between rows (units). Each soldier has `LEGION_HP` hit points, and the squad's fire eats
 * the legion from its front row. It sleeps until the squad is `LEGION_WAKE` away, then marches at `LEGION_SPEED` (units/s).
 */
export const LEGION_PER_ROW = 12;
export const LEGION_ROW_SPACING = 0.42;
export const LEGION_HP = 48;
export const LEGION_SPEED = 4;
export const LEGION_WAKE = 70;
/**
 * The squad never advances: the ground scrolls under it at `SIEGE_SCROLL_SPEED` (units/s), so the banners come at it down
 * the lanes without stopping, and the legion marches at it on top of that. Whatever reaches it closer than
 * `SIEGE_CONTACT` (units) is in contact and stays there, pinned to the squad, until it is dead
 */
export const SIEGE_SCROLL_SPEED = 3;
export const SIEGE_CONTACT = 1.4;
/** how many seconds of scrolling the road is built for (the camera follows the ground, so it must be long enough to last the fight) */
export const SIEGE_ROAD_SECONDS = 260;
/** soldiers a red soldier in contact kills per second */
export const LEGION_KILL_RATE = 1.5;

/** the boss walks behind the legion, this far from its last row (units), then alone at this speed (units/s); in contact it kills this many soldiers a second */
export const SIEGE_BOSS_TAIL_GAP = 4;
export const SIEGE_BOSS_SPEED = 1.2;
export const SIEGE_BOSS_KILL_RATE = 8;
/** half-width of the boss's body for the squad's columns (units) */
export const SIEGE_BOSS_RADIUS = 2.2;

/**
 * Siege walls and champions (the wall mode): a block of stone across a banner lane, with the number of hit points
 * shown at its foot in units of `SIEGE_HP_UNIT` hit points (so "800" is 8000 hit points). The squad cannot run
 * through it: it stops `SIEGE_WALL_STOP` short of it and has to shoot it down.
 */
export const SIEGE_HP_UNIT = 10;
export const SIEGE_WALL_STOP = 2.6;
/** how deep a wall is, from its front face back (units): nobody slides sideways into it while passing it */
export const SIEGE_WALL_DEPTH = 3;

/**
 * A champion is a big red fighter that walks out of the legion alone, with a health bar: speed (units/s), how fast it
 * slides sideways after the squad (units/s), the width of its body for the columns that shoot it (units) and how many
 * soldiers it kills each second in contact
 */
export const CHAMPION_SPEED = 3.2;
export const CHAMPION_STEER = 2.2;
export const CHAMPION_RADIUS = 0.9;
export const CHAMPION_KILL_RATE = 9;
