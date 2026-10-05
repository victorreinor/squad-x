import { NO_UPGRADES, buyUpgrade, runPayout, type UpgradeKind, type Upgrades } from "@squadx/engine";

/** What the player has earned, kept in the browser. */
export interface Progress {
  /** the highest level that can be played */
  unlocked: number;
  /** best stars per level number */
  stars: Record<number, number>;
  coins: number;
  /** levels bought in the shop */
  upgrades: Upgrades;
}

const KEY = "squad-x:progress";
const fresh = (): Progress => ({ unlocked: 1, stars: {}, coins: 0, upgrades: { ...NO_UPGRADES } });

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...fresh(), ...saved, upgrades: { ...NO_UPGRADES, ...saved.upgrades } };
    }
  } catch {
    // private window or blocked storage: play without saving
  }
  return fresh();
}

function save(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // see loadProgress
  }
}

/** Record a finished run and return the new progress. */
export function recordRun(p: Progress, level: number, stars: number, coins: number): Progress {
  const next: Progress = {
    unlocked: stars > 0 ? Math.max(p.unlocked, level + 1) : p.unlocked,
    stars: { ...p.stars, [level]: Math.max(p.stars[level] ?? 0, stars) },
    coins: p.coins + runPayout(coins, stars, p.upgrades, level),
    upgrades: p.upgrades,
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
