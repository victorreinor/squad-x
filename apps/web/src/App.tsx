import { useEffect, useState } from "react";
import { LEVELS_PER_WORLD, LEVEL_MODES, SHOP_FROM_LEVEL, campaignSpec, expectedUpgrades } from "@squadx/engine";
import { audio } from "./game/audio";
import { Counter } from "./game/hud";
import { Game, type RunResult } from "./game/Game";
import { hasProgress, loadProgress, purchase, recordRun, resetProgress, startedOver } from "./game/progress";
import { Shop } from "./screens/Shop";
import { MODE_INFO } from "./game/modes";
import { lookFor } from "./game/themes";

/** how many levels the map shows; the generator has no real end */
const MAP_LEVELS = LEVELS_PER_WORLD * 5;

export function App() {
  const [progress, setProgress] = useState(loadProgress);
  // `run` changes on every start so replaying the same level remounts the game
  const [run, setRun] = useState<{ level: number; id: number } | null>(null);
  const [shop, setShop] = useState(false);

  // browsers only let sound start after a tap, so the first touch anywhere wakes it up
  useEffect(() => {
    const wake = () => audio.resume();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  const play = (level: number) => setRun((r) => ({ level, id: (r?.id ?? 0) + 1 }));
  const onFinish = (r: RunResult) => setProgress((p) => recordRun(p, r.level, r.stars, r.coins));

  if (run) return <Game key={run.id} level={run.level} upgrades={progress.upgrades} record={{ wins: progress.wins[run.level] ?? 0, best: progress.stars[run.level] ?? 0 }} onFinish={onFinish} onPlay={play} onShop={() => { setRun(null); setShop(true); }} onExit={() => setRun(null)} />;
  if (shop) return <Shop progress={progress} onBuy={(kind) => setProgress((p) => purchase(p, kind))} onBack={() => setShop(false)} />;
  return <Home progress={progress} onPlay={play} onShop={() => setShop(true)} onReset={() => setProgress(resetProgress())} />;
}

/** The sound button of the menus. */
export function MuteButton() {
  const [muted, setMuted] = useState(audio.muted);
  return (
    <button
      className="mute-btn corner"
      aria-label={muted ? "Ligar o som" : "Desligar o som"}
      onClick={() => {
        audio.setMuted(!muted);
        setMuted(!muted);
      }}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

function Home({ progress, onPlay, onShop, onReset }: { progress: ReturnType<typeof loadProgress>; onPlay: (level: number) => void; onShop: () => void; onReset: () => void }) {
  const next = Math.min(progress.unlocked, MAP_LEVELS);
  // how many upgrades short of what a typical player has by now: the campaign is tuned for that player
  const owned = progress.upgrades.damage + progress.upgrades.squad + progress.upgrades.armor;
  const want = expectedUpgrades(next);
  const behind = next >= SHOP_FROM_LEVEL ? Math.max(0, want.damage + want.squad + want.armor - owned) : 0;
  // a save from an older version was wiped: say why the player is back at level 1, until they close it or play
  const [news, setNews] = useState(startedOver && next === 1);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => audio.playMusic("menu"), []);
  const worlds = Array.from({ length: MAP_LEVELS / LEVELS_PER_WORLD }, (_, w) => w);
  return (
    <>
      <main className="home screen">
        <MuteButton />
        <header className="title">
          <h1>
            SQUAD <i>X</i>
          </h1>
          <p>Multiplique o esquadrão. Segure a horda.</p>
          <div className="wallet">
            🪙 <Counter value={progress.coins} />
          </div>
        </header>

        {news && (
          <button className="readiness news" onClick={() => setNews(false)}>
            <b>🆕 Versão nova: cada chefão ataca do seu jeito</b>
            <span>Mísseis, barris explosivos, escudo com laser, gelo e chuva de meteoros. Por isso o progresso de todo mundo recomeçou da fase 1. Toque para fechar.</span>
          </button>
        )}

        {behind > 0 && (
          <button className="readiness" onClick={onShop}>
            <b>🛒 Você está atrás para a fase {next}</b>
            <span>
              Faltam {behind} {behind === 1 ? "melhoria" : "melhorias"} para um esquadrão à altura. Sem elas, a fase tende a ser pesada demais.
            </span>
          </button>
        )}

        <button className="btn primary big" onClick={() => onPlay(next)}>
          JOGAR · FASE {next}
        </button>
        <button className="btn" onClick={onShop}>
          🛒 Loja de melhorias
        </button>

        <ul className="legend" aria-label="Tipos de fase">
          {LEVEL_MODES.map((mode) => (
            <li key={mode}>
              <b>
                {MODE_INFO[mode].icon} {MODE_INFO[mode].name}
              </b>
              <span>{MODE_INFO[mode].blurb}</span>
            </li>
          ))}
        </ul>

        <section className="map" aria-label="Mapa de fases">
          {worlds.map((w) => {
            const first = w * LEVELS_PER_WORLD + 1;
            return (
              <div className="world" key={w}>
                <h3>
                  Mundo {w + 1} · {lookFor(campaignSpec(first).theme).name}
                </h3>
                <div className="nodes">
                  {Array.from({ length: LEVELS_PER_WORLD }, (_, i) => {
                    const n = first + i;
                    const locked = n > progress.unlocked;
                    const spec = campaignSpec(n);
                    const boss = spec.boss;
                    const stars = progress.stars[n] ?? 0;
                    return (
                      <button key={n} className={`node ${locked ? "locked" : ""} ${n === next ? "current" : ""} ${boss ? "boss" : ""}`} disabled={locked} onClick={() => onPlay(n)} title={MODE_INFO[spec.mode].name}>
                        <span className="mode-dot" aria-hidden>
                          {MODE_INFO[spec.mode].icon}
                        </span>
                        <span className="num">{locked ? "🔒" : boss ? "☠" : n}</span>
                        <span className="mini-stars">{[1, 2, 3].map((s) => (s <= stars ? "★" : "☆"))}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {hasProgress(progress) && (
          <button className="btn ghost small" onClick={() => setConfirming(true)}>
            Recomeçar do zero
          </button>
        )}
      </main>
      {/* outside the menu, which scrolls and animates: inside it the overlay would cover the top of the page, not the screen */}
      {confirming && (
        <ConfirmReset
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onReset();
          }}
        />
      )}
    </>
  );
}

/** Asks before erasing the progress: it can't be undone. Cancel is the button under the thumb and the default. */
function ConfirmReset({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onCancel]);
  return (
    <div className="overlay confirm" onClick={onCancel}>
      <div className="card" role="alertdialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-text" onClick={(e) => e.stopPropagation()}>
        <h2 id="reset-title" className="lose">
          Recomeçar?
        </h2>
        <p id="reset-text">Isso apaga as fases vencidas, as estrelas, as moedas e as melhorias da loja, e o jogo volta para a fase 1. Não dá para desfazer.</p>
        <div className="actions">
          <button className="btn danger" onClick={onConfirm}>
            Apagar tudo
          </button>
          <button className="btn primary" autoFocus onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
