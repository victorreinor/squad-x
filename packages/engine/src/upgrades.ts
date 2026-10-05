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

/** Coins for each star better than the level's best so far. */
export const STAR_COINS = 25;

/**
 * The share of a level's reward and loot a win pays, by how many times the level was won before: in full the first
 * time, then half, then a quarter, then nothing. Winning the same level over and over is not a way to fill the wallet.
 */
export const REPLAY_SHARES = [1, 0.5, 0.25];

/**
 * What a run pays. A lost run pays nothing. A win pays the level's reward and what was picked up, by `REPLAY_SHARES`
 * after `wins` earlier wins of the level, and `STAR_COINS` for each star above the level's `best`, every time. All of
 * it is raised by the coin upgrade.
 */
export function runPayout(coins: number, stars: number, u: Upgrades, level = 1, wins = 0, best = 0): number {
  if (stars === 0) return 0;
  const share = REPLAY_SHARES[wins] ?? 0;
  return Math.round(((coins + levelReward(level)) * share + Math.max(0, stars - best) * STAR_COINS) * (1 + COINS_PER_LEVEL * u.coins));
}

/** `owned` after buying one level of `kind` with `wallet` coins, or null when it can't be bought. */
export function buyUpgrade(owned: Upgrades, wallet: number, kind: UpgradeKind): { upgrades: Upgrades; wallet: number } | null {
  const level = owned[kind];
  if (level >= UPGRADE_MAX_LEVEL) return null;
  const cost = upgradeCost(kind, level);
  if (wallet < cost) return null;
  return { upgrades: { ...owned, [kind]: level + 1 }, wallet: wallet - cost };
}

/**
 * How many times a campaign lets the player take back everything bought in the shop and spend it again. Few, so a
 * purchase is still a decision; some, so a bad one doesn't sink the campaign.
 */
export const SHOP_REFUNDS = 2;

/**
 * What a refund takes back. The coin upgrade stays bought: refunded, it would pay its bonus for a stretch of levels and
 * then its price back, a free investment.
 */
export const REFUNDABLE: readonly UpgradeKind[] = ["damage", "squad", "armor"];

/** The coins spent on the `REFUNDABLE` upgrades of `owned`: what a refund gives back, in full. */
export function refundValue(owned: Upgrades): number {
  let worth = 0;
  for (const kind of REFUNDABLE) for (let level = 0; level < owned[kind]; level++) worth += upgradeCost(kind, level);
  return worth;
}

/** The `REFUNDABLE` upgrades taken back for what they cost: back to level 0, and their price back in the wallet. */
export function refundUpgrades(owned: Upgrades, wallet: number): { upgrades: Upgrades; wallet: number } {
  const upgrades = { ...owned };
  for (const kind of REFUNDABLE) upgrades[kind] = 0;
  return { upgrades, wallet: wallet + refundValue(owned) };
}

/** The first level that cannot be beaten without visiting the shop. */
export const SHOP_FROM_LEVEL = 3;

/** How a typical player plays the economy: two stars a level and about this many coins out of the barrels. */
const TYPICAL_STARS = 2;
const TYPICAL_LOOT = 14;
/**
 * From `SHOP_FROM_LEVEL` on, a typical player stuck on a level goes back and wins the levels before it again, for
 * what they still pay: this many earlier levels, each one more time. Lost runs pay nothing.
 */
const TYPICAL_REPLAYS = 1;
/** The order a typical player buys in: the cheapest of the three that matter, damage first. The coin upgrade is skipped. */
const BUY_ORDER: UpgradeKind[] = ["damage", "squad", "armor"];

const expectedCache = new Map<number, Upgrades>();

/**
 * What the shop has given a player who has cleared levels 1 to n-1 with two stars each, gone back for
 * `TYPICAL_REPLAYS` earlier levels before each new one from `SHOP_FROM_LEVEL` on, and spent everything as soon as they
 * could, on damage, reinforcements and armour in turn. The campaign is tuned for this player: a level is as hard as it
 * can be while *they* still beat it, so skipping the shop means getting stuck.
 */
export function expectedUpgrades(n: number): Upgrades {
  const known = expectedCache.get(n);
  if (known) return known;
  let owned: Upgrades = { ...NO_UPGRADES };
  let wallet = 0;
  const wins: number[] = [];
  for (let level = 1; level < n; level++) {
    // stuck on this level, they win the ones before it again, the most recent first, while those still pay
    if (level >= SHOP_FROM_LEVEL) {
      for (let back = 1; back <= TYPICAL_REPLAYS && level - back >= 1; back++) {
        const earlier = level - back;
        wallet += runPayout(TYPICAL_LOOT, TYPICAL_STARS, owned, earlier, wins[earlier], TYPICAL_STARS);
        wins[earlier]++;
      }
    }
    wallet += runPayout(TYPICAL_LOOT, TYPICAL_STARS, owned, level);
    wins[level] = 1;
    ({ upgrades: owned, wallet } = spendLikeATypicalPlayer(owned, wallet));
  }
  expectedCache.set(n, owned);
  return owned;
}

/** What a typical player does in the shop: buys as much as the wallet allows, always the kind they have least of (ties in `BUY_ORDER`). */
export function spendLikeATypicalPlayer(owned: Upgrades, wallet: number): { upgrades: Upgrades; wallet: number } {
  for (;;) {
    const kind = [...BUY_ORDER].sort((a, b) => owned[a] - owned[b] || BUY_ORDER.indexOf(a) - BUY_ORDER.indexOf(b))[0];
    const bought = buyUpgrade(owned, wallet, kind);
    if (!bought) return { upgrades: owned, wallet };
    owned = bought.upgrades;
    wallet = bought.wallet;
  }
}
