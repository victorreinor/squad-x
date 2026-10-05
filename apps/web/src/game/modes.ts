import type { LevelMode, LevelTwist } from "@squadx/engine";

/** What each kind of level is called and how it is explained to the player. */
export const MODE_INFO: Record<LevelMode, { name: string; icon: string; blurb: string }> = {
  gates: { name: "Portais", icon: "±", blurb: "Escolha os portais certos e atire neles para subir o número." },
  loot: { name: "Barris", icon: "🛢️", blurb: "Abra os barris: armas, veículos e soldados. Aqui você começa com mais gente." },
  mixed: { name: "Misto", icon: "✦", blurb: "Portais, barris e hordas, tudo ao mesmo tempo." },
};

/** What makes a level its own, in the player's words. `none` has nothing to announce. */
export const TWIST_INFO: Record<LevelTwist, { name: string; blurb: string } | null> = {
  none: null,
  swarm: { name: "Enxame", blurb: "Uma multidão de inimigos fracos." },
  elite: { name: "Elite", blurb: "Poucos inimigos, mas fortes." },
  ambush: { name: "Emboscada", blurb: "Eles aparecem em cima de você." },
  scarce: { name: "Escassez", blurb: "Quase nenhuma arma ou veículo nos barris." },
  rush: { name: "Correria", blurb: "Portais um atrás do outro." },
  traps: { name: "Armadilhas", blurb: "Portais que fazem você pensar: nem todo vermelho é ruim." },
};
