import { SKILLED_BOT, botInput, type BotSkill } from "./bot";
import { campaignLevel } from "./calibrate";
import { TICK_RATE } from "./constants";
import { bossOf, createGame, starsFor, step } from "./game";
import { LEVELS_PER_WORLD } from "./levels";
import { NO_UPGRADES, replayShare, runPayout, spendLikeATypicalPlayer, type Upgrades } from "./upgrades";
import type { LevelDef } from "./types";

/** How one level of a simulated campaign went. */
export interface CampaignStep {
  level: number;
  /** runs it took, the last one being the win (or the last try when it was never won) */
  runs: number;
  /** runs of earlier levels played while stuck on this one, to win the coins they still pay */
  replays: number;
  won: boolean;
  stars: number;
  /** what the player owned when the last run started */
  upgrades: Upgrades;
  /** for a boss level: how long each fight lasted, from the boss waking up to its death or the squad's (s) */
  fights: number[];
}

/** Earlier levels a stuck player goes back to after a loss, at most, to win the coins they still pay. */
const REPLAYS_PER_LOSS = 2;

/**
 * The whole campaign played by a bot the way a person plays it: level after level, banking what every run pays,
 * spending it in the shop like a typical player after each run, and trying a level again after losing, up to `maxRuns`
 * times. A lost run pays nothing, so after a loss that leaves the next upgrade out of reach the player goes back and
 * wins earlier levels again, for what they still pay. The stress test of the game: it tells whether the campaign can be
 * finished with the shop, and how many runs each level asks for.
 */
export function playCampaign(skill: BotSkill = SKILLED_BOT, { levels = LEVELS_PER_WORLD * 5, maxRuns = 30, seed = 1 } = {}): CampaignStep[] {
  const out: CampaignStep[] = [];
  let owned: Upgrades = { ...NO_UPGRADES };
  let wallet = 0;
  let runSeed = seed;
  /** times each level was won, and its best stars: what a win of it still pays */
  const wins: number[] = [];
  const best: number[] = [];
  const total = (u: Upgrades) => u.damage + u.squad + u.armor;
  /** One run of level `n` while stuck on `frontier`: banks what it pays and goes shopping. Returns the finished run, and the boss fight's length. */
  const play = (n: number, level: LevelDef, frontier = n): { won: boolean; stars: number; fight: number | null } => {
    // every try its own luck, and its own slips
    const player: BotSkill = { ...skill, slips: runSeed };
    const state = createGame(level, (runSeed++ * 2654435761) >>> 0, owned);
    let woke = -1;
    let fight: number | null = null;
    for (let i = 0; i < TICK_RATE * 900 && state.status === "playing"; i++) {
      step(state, botInput(state, player));
      if (!level.boss) continue;
      if (woke < 0 && state.bossFight?.awake) woke = state.tick;
      if (woke >= 0 && fight === null && (!bossOf(state) || state.status !== "playing")) fight = (state.tick - woke) / TICK_RATE;
    }
    const stars = starsFor(state);
    wallet += runPayout(state.coins, stars, owned, n, wins[n] ?? 0, best[n] ?? 0, frontier);
    if (stars > 0) {
      wins[n] = (wins[n] ?? 0) + 1;
      best[n] = Math.max(best[n] ?? 0, stars);
    }
    ({ upgrades: owned, wallet } = spendLikeATypicalPlayer(owned, wallet));
    return { won: state.status === "won", stars, fight };
  };
  for (let n = 1; n <= levels; n++) {
    const level = campaignLevel(n);
    const fights: number[] = [];
    let runs = 0;
    let replays = 0;
    let stars = 0;
    let won = false;
    let upgrades = owned;
    while (!won && runs < maxRuns) {
      runs++;
      upgrades = owned;
      const run = play(n, level);
      won = run.won;
      stars = run.stars;
      if (run.fight !== null) fights.push(run.fight);
      if (won) break;
      // stuck: go back to the latest levels that still pay something, until an upgrade comes within reach
      const before = total(owned);
      let back = 0;
      for (let earlier = n - 1; earlier >= 1 && back < REPLAYS_PER_LOSS && total(owned) === before; earlier--) {
        if (replayShare(earlier, wins[earlier] ?? 0, n) === 0) continue;
        back++;
        play(earlier, campaignLevel(earlier), n);
      }
      replays += back;
    }
    out.push({ level: n, runs, replays, won, stars, upgrades, fights });
    if (!won) break;
  }
  return out;
}
