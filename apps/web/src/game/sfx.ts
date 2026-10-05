import { LANE_HALF_WIDTH, type GameState, type VehicleKind } from "@squadx/engine";
import { audio, type SfxName } from "./audio";

/** Ticks between two sounds of a vehicle's gun, and which sound it makes. */
const VEHICLE_SOUND: Record<VehicleKind, { every: number; sfx: SfxName }> = {
  moto: { every: 5, sfx: "moto" },
  heli: { every: 4, sfx: "rifle" },
  tank: { every: 10, sfx: "cannon" },
};

/** Ticks between two sounds of the squad's guns: a steady rattle, not one sound per soldier. */
const SQUAD_SOUND_EVERY = 3;

/** Ticks between two crackles of the fire on the road. */
const CRACKLE_EVERY = 9;

/** Where across the road something happens, as a stereo position: the edges of the road are not hard left and right. */
const panOf = (x: number) => (x / LANE_HALF_WIDTH) * 0.7;

/**
 * The sounds and the music for what changed between two ticks. Like the visual effects, they come from the difference
 * between two states, so the engine never needs to know sound exists.
 */
export function playSounds(prev: GameState, cur: GameState) {
  if (cur.tick === prev.tick) return;
  const squad = panOf(cur.squad.x);

  if (cur.status === "playing") {
    if (cur.tick % SQUAD_SOUND_EVERY === 0 && cur.volleys.some((v) => !v.vehicle && v.hit)) {
      audio.sfx(cur.squad.weapon, Math.min(1, Math.log10(cur.squad.count + 1) / 2.2), squad);
    }
    const vehicles = new Map<VehicleKind, number>();
    for (const v of cur.volleys) if (v.vehicle && v.hit) vehicles.set(v.vehicle, v.x);
    for (const [kind, x] of vehicles) if (cur.tick % VEHICLE_SOUND[kind].every === 0) audio.sfx(VEHICLE_SOUND[kind].sfx, 1, panOf(x));
  }

  // enemies that went down: a pop for the shot ones, a blast for bombers and the boss; those that reached the squad hurt instead
  const alive = new Set(cur.enemies.map((e) => e.id));
  let popped = 0;
  let blast: number | null = null;
  for (const e of prev.enemies) {
    if (alive.has(e.id)) continue;
    if (e.kind === "bomber" || e.kind === "boss") blast = e.x;
    else if (e.z - prev.distance >= 2.6) popped++;
  }
  if (blast !== null) audio.sfx("boom", 1, panOf(blast));
  if (popped) audio.sfx("pop", Math.min(1, popped / 4), squad * 0.5);

  const gate = cur.lastGate?.tick === cur.tick ? cur.lastGate : null;
  if (gate) audio.sfx(gate.good ? "gateGood" : "gateBad", 1, squad);
  else if (cur.squad.count < prev.squad.count) audio.sfx("hurt", Math.min(1, (prev.squad.count - cur.squad.count) / 6), squad);

  const barrels = new Set(cur.barrels.map((b) => b.id));
  for (const b of prev.barrels) {
    if (barrels.has(b.id) || b.z <= prev.distance - 2) continue;
    audio.sfx(b.reward.kind === "weapon" ? "weapon" : b.reward.kind === "vehicle" ? "vehicle" : b.reward.kind === "soldiers" ? "recruit" : "coin", 1, panOf(b.x));
  }

  if (cur.hazards.length && !prev.hazards.length) audio.sfx("warning");
  if (cur.plane && !prev.plane) audio.sfx("plane");
  const impact = cur.lastImpact?.tick === cur.tick ? cur.lastImpact : null;
  if (impact) audio.sfx(impact.kind === "spikes" ? "spikes" : "boom", impact.kind === "mine" ? 0.7 : 1, panOf(impact.x));
  for (const p of cur.popped) audio.sfx(p.kind === "mine" ? "pop" : "boom", p.kind === "mine" ? 0.8 : 0.5, panOf(p.x));

  // the boss: the music turns when it wakes up, grows heavier when it is enraged, and turns back when it falls
  const fight = cur.bossFight;
  if (fight?.awake && !prev.bossFight?.awake) audio.playMusic("boss");
  if (fight?.enraged && !prev.bossFight?.enraged) {
    audio.sfx("roar");
    audio.setFury(true);
  }
  if (prev.bossFight && !fight && cur.status === "playing") audio.playMusic("battle");

  // what it sets going, and its blows landing
  const known = new Set(prev.projectiles.map((p) => p.id));
  const thrown = cur.projectiles.filter((p) => !known.has(p.id));
  const missile = thrown.find((p) => p.kind === "missile");
  if (missile) audio.sfx("launch", 1, panOf(missile.x));
  if (thrown.some((p) => p.kind === "keg")) audio.sfx("roll");
  const marked = new Set(prev.hazards.map((h) => h.id));
  const meteor = cur.hazards.find((h) => h.kind === "meteor" && !marked.has(h.id));
  if (meteor) audio.sfx("meteor", 1, panOf(meteor.x));
  for (const hit of cur.bossHits) {
    const pan = panOf(hit.x);
    if (hit.kind === "slam") audio.sfx("slam", 1, pan);
    else if (hit.kind === "missile" || hit.kind === "keg" || hit.kind === "meteor") audio.sfx("boom", hit.kind === "keg" ? 0.75 : 1, pan);
    else if (hit.kind === "laser") audio.sfx("laser", 1, pan);
    else if (hit.kind === "ice") audio.sfx("freeze", 1, pan);
  }
  if (cur.fires.length && cur.tick % CRACKLE_EVERY === 0) audio.sfx("crackle", Math.min(1, cur.fires.length / 3), panOf(cur.fires[cur.tick % cur.fires.length].x));

  for (const shot of cur.enemyShots) audio.sfx("pistol", 0.4, panOf(shot.x));
}
