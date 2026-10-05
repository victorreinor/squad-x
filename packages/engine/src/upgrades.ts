/** What coins can buy for good. Each kind has levels from 0 to `UPGRADE_MAX_LEVEL`. */
export const UPGRADE_KINDS = ["damage", "squad", "armor", "coins"] as const;
export type UpgradeKind = (typeof UPGRADE_KINDS)[number];

/** How many levels of each upgrade can be bought. */
export const UPGRADE_MAX_LEVEL = 10;

/** The levels the player owns. */
export type Upgrades = Record<UpgradeKind, number>;

export const NO_UPGRADES: Upgrades = { damage: 0, squad: 0, armor: 0, coins: 0 };

/** Coins the first level costs, per kind; each next level costs `UPGRADE_COST_GROWTH` times more. */
const BASE_COST: Record<UpgradeKind, number> = { damage: 70, squad: 90, armor: 80, coins: 110 };
const UPGRADE_COST_GROWTH = 1.5;

/** Extra damage per level: every soldier and vehicle shoots this much harder (fraction). */
export const DAMAGE_PER_LEVEL = 0.12;
/** Extra soldiers at the start of every run, per level. */
export const SQUAD_PER_LEVEL = 2;
/** Fewer soldiers lost to enemy hits, traps and bombs per level (fraction); gates are not affected. */
export const ARMOR_PER_LEVEL = 0.05;
/** Extra coins per level on what a run pays (fraction). */
export const COINS_PER_LEVEL = 0.1;

/** Coins the next level of `kind` costs when the player owns `level` of it. */
export const upgradeCost = (kind: UpgradeKind, level: number) => Math.round(BASE_COST[kind] * UPGRADE_COST_GROWTH ** level);

/** Multiplier on the damage of everything the squad fires. */
export const damageMultiplier = (u: Upgrades) => 1 + DAMAGE_PER_LEVEL * u.damage;

/** Soldiers added to the squad when a run starts. */
export const bonusSoldiers = (u: Upgrades) => SQUAD_PER_LEVEL * u.squad;

/** The share of the soldiers an enemy, trap or bomb would take that the squad still loses. */
export const lossMultiplier = (u: Upgrades) => 1 - ARMOR_PER_LEVEL * u.armor;

/** Coins for finishing level `n` before stars and loot: later levels pay more. */
export const levelReward = (n: number) => 30 + 6 * n;

/** Coins for each star earned. */
export const STAR_COINS = 15;

/** What a finished run pays: what was picked up, the stars, the level's reward, all raised by the coin upgrade. */
export const runPayout = (coins: number, stars: number, u: Upgrades, level = 1) => Math.round((coins + stars * STAR_COINS + levelReward(level)) * (1 + COINS_PER_LEVEL * u.coins));

/** `owned` after buying one level of `kind` with `wallet` coins, or null when it can't be bought. */
export function buyUpgrade(owned: Upgrades, wallet: number, kind: UpgradeKind): { upgrades: Upgrades; wallet: number } | null {
  const level = owned[kind];
  if (level >= UPGRADE_MAX_LEVEL) return null;
  const cost = upgradeCost(kind, level);
  if (wallet < cost) return null;
  return { upgrades: { ...owned, [kind]: level + 1 }, wallet: wallet - cost };
}

/** How a typical player plays the economy: two stars a level and about this many coins out of the barrels. */
const TYPICAL_STARS = 2;
const TYPICAL_LOOT = 14;
/** The order a typical player buys in: the cheapest of the three that matter, damage first. The coin upgrade is skipped. */
const BUY_ORDER: UpgradeKind[] = ["damage", "squad", "armor"];

const expectedCache = new Map<number, Upgrades>();

/**
 * What the shop has given a player who has cleared levels 1 to n-1 with two stars each and spent everything as soon as
 * they could, on damage, reinforcements and armour in turn. The campaign is tuned for this player: a level is as hard
 * as it can be while *they* still beat it, so skipping the shop means getting stuck.
 */
export function expectedUpgrades(n: number): Upgrades {
  const known = expectedCache.get(n);
  if (known) return known;
  let owned: Upgrades = { ...NO_UPGRADES };
  let wallet = 0;
  for (let level = 1; level < n; level++) {
    wallet += runPayout(TYPICAL_LOOT, TYPICAL_STARS, owned, level);
    for (;;) {
      // the kind with the fewest levels (ties go in BUY_ORDER) is the one they buy next
      const kind = [...BUY_ORDER].sort((a, b) => owned[a] - owned[b] || BUY_ORDER.indexOf(a) - BUY_ORDER.indexOf(b))[0];
      const bought = buyUpgrade(owned, wallet, kind);
      if (!bought) break;
      owned = bought.upgrades;
      wallet = bought.wallet;
    }
  }
  expectedCache.set(n, owned);
  return owned;
}
