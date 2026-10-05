import { describe, expect, test } from "bun:test";
import { AVERAGE_BOT, SKILLED_BOT, campaignSpec, playCampaign } from "../src";

/**
 * The stress test: the whole campaign played the way a person plays it, banking every run, shopping and trying again.
 * `bun run stress` prints the same thing level by level.
 */
describe("the whole campaign, played like a person plays it", () => {
  const slow = 120_000;
  const good = playCampaign(SKILLED_BOT, { seed: 1000 });

  test("a good player who shops gets through all fifty levels, and no level holds them up for long", () => {
    expect(good.length).toBe(50);
    expect(good.at(-1)!.won).toBe(true);
    // the campaign asks for persistence: counting the earlier levels won again for coins, the fifty levels take a good
    // player some 200 runs, about four a level, and no level holds them up for more than fifteen tries
    const played = good.reduce((sum, s) => sum + s.runs + s.replays, 0) / good.length;
    expect(played).toBeGreaterThanOrEqual(3);
    expect(played).toBeLessThanOrEqual(6);
    expect(Math.max(...good.map((s) => s.runs))).toBeLessThanOrEqual(15);
    // a lost run pays nothing, so a stuck player goes back to earlier levels for coins
    expect(good.some((s) => s.replays > 0)).toBe(true);
  }, slow);

  test("a boss fight that is won lasts long enough to matter, and not forever", () => {
    const bosses = good.filter((s) => campaignSpec(s.level).boss);
    expect(bosses.length).toBe(10);
    for (const s of bosses) {
      const won = s.fights.at(-1)!;
      expect(won).toBeGreaterThanOrEqual(8);
      expect(won).toBeLessThanOrEqual(60);
    }
  }, slow);

  test("a middling player who never learns still gets through the first world's levels by trying again and shopping", () => {
    // it never dodges and misjudges a third of the gates on every try: from the first world's last boss on, the game
    // wants a player who learns
    for (const seed of [1000, 2000]) {
      const steps = playCampaign(AVERAGE_BOT, { seed });
      expect(steps.filter((s) => s.won).length).toBeGreaterThanOrEqual(9);
    }
  }, slow);
});
