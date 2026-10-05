import { NO_UPGRADES, SHOP_REFUNDS, buyUpgrade, refundUpgrades, runPayout, upgradesWorth, type UpgradeKind, type Upgrades } from "@squadx/engine";

/** What the player has earned, kept in the browser. */
export interface Progress {
  /** the highest level that can be played */
  unlocked: number;
  /** best stars per level number */
  stars: Record<number, number>;
  /** how many times each level was won: a level pays less every time it is won again */
  wins: Record<number, number>;
  coins: number;
  /** levels bought in the shop */
  upgrades: Upgrades;
  /** how many of the `SHOP_REFUNDS` the player has used */
  refunds: number;
}

const KEY = "squad-x:progress";
/**
 * The version of the saves this game reads. Raising it wipes everyone's progress the next time they open the game,
 * for a change that makes old progress meaningless. 2: every boss with its own attack (05/10/2026); the saves before
 * it had no version. The sound setting is kept apart and survives.
 */
const SAVE_VERSION = 2;
const fresh = (): Progress => ({ unlocked: 1, stars: {}, wins: {}, coins: 0, upgrades: { ...NO_UPGRADES }, refunds: 0 });

/** Whether this device had a save from an older version, wiped when the game started: the menu says so once. */
export let startedOver = false;

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const { version, ...saved } = JSON.parse(raw);
      if (version === SAVE_VERSION) return { ...fresh(), ...saved, upgrades: { ...NO_UPGRADES, ...saved.upgrades } };
      localStorage.removeItem(KEY);
      startedOver = true;
    }
  } catch {
    // private window or blocked storage: play without saving
  }
  return fresh();
}

/** Erase the player's progress for good (the menu asks first) and return a fresh one. The sound setting stays. */
export function resetProgress(): Progress {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // see loadProgress
  }
  return fresh();
}

/** Whether there is anything to erase: a level won, a coin or an upgrade. */
export function hasProgress(p: Progress): boolean {
  return p.unlocked > 1 || p.coins > 0 || p.refunds > 0 || upgradesWorth(p.upgrades) > 0;
}

function save(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, version: SAVE_VERSION }));
  } catch {
    // see loadProgress
  }
}

/** Record a finished run and return the new progress. */
export function recordRun(p: Progress, level: number, stars: number, coins: number): Progress {
  const next: Progress = {
    ...p,
    unlocked: stars > 0 ? Math.max(p.unlocked, level + 1) : p.unlocked,
    stars: { ...p.stars, [level]: Math.max(p.stars[level] ?? 0, stars) },
    wins: stars > 0 ? { ...p.wins, [level]: (p.wins[level] ?? 0) + 1 } : p.wins,
    coins: p.coins + runPayout(coins, stars, p.upgrades, level, p.wins[level] ?? 0, p.stars[level] ?? 0),
  };
  save(next);
  return next;
}

/** Spend coins on one level of an upgrade; unchanged when it can't be bought. */
export function purchase(p: Progress, kind: UpgradeKind): Progress {
  const bought = buyUpgrade(p.upgrades, p.coins, kind);
  if (!bought) return p;
  const next: Progress = { ...p, upgrades: bought.upgrades, coins: bought.wallet };
  save(next);
  return next;
}

/** Take every upgrade back for what it cost, using one of the `SHOP_REFUNDS`; unchanged when none is left or nothing was bought. */
export function refund(p: Progress): Progress {
  if (p.refunds >= SHOP_REFUNDS || upgradesWorth(p.upgrades) === 0) return p;
  const back = refundUpgrades(p.upgrades, p.coins);
  const next: Progress = { ...p, upgrades: back.upgrades, coins: back.wallet, refunds: p.refunds + 1 };
  save(next);
  return next;
}
