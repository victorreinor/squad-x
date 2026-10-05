import { WEAPON_KINDS, bossOf, type BossHit, type BossKind, type GameState } from "@squadx/engine";
import { BOSS_NAME, VEHICLE_LABEL, WEAPON_LABEL } from "./names";

/** How a message should feel: something that helps, something that hurts, a warning, or just news. */
export type Tone = "good" | "bad" | "warn" | "info";

export interface FeedItem {
  icon: string;
  text: string;
  tone: Tone;
}

/** The boss counts as in sight, with a warning and a health bar, once it is this close (units). */
export const BOSS_IN_SIGHT = 70;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What each boss does, told the moment it wakes up: the one thing to know to fight it. */
const BOSS_INTRO: Record<BossKind, FeedItem> = {
  general: { icon: "🚀", tone: "warn", text: "O General lança mísseis: derrube a tiros ou saia da mira" },
  warlord: { icon: "🛢️", tone: "warn", text: "O Senhor da Guerra rola barris explosivos: vá para a faixa livre ou abra caminho a tiros" },
  mech: { icon: "🛡️", tone: "warn", text: "O Mecha tem escudo: só o tiro pela brecha verde passa. E o laser mira a brecha" },
  yeti: { icon: "❄️", tone: "warn", text: "O Yeti congela a faixa e esmaga em seguida: saia do azul" },
  demon: { icon: "☄️", tone: "warn", text: "O Demônio chama meteoros e o chão pega fogo: ache o lugar livre" },
};

/** How each boss blow reads when it lands: what took the soldiers, or the relief of getting out of it. */
const BLOW: Record<Exclude<BossHit["kind"], "ice" | "fire">, { icon: string; what: string; dodged: string }> = {
  slam: { icon: "💥", what: "Pancada do chefão", dodged: "Você desviou da pancada!" },
  missile: { icon: "🚀", what: "Míssil", dodged: "Você saiu da mira do míssil!" },
  keg: { icon: "🛢️", what: "Barril explosivo", dodged: "Os barris passaram longe!" },
  laser: { icon: "🔴", what: "Laser do Mecha", dodged: "Você saiu do laser!" },
  meteor: { icon: "☄️", what: "Meteoro", dodged: "Os meteoros erraram!" },
};

/** What a boss blow that took soldiers is called on the result card. Ice freezes, it does not kill. */
const CAUSE: Record<Exclude<BossHit["kind"], "ice">, string> = {
  slam: "a pancada do chefão",
  missile: "um míssil",
  keg: "os barris explosivos",
  laser: "o laser do Mecha",
  meteor: "um meteoro",
  fire: "o fogo no chão",
};

/** What reads when a mine, a missile or a keg is shot to pieces before it gets to the squad. */
const POPPED: Record<GameState["popped"][number]["kind"], string> = {
  mine: "Mina destruída antes de chegar",
  missile: "Míssil derrubado no ar!",
  keg: "Barril estourado antes de chegar",
};

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
  for (const kind of new Set(cur.popped.map((p) => p.kind))) out.push({ icon: "💥", tone: "good", text: POPPED[kind] });

  if (cur.plane && !prev.plane) out.push({ icon: "✈️", tone: "warn", text: "Bombardeiro! Fique fora das zonas vermelhas" });

  const fight = cur.bossFight;
  if (fight) {
    const boss = bossOf(cur)!;
    const was = bossOf(prev)!;
    if (was.z - prev.distance >= BOSS_IN_SIGHT && boss.z - cur.distance < BOSS_IN_SIGHT) out.push({ icon: "☠️", tone: "warn", text: `${BOSS_NAME[fight.kind]} à frente! Prepare o esquadrão` });
    // the moment it wakes up, say what it does
    if (fight.awake && !prev.bossFight?.awake) out.push(BOSS_INTRO[fight.kind]);
    if (fight.enraged && !prev.bossFight?.enraged) out.push({ icon: "😡", tone: "warn", text: `${BOSS_NAME[fight.kind]} está furioso: ataques mais rápidos!` });
  } else if (prev.bossFight) {
    out.push({ icon: "🏆", tone: "good", text: "Chefão derrotado! Siga para a chegada" });
  }

  // the boss's blows that landed this tick, one message per kind of blow
  for (const kind of Object.keys(BLOW) as (keyof typeof BLOW)[]) {
    const blows = cur.bossHits.filter((h) => h.kind === kind);
    if (!blows.length) continue;
    const taken = blows.reduce((sum, h) => sum + h.lost, 0);
    const b = BLOW[kind];
    out.push(taken > 0 ? { icon: b.icon, tone: "bad", text: `${b.what}: -${plural(taken, "soldado", "soldados")}` } : { icon: "😅", tone: "good", text: b.dodged });
  }
  const ice = cur.bossHits.find((h) => h.kind === "ice");
  if (ice) out.push(ice.lost > 0 ? { icon: "❄️", tone: "bad", text: `${plural(ice.lost, "soldado congelado", "soldados congelados")}: param de atirar` } : { icon: "😅", tone: "good", text: "Você escapou do gelo!" });
  const bomberBlast = prev.enemies.some((e) => e.kind === "bomber" && !cur.enemies.some((c) => c.id === e.id) && e.z - prev.distance < 2.6);
  if (bomberBlast && lost > 0) out.push({ icon: "🧨", tone: "bad", text: `Homem-bomba! -${plural(lost, "soldado", "soldados")}` });
  return out;
}

/** What took the squad's soldiers this tick, as a short phrase, or null when nothing notable did. For the result card. */
export function causeOfLoss(prev: GameState, cur: GameState): string | null {
  if (cur.squad.count >= prev.squad.count) return null;
  if (cur.lastGate?.tick === cur.tick && !cur.lastGate.good) return `um portal ${cur.lastGate.text}`;
  if (cur.lastImpact?.tick === cur.tick) return cur.lastImpact.kind === "spikes" ? "espinhos" : cur.lastImpact.kind === "mine" ? "uma mina" : "uma bomba";
  const blow = cur.bossHits.find((h) => h.lost > 0 && h.kind !== "ice");
  if (blow && blow.kind !== "ice") return CAUSE[blow.kind];
  const boss = bossOf(cur);
  if (boss && boss.z - cur.distance < 20) return "o chefão e seus lacaios";
  const near = cur.enemies.filter((e) => e.z - cur.distance < 4);
  if (near.length) return "a horda";
  return "inimigos";
}
