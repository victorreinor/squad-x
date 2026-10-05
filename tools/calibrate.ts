/**
 * Plays every level of the campaign with bots to find how hard it can be and how strong a good player's squad is along
 * it, and writes the answer to `packages/engine/src/pressures.ts`. Run it after changing the rules, the level generator,
 * the bots or the shop: `bun run calibrate` for every level, or `bun run calibrate 50 3,4` for some.
 */
import { LEVELS_PER_WORLD, NO_UPGRADES, calibratePressure, campaignSpec, expectedUpgrades, settledTrace } from "../packages/engine/src";
import { PRESSURES } from "../packages/engine/src/pressures";

const levels = Number(process.argv[2] ?? LEVELS_PER_WORLD * 5);
const only = process.argv[3] ? process.argv[3].split(",").map(Number) : null;
const out = new URL("../packages/engine/src/pressures.ts", import.meta.url);
const table = { ...PRESSURES };
const started = performance.now();
for (let n = 1; n <= levels; n++) {
  if (only && !only.includes(n)) continue;
  const gentle = n <= 2;
  const { count, fire } = settledTrace(n, gentle ? NO_UPGRADES : expectedUpgrades(n));
  const round = (xs: number[]) => xs.map((x) => Math.round(x * 10) / 10);
  table[n] = { pressure: calibratePressure(n), count: round(count), fire: round(fire) };
  console.log(`level ${n} (${campaignSpec(n).mode}/${campaignSpec(n).twist}): pressure ${table[n].pressure}`);
}
const rows = Object.entries(table)
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([n, t]) => `  ${n}: { pressure: ${t.pressure}, count: ${JSON.stringify(t.count)}, fire: ${JSON.stringify(t.fire)} },`)
  .join("\n");
await Bun.write(
  out,
  `/** How hard each campaign level is and how strong the squad is along it, from \`bun run calibrate\` (see \`calibrate.ts\`). Do not edit by hand. */\nexport const PRESSURES: Record<number, { pressure: number; count: number[]; fire: number[] }> = {\n${rows}\n};\n`,
);
console.log(`done in ${((performance.now() - started) / 1000).toFixed(1)} s`);
