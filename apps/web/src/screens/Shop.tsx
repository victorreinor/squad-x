import { useState } from "react";
import { Counter } from "../game/hud";
import { ARMOR_PER_LEVEL, COINS_PER_LEVEL, DAMAGE_PER_LEVEL, SHOP_REFUNDS, SQUAD_PER_LEVEL, UPGRADE_KINDS, UPGRADE_MAX_LEVEL, upgradeCost, upgradesWorth, type UpgradeKind } from "@squadx/engine";
import type { Progress } from "../game/progress";
import { UPGRADE_LABEL } from "../game/names";
import { Confirm } from "./Confirm";

/** How each upgrade is named and what a level of it does, in the player's words. */
const INFO: Record<UpgradeKind, { name: string; icon: string; effect: (level: number) => string }> = {
  damage: { ...UPGRADE_LABEL.damage, effect: (l) => `+${Math.round(DAMAGE_PER_LEVEL * l * 100)}% de dano em tudo que atira` },
  squad: { ...UPGRADE_LABEL.squad, effect: (l) => `+${SQUAD_PER_LEVEL * l} soldado${SQUAD_PER_LEVEL * l === 1 ? "" : "s"} no começo de cada fase` },
  armor: { ...UPGRADE_LABEL.armor, effect: (l) => `${Math.round(ARMOR_PER_LEVEL * l * 100)}% menos baixas por inimigos, armadilhas e bombas` },
  coins: { ...UPGRADE_LABEL.coins, effect: (l) => `+${Math.round(COINS_PER_LEVEL * l * 100)}% de moedas por fase` },
};

/** The shop: spend coins on permanent upgrades, and take them all back, `SHOP_REFUNDS` times a campaign. */
export function Shop({ progress, onBuy, onRefund, onBack }: { progress: Progress; onBuy: (kind: UpgradeKind) => void; onRefund: () => void; onBack: () => void }) {
  const [asking, setAsking] = useState(false);
  const worth = upgradesWorth(progress.upgrades);
  const left = SHOP_REFUNDS - progress.refunds;
  const plural = (n: number) => (n === 1 ? "1 devolução" : `${n} devoluções`);
  return (
    <>
      <main className="home shop screen">
        <header className="title">
          <h1>LOJA</h1>
          <div className="wallet">
            🪙 <Counter value={progress.coins} />
          </div>
        </header>

        <ul className="upgrades">
          {UPGRADE_KINDS.map((kind) => {
            const level = progress.upgrades[kind];
            const maxed = level >= UPGRADE_MAX_LEVEL;
            const cost = upgradeCost(kind, level);
            const afford = progress.coins >= cost;
            return (
              <li key={kind} className="upgrade">
                <span className="upgrade-icon" aria-hidden>
                  {INFO[kind].icon}
                </span>
                <div className="upgrade-text">
                  <b>
                    {INFO[kind].name} <small>nível {level}/{UPGRADE_MAX_LEVEL}</small>
                  </b>
                  <span>{INFO[kind].effect(level)}</span>
                  {!maxed && <span className="next">Próximo: {INFO[kind].effect(level + 1)}</span>}
                  <div className="level-bar" aria-hidden>
                    <div style={{ width: `${(level / UPGRADE_MAX_LEVEL) * 100}%` }} />
                  </div>
                </div>
                <button className="btn primary" disabled={maxed || !afford} onClick={() => onBuy(kind)}>
                  {maxed ? "MÁX" : `🪙 ${cost}`}
                </button>
              </li>
            );
          })}
        </ul>

        <button className="btn" onClick={onBack}>
          Voltar ao mapa
        </button>

        <section className="refund">
          <button className="btn ghost small" disabled={worth === 0 || left === 0} onClick={() => setAsking(true)}>
            ↺ Devolver melhorias{worth > 0 && left > 0 ? ` · 🪙 ${worth}` : ""}
          </button>
          <span>{left > 0 ? `Todas as moedas gastas voltam para você comprar de novo. ${left === 1 ? "Resta" : "Restam"} ${plural(left)} no jogo.` : `Você já usou as ${plural(SHOP_REFUNDS)}.`}</span>
        </section>
      </main>
      {asking && (
        <Confirm
          title="Devolver tudo?"
          action={`Devolver 🪙 ${worth}`}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            onRefund();
          }}
        >
          Todas as melhorias voltam para o nível 0 e as 🪙 {worth} gastas nelas voltam para a carteira, para você comprar de novo como quiser.{" "}
          {left === 1 ? "Esta é a sua última devolução." : `Depois desta, ${left - 1 === 1 ? "resta" : "restam"} ${plural(left - 1)}.`}
        </Confirm>
      )}
    </>
  );
}
