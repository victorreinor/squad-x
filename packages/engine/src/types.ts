/** weapons from weakest to strongest; picking one up never downgrades */
export const WEAPON_KINDS = ["pistol", "rifle", "smg", "minigun"] as const;
export type WeaponKind = (typeof WEAPON_KINDS)[number];

/** every enemy: runner and brute from the start, the rest as the worlds go on; the boss stands on the road */
export const ENEMY_KINDS = ["runner", "sprinter", "brute", "shield", "bomber", "shooter", "boss"] as const;
export type EnemyKind = (typeof ENEMY_KINDS)[number];

/** vehicles that run beside the squad, weakest to strongest */
export const VEHICLE_KINDS = ["moto", "heli", "tank"] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

/**
 * What a level is about. Gates: a road of number gates and a few hordes. Loot: clusters of barrels to choose
 * from (weapons, vehicles, soldiers) and a squad that starts bigger. Mixed: a bit of everything.
 */
export const LEVEL_MODES = ["gates", "loot", "mixed"] as const;
export type LevelMode = (typeof LEVEL_MODES)[number];

/**
 * What makes a level its own: more of one thing than usual. Swarm: huge crowds of weak enemies. Elite: few but tough.
 * Ambush: hordes show up close. Scarce: hardly any rewards. Rush: gates come thick and fast. Traps: gates that make you think.
 */
export const LEVEL_TWISTS = ["none", "swarm", "elite", "ambush", "scarce", "rush", "traps"] as const;
export type LevelTwist = (typeof LEVEL_TWISTS)[number];

/** what a gate does to the squad: add a (signed) number of soldiers, or multiply them */
export type GateOp = "add" | "mul" | "div";

/** What a broken barrel drops. */
export type Reward = { kind: "weapon"; weapon: WeaponKind } | { kind: "vehicle"; vehicle: VehicleKind } | { kind: "soldiers"; count: number } | { kind: "coins"; count: number };

/** The player's command for one tick. `target` (drag/touch) wins over `move` (keys). */
export interface Input {
  /** -1 left, 0 stay, +1 right */
  move: number;
  /** absolute x to slide toward, or null */
  target: number | null;
}

export interface Squad {
  /** centre of the squad across the road */
  x: number;
  count: number;
  weapon: WeaponKind;
  /** vehicles running beside the squad, in the order they were won */
  vehicles: VehicleKind[];
}

/** A number gate lying across part of the road. Shooting it raises `value`. */
export interface Gate {
  id: number;
  x: number;
  z: number;
  width: number;
  op: GateOp;
  value: number;
  /** damage soaked since `value` last went up */
  progress: number;
  /** shooting it changes nothing: a punishment you cannot argue with */
  locked?: boolean;
  /** the squad already went through (or past) it */
  used: boolean;
}

export interface Barrel {
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  reward: Reward;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  /** ticks until a shooter fires or a boss slams again */
  cooldown: number;
  /** ticks until a boss calls its next minions */
  summon: number;
}

/** A strip of road something is about to smash: soldiers in it are lost when `ticks` runs out. The boss slams, a bomber drops bombs. */
export interface Hazard {
  id: number;
  kind: "slam" | "bomb";
  x: number;
  halfWidth: number;
  ticks: number;
  /** the share of the soldiers in the strip that it kills */
  share: number;
}

/** A thing on the road to avoid: spikes to steer around, a mine to shoot or steer around. */
export interface Trap {
  id: number;
  kind: "spikes" | "mine";
  x: number;
  z: number;
  /** a mine has hit points; spikes cannot be shot */
  hp: number;
  /** the squad already went past it */
  used: boolean;
}

/** What the world throws at the squad on its own, from some level on: an air strike. */
export interface EventDef {
  /** the distance run at which it starts */
  at: number;
  kind: "airstrike";
  /** how many bombs fall, one after another */
  bombs: number;
}

/** A group of enemies that appears once the squad has run `at` units. */
export interface WaveDef {
  at: number;
  kind: EnemyKind;
  count: number;
  /** centre of the group across the road */
  x: number;
  /** how far the group spreads sideways */
  spread: number;
  /** hit points of each enemy in the group; defaults to the kind's usual */
  hp?: number;
  /** how far ahead of the squad the group shows up; defaults to `SPAWN_AHEAD` */
  ahead?: number;
}

/** A level: the layout of one run, built by `generateLevel` or written by hand. */
export interface LevelDef {
  mode: LevelMode;
  twist: LevelTwist;
  /** which world's enemies and boss this is, from 0 */
  world: number;
  /** distance from start to the finish line (units) */
  length: number;
  startSquad: number;
  startWeapon: WeaponKind;
  gates: Omit<Gate, "id" | "progress" | "used">[];
  traps: Omit<Trap, "id" | "used" | "hp">[];
  events: EventDef[];
  barrels: Omit<Barrel, "id" | "maxHp">[];
  waves: WaveDef[];
  /** the boss stands at `z` on the road with this many hit points; the squad can't pass until it is dead. Null = no boss. */
  boss: { z: number; hp: number } | null;
  /** palette for the scenery */
  theme: string;
}

/** Where a column of soldiers fires and where the shot ends, for drawing only. */
export interface Volley {
  /** the vehicle firing, or absent for a column of soldiers */
  vehicle?: VehicleKind;
  x: number;
  /** z of whatever the column is hitting, or the end of its range */
  z: number;
  hit: boolean;
}

export type Status = "playing" | "won" | "lost";

/** Everything about one run. JSON-serializable. */
export interface GameState {
  tick: number;
  rng: number;
  status: Status;
  /** how far the squad has run (the squad's z) */
  distance: number;
  squad: Squad;
  gates: Gate[];
  barrels: Barrel[];
  traps: Trap[];
  /** events not started yet, in order of `at` */
  pendingEvents: EventDef[];
  enemies: Enemy[];
  /** waves not spawned yet, in order of `at` */
  pending: WaveDef[];
  /** how many soldiers have been lost to enemies so far */
  losses: number;
  /** coins picked up from barrels in this run */
  coins: number;
  /** multiplier on everything the squad fires, from the damage upgrade */
  damageMul: number;
  /** the share of the soldiers an enemy would kill that the armour upgrade lets through, and the fraction left over between hits */
  lossMul: number;
  lossCarry: number;
  nextId: number;
  length: number;
  theme: string;
  /** the last thing that changed the squad count, for the HUD pop-up */
  lastGate: { id: number; text: string; good: boolean; tick: number } | null;
  /** this tick's shots, derived each tick */
  volleys: Volley[];
  /** where enemy shooters fired this tick, for drawing */
  enemyShots: { x: number; z: number }[];
  /** strips of road the boss has marked and is about to smash */
  hazards: Hazard[];
  /** the last slam that landed: where, when and how many soldiers it took */
  lastSlam: { x: number; tick: number; lost: number } | null;
  /** the last trap or bomb that landed */
  lastImpact: { kind: "spikes" | "mine" | "bomb"; x: number; z: number; tick: number; lost: number } | null;
  /** traps shot to pieces this tick, for drawing */
  popped: { x: number; z: number }[];
  /** an air strike under way: the plane's progress across the sky, 0 to 1, or null */
  plane: { t: number; bombs: number } | null;
}
