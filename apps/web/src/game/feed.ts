import { WEAPON_KINDS, type GameState } from "@squadx/engine";
import { VEHICLE_LABEL, WEAPON_LABEL } from "./names";

/** How a message should feel: something that helps, something that hurts, a warning, or just news. */
export type Tone = "good" | "bad" | "warn" | "info";

export interface FeedItem {
  icon: string;
  text: string;
  tone: Tone;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What happened between two ticks, in words the player can read: portals, barrels, traps, bombs and the boss. Like the
 * sounds and the visual effects, it comes from the difference between two states, so the engine never knows about it.
 */
export function deriveFeed(prev: GameState, cur: GameState): FeedItem[] {
  const out: FeedItem[] = [];
  const lost = prev.squad.count - cur.squad.count;

  const gate = cur.lastGate?.tick === cur.tick ? cur.lastGate : null;
  if (gate) {
    const delta = cur.squad.count - prev.squad.count;
    out.push({
      icon: gate.good ? "🚪" : "💢",
      tone: gate.good ? "good" : "bad",
      text: `Portal ${gate.text}: ${prev.squad.count} → ${cur.squad.count} ${delta < 0 ? `(perdeu ${-delta})` : "soldados"}`,
    });
  }

  // barrels broken this tick and what came out of them
  const barrels = new Set(cur.barrels.map((b) => b.id));
  for (const b of prev.barrels) {
    if (barrels.has(b.id) || b.z <= prev.distance - 2) continue;
    const r = b.reward;
    if (r.kind === "weapon") {
      const better = WEAPON_KINDS.indexOf(r.weapon) > WEAPON_KINDS.indexOf(prev.squad.weapon);
      out.push(better ? { icon: "🔫", tone: "good", text: `Nova arma: ${WEAPON_LABEL[r.weapon].name}!` } : { icon: "🔫", tone: "info", text: `${WEAPON_LABEL[r.weapon].name}: você já tem uma melhor` });
    } else if (r.kind === "vehicle") {
      const room = prev.squad.vehicles.length < 4;
      out.push(room ? { icon: VEHICLE_LABEL[r.vehicle].icon, tone: "good", text: `${VEHICLE_LABEL[r.vehicle].name} se juntou ao esquadrão!` } : { icon: "🚫", tone: "info", text: "Garagem cheia: sem espaço para mais um veículo" });
    } else if (r.kind === "soldiers") {
      out.push({ icon: "🪖", tone: "good", text: `+${plural(r.count, "soldado", "soldados")} recrutados` });
    } else {
      out.push({ icon: "🪙", tone: "good", text: `+${r.count} moedas` });
    }
  }

  const hit = cur.lastImpact?.tick === cur.tick ? cur.lastImpact : null;
  if (hit) {
    const what = hit.kind === "spikes" ? "Espinhos" : hit.kind === "mine" ? "Mina" : "Bomba";
    out.push(hit.lost > 0 ? { icon: hit.kind === "bomb" ? "💣" : "⚠️", tone: "bad", text: `${what}! -${plural(hit.lost, "soldado", "soldados")}` } : { icon: "😅", tone: "good", text: `${what}: você desviou` });
  }
  if (cur.popped.length) out.push({ icon: "💥", tone: "good", text: "Mina destruída antes de chegar" });

  if (cur.plane && !prev.plane) out.push({ icon: "✈️", tone: "warn", text: "Bombardeiro! Fique fora das zonas vermelhas" });
  const newSlam = cur.hazards.some((h) => h.kind === "slam") && !prev.hazards.some((h) => h.kind === "slam");
  if (newSlam) out.push({ icon: "⚠️", tone: "warn", text: "O chefão vai esmagar a pista! Mude de faixa" });
  if (cur.lastSlam?.tick === cur.tick) out.push(cur.lastSlam.lost > 0 ? { icon: "💥", tone: "bad", text: `Pancada do chefão: -${plural(cur.lastSlam.lost, "soldado", "soldados")}` } : { icon: "😅", tone: "good", text: "Você desviou da pancada!" });

  const boss = cur.enemies.find((e) => e.kind === "boss");
  if (boss) {
    const wasFar = !prev.enemies.some((e) => e.kind === "boss" && e.z - prev.distance < 70);
    if (wasFar && boss.z - cur.distance < 70) out.push({ icon: "☠️", tone: "warn", text: "Chefão à frente! Prepare o esquadrão" });
  }
  const bomberBlast = prev.enemies.some((e) => e.kind === "bomber" && !cur.enemies.some((c) => c.id === e.id) && e.z - prev.distance < 2.6);
  if (bomberBlast && lost > 0) out.push({ icon: "🧨", tone: "bad", text: `Homem-bomba! -${plural(lost, "soldado", "soldados")}` });
  return out;
}

/** What took the squad's soldiers this tick, as a short phrase, or null when nothing notable did. For the result card. */
export function causeOfLoss(prev: GameState, cur: GameState): string | null {
  if (cur.squad.count >= prev.squad.count) return null;
  if (cur.lastGate?.tick === cur.tick && !cur.lastGate.good) return `um portal ${cur.lastGate.text}`;
  if (cur.lastImpact?.tick === cur.tick) return cur.lastImpact.kind === "spikes" ? "espinhos" : cur.lastImpact.kind === "mine" ? "uma mina" : "uma bomba";
  if (cur.lastSlam?.tick === cur.tick) return "a pancada do chefão";
  const boss = cur.enemies.find((e) => e.kind === "boss");
  if (boss && boss.z - cur.distance < 20) return "o chefão e seus lacaios";
  const near = cur.enemies.filter((e) => e.z - cur.distance < 4);
  if (near.length) return "a horda";
  return "inimigos";
}
