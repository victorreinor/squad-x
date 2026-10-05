/**
 * The stress test of the campaign: a bot plays it from level 1 the way a person would, banking what every run pays,
 * shopping after each run and trying again after a loss, and this prints how many runs each level took, the upgrades
 * owned and how long the boss fights lasted. `bun run stress` for the good and the middling bot, `bun run stress 3` for
 * three campaigns of each (different seeds), `bun run stress 1 good` for one bot.
 */
import { AVERAGE_BOT, SKILLED_BOT, playCampaign, type BotSkill, type CampaignStep } from "../packages/engine/src";

const campaigns = Number(process.argv[2] ?? 1);
const which = process.argv[3];
const bots: [string, BotSkill][] = [
  ["bom", SKILLED_BOT],
  ["médio", AVERAGE_BOT],
].filter(([name]) => !which || (which === "good" ? name === "bom" : name === "médio")) as [string, BotSkill][];

const upgradesOf = (s: CampaignStep) => `D${s.upgrades.damage} R${s.upgrades.squad} A${s.upgrades.armor}`;

for (const [name, skill] of bots) {
  for (let c = 1; c <= campaigns; c++) {
    const started = performance.now();
    const steps = playCampaign(skill, { seed: c * 1000 });
    const tries = steps.reduce((sum, s) => sum + s.runs, 0);
    const replays = steps.reduce((sum, s) => sum + s.replays, 0);
    const last = steps.at(-1)!;
    const status = last.won ? `terminou as ${steps.length} fases` : `travou na fase ${last.level}`;
    console.log(`\n== bot ${name}, campanha ${c}: ${status} em ${tries + replays} partidas: ${tries} tentativas e ${replays} repetições de fases já vencidas, ${((tries + replays) / steps.length).toFixed(1)} por fase (${((performance.now() - started) / 1000).toFixed(1)} s)`);
    const rows = steps.map((s) => {
      const fight = s.fights.length ? ` luta ${s.fights.map((f) => `${Math.round(f)}s`).join(",")}` : "";
      const back = s.replays ? ` +${s.replays}` : "";
      return `${String(s.level).padStart(2)}${s.fights.length ? "☠" : " "} ${s.runs === 1 ? " " : "x"}${String(s.runs).padStart(2)}${back} ${"★".repeat(s.stars).padEnd(3, "·")} ${upgradesOf(s)}${fight}`;
    });
    for (let i = 0; i < rows.length; i += 2) console.log(rows.slice(i, i + 2).map((r) => r.padEnd(52)).join(""));
    const hard = steps.filter((s) => s.runs >= 4).map((s) => `${s.level} (${s.runs})`);
    if (hard.length) console.log(`fases que pediram 4 ou mais partidas: ${hard.join(", ")}`);
  }
}
