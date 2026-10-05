import { Counter } from "../game/hud";
import { ARMOR_PER_LEVEL, COINS_PER_LEVEL, DAMAGE_PER_LEVEL, SQUAD_PER_LEVEL, UPGRADE_KINDS, UPGRADE_MAX_LEVEL, upgradeCost, type UpgradeKind } from "@squadx/engine";
import type { Progress } from "../game/progress";

/** How each upgrade is named and what a level of it does, in the player's words. */
const INFO: Record<UpgradeKind, { name: string; icon: string; effect: (level: number) => string }> = {
  damage: { name: "Dano", icon: "💥", effect: (l) => `+${Math.round(DAMAGE_PER_LEVEL * l * 100)}% de dano em tudo que atira` },
  squad: { name: "Reforços", icon: "🪖", effect: (l) => `+${SQUAD_PER_LEVEL * l} soldado${SQUAD_PER_LEVEL * l === 1 ? "" : "s"} no começo de cada fase` },
  armor: { name: "Resistência", icon: "🛡️", effect: (l) => `${Math.round(ARMOR_PER_LEVEL * l * 100)}% menos baixas por inimigos, armadilhas e bombas` },
  coins: { name: "Butim", icon: "🪙", effect: (l) => `+${Math.round(COINS_PER_LEVEL * l * 100)}% de moedas por fase` },
};

/** The shop: spend coins on permanent upgrades. */
export function Shop({ progress, onBuy, onBack }: { progress: Progress; onBuy: (kind: UpgradeKind) => void; onBack: () => void }) {
  return (
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
    </main>
  );
}
