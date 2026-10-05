import { useEffect, useState } from "react";
import { BOSS_KINDS, LEVELS_PER_WORLD, NO_UPGRADES, bossArena, type BossKind } from "@squadx/engine";
import { Game } from "./game/Game";
import { BOSS_NAME } from "./game/names";

/** How long the end of a fight stays on screen before it starts over (ms). */
const RESTART_AFTER = 1500;

const kindOf = (value: string | null): BossKind => (BOSS_KINDS as readonly string[]).includes(value ?? "") ? (value as BossKind) : "general";

/**
 * A page for watching one boss fight after another without playing the campaign: `?chefao=yeti` (add `&bot=1` to let
 * the bot fight). The fight starts over when it ends; the bar at the bottom picks the boss and who plays.
 */
export function BossArena() {
  const params = new URLSearchParams(location.search);
  const [kind, setKind] = useState<BossKind>(kindOf(params.get("chefao")));
  const [bot, setBot] = useState(params.has("bot"));
  const [run, setRun] = useState(0);

  // the URL follows the choice, so a reload (and the game's own ?bot check) sees it
  useEffect(() => {
    history.replaceState(null, "", `?chefao=${kind}${bot ? "&bot=1" : ""}`);
  }, [kind, bot]);

  const restart = () => setRun((r) => r + 1);
  return (
    <>
      <Game
        key={`${kind}-${bot}-${run}`}
        level={BOSS_KINDS.indexOf(kind) * LEVELS_PER_WORLD + 5}
        def={bossArena(kind)}
        upgrades={NO_UPGRADES}
        onFinish={() => window.setTimeout(restart, RESTART_AFTER)}
        onPlay={restart}
        onShop={restart}
        onExit={() => (location.href = location.pathname)}
      />
      <nav className="arena-bar" aria-label="Escolha o chefão">
        {BOSS_KINDS.map((k) => (
          <button key={k} className={`arena-pick ${k === kind ? "on" : ""}`} onClick={() => setKind(k)}>
            {BOSS_NAME[k]}
          </button>
        ))}
        <button className="arena-pick who" onClick={() => setBot((b) => !b)}>
          {bot ? "🤖 Bot joga" : "🕹️ Eu jogo"}
        </button>
      </nav>
    </>
  );
}
