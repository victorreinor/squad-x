import { SIEGE_HALF_WIDTH, type SiegeState } from "@squadx/engine";
import { audio } from "./audio";

/** Ticks between two sounds of the squad's bows: a steady rattle, not one sound per knight. */
const VOLLEY_EVERY = 3;

/** Where across the bridge something happens, as a stereo position. */
const panOf = (x: number) => (x / SIEGE_HALF_WIDTH) * 0.7;

/** The sounds and the music for what changed between two ticks of the siege, like the campaign's `playSounds`. */
export function playSiegeSounds(prev: SiegeState, cur: SiegeState) {
  if (cur.tick === prev.tick) return;
  const pan = panOf(cur.squad.x);
  if (cur.status === "playing" && cur.tick % VOLLEY_EVERY === 0 && cur.volleys.some((v) => v.hit)) audio.sfx("rifle", Math.min(1, Math.log10(cur.squad.count + 1) / 2.2), pan);
  if (cur.killedNow > 0 && cur.tick % 2 === 0) audio.sfx("pop", Math.min(1, cur.killedNow / 12), pan * 0.5);
  if (cur.lostNow > 0) audio.sfx("hurt", Math.min(1, cur.lostNow / 6), pan);
  if (cur.lastBanner?.tick === cur.tick) audio.sfx(cur.squad.count - prev.squad.count >= 10 ? "recruit" : "gateGood", 1, pan);
  // the music turns when the legion is gone and the boss comes on alone
  if (prev.legion.count > 0 && cur.legion.count === 0) {
    audio.playMusic("boss");
    audio.sfx("roar");
  }
  if (prev.boss.hp > 0 && cur.boss.hp <= 0) audio.sfx("boom");
  // the wall coming down, a champion walking out and a champion falling
  for (const w of cur.walls) {
    const before = prev.walls.find((p) => p.id === w.id);
    if (before && before.hp > 0 && w.hp <= 0) audio.sfx("boom", 1, panOf(w.x));
  }
  if (cur.champions.length > prev.champions.length) audio.sfx("roar", 0.8);
  if (cur.champions.length < prev.champions.length && cur.status === "playing") audio.sfx("boom", 0.6);
}
