import type { GameState, VehicleKind } from "@squadx/engine";
import { audio, type SfxName } from "./audio";

/** Ticks between two sounds of a vehicle's gun, and which sound it makes. */
const VEHICLE_SOUND: Record<VehicleKind, { every: number; sfx: SfxName }> = {
  moto: { every: 5, sfx: "moto" },
  heli: { every: 4, sfx: "rifle" },
  tank: { every: 10, sfx: "cannon" },
};

/** Ticks between two sounds of the squad's guns: a steady rattle, not one sound per soldier. */
const SQUAD_SOUND_EVERY = 3;

/**
 * The sounds for what changed between two ticks. Like the visual effects, they come from the difference between two
 * states, so the engine never needs to know sound exists.
 */
export function playSounds(prev: GameState, cur: GameState) {
  if (cur.tick === prev.tick) return;

  if (cur.status === "playing") {
    if (cur.tick % SQUAD_SOUND_EVERY === 0 && cur.volleys.some((v) => !v.vehicle && v.hit)) {
      audio.sfx(cur.squad.weapon, Math.min(1, Math.log10(cur.squad.count + 1) / 2.2));
    }
    const vehicles = new Set<VehicleKind>();
    for (const v of cur.volleys) if (v.vehicle && v.hit) vehicles.add(v.vehicle);
    for (const kind of vehicles) if (cur.tick % VEHICLE_SOUND[kind].every === 0) audio.sfx(VEHICLE_SOUND[kind].sfx);
  }

  // enemies that went down: a pop for the shot ones, a blast for bombers and the boss; those that reached the squad hurt instead
  const alive = new Set(cur.enemies.map((e) => e.id));
  let popped = 0;
  let bomber = false;
  let boss = false;
  for (const e of prev.enemies) {
    if (alive.has(e.id)) continue;
    if (e.kind === "bomber") bomber = true;
    else if (e.kind === "boss") boss = true;
    else if (e.z - prev.distance >= 2.6) popped++;
  }
  if (bomber || boss) audio.sfx("boom");
  if (popped) audio.sfx("pop", Math.min(1, popped / 4));

  const gate = cur.lastGate?.tick === cur.tick ? cur.lastGate : null;
  if (gate) audio.sfx(gate.good ? "gateGood" : "gateBad");
  else if (cur.squad.count < prev.squad.count) audio.sfx("hurt", Math.min(1, (prev.squad.count - cur.squad.count) / 6));

  const barrels = new Set(cur.barrels.map((b) => b.id));
  for (const b of prev.barrels) {
    if (barrels.has(b.id) || b.z <= prev.distance - 2) continue;
    audio.sfx(b.reward.kind === "weapon" ? "weapon" : b.reward.kind === "vehicle" ? "vehicle" : b.reward.kind === "soldiers" ? "recruit" : "coin");
  }

  if (cur.hazards.length && !prev.hazards.length) audio.sfx("warning");
  if (cur.plane && !prev.plane) audio.sfx("plane");
  const impact = cur.lastImpact?.tick === cur.tick ? cur.lastImpact : null;
  if (impact) audio.sfx(impact.kind === "spikes" ? "spikes" : "boom");
  if (cur.popped.length) audio.sfx("pop", 0.8);
  if (cur.lastSlam && cur.lastSlam.tick === cur.tick) audio.sfx("slam");
  for (let i = 0; i < cur.enemyShots.length; i++) audio.sfx("pistol", 0.4);
}
