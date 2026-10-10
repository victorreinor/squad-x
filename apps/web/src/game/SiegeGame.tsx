import { useEffect, useRef, useState } from "react";
import { IDLE, SIEGE_SKILLED, TICK_MS, createSiege, randomSeed, siegeBotInput, siegeLevel, siegeStars, stepSiege, wallSiegeLevel, type Input, type SiegeState } from "@squadx/engine";
import { audio } from "./audio";
import { BossBar, Counter } from "./hud";
import { SiegeScene } from "./siegeScene";
import { playSiegeSounds } from "./siegeSfx";

interface Hud {
  count: number;
  /** soldiers left in the legion, and what it began with */
  legion: number;
  legionMax: number;
  boss: { hp: number; max: number } | null;
  status: SiegeState["status"];
  popup: { text: string; key: number } | null;
}

const hudOf = (s: SiegeState): Hud => ({
  count: s.squad.count,
  legion: s.legion.count,
  legionMax: s.legion.maxCount,
  boss: s.legion.count === 0 && s.boss.hp > 0 ? { hp: s.boss.hp, max: s.boss.maxHp } : null,
  status: s.status,
  popup: s.lastBanner ? { text: s.lastBanner.text, key: s.lastBanner.tick } : null,
});

const sameHud = (a: Hud, b: Hud) => a.count === b.count && a.legion === b.legion && a.status === b.status && a.boss?.hp === b.boss?.hp && a.popup?.key === b.popup?.key;

/** ?bot, ?bot=1 or ?bot=true lets the engine's test bot drive. */
const wantsBot = () => {
  const value = new URLSearchParams(location.search).get("bot");
  return value !== null && value !== "0" && value !== "false";
};

/** The result of a siege, for the card at the end. */
interface Report {
  won: boolean;
  stars: number;
  count: number;
  losses: number;
  seconds: number;
}

/** The two siege test modes: the bridge (`?modo=cerco`) and the one with a wall and champions (`?modo=muralha`). */
export type SiegeMode = "cerco" | "muralha";

const MODES: Record<SiegeMode, { title: string; blurb: string; level: typeof siegeLevel; hint: string }> = {
  cerco: { title: "CERCO", blurb: "Modo de teste · ponte do castelo", level: siegeLevel, hint: "Os bônus vêm pelas laterais sem parar: a faixa azul cresce com o seu tiro e cada par amarelo vale `+99`, mas quem está na faixa não atira na legião, que mata soldado sem parar quando encosta." },
  muralha: {
    title: "MURALHA",
    blurb: "Modo de teste · derrube a parede",
    level: wallSiegeLevel,
    hint: "Cada `+99` está atrás de uma muralha amarela, que trava a faixa até cair a tiros. Pese cada muralha contra a legião e os campeões, que matam soldados sem parar enquanto você está na faixa.",
  },
};

/** One run of the siege test mode: the 3D scene, the fixed-step loop and the HUD on top. */
function SiegeRun({ mode, onAgain, onExit }: { mode: SiegeMode; onAgain: () => void; onExit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    const el = host.current!;
    const state = createSiege(MODES[mode].level(), randomSeed());
    const scene = new SiegeScene(el, state);
    audio.resume();
    audio.playMusic("battle");
    let prev = structuredClone(state);
    const keys = new Set<string>();
    let target: number | null = null;
    let dragFrom: { clientX: number; squadX: number } | null = null;
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let shownHud = hudOf(state);
    let lastHudAt = 0;
    let reported = false;
    setHud(shownHud);

    const autoplay = wantsBot();
    const input = (): Input => {
      if (autoplay) return siegeBotInput(state, SIEGE_SKILLED);
      const move = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
      if (move) {
        target = null;
        return { move, target: null };
      }
      return target !== null ? { move: 0, target } : IDLE;
    };

    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      acc += dt * 1000;
      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        prev = structuredClone(state);
        stepSiege(state, input());
        playSiegeSounds(prev, state);
      }
      scene.render(prev, state, acc / TICK_MS, dt, now / 1000);

      if (now - lastHudAt > 90) {
        lastHudAt = now;
        const next = hudOf(state);
        if (!sameHud(next, shownHud)) setHud((shownHud = next));
      }
      if (state.status !== "playing" && !reported) {
        reported = true;
        audio.playMusic(null);
        audio.sfx(state.status === "won" ? "win" : "lose");
        window.setTimeout(() => {
          setHud(hudOf(state));
          setReport({ won: state.status === "won", stars: siegeStars(state), count: state.squad.count, losses: state.losses, seconds: Math.round(state.tick / 30) });
        }, 700);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (down) keys.add(k);
      else keys.delete(k);
      if (k.startsWith("Arrow")) e.preventDefault();
    };
    const keyDown = onKey(true);
    const keyUp = onKey(false);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    const canvas = scene.canvas;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      dragFrom = { clientX: e.clientX, squadX: state.squad.x };
      target = state.squad.x;
    };
    const move = (e: PointerEvent) => {
      if (dragFrom) target = dragFrom.squadX + (e.clientX - dragFrom.clientX) * scene.unitsPerPixel();
    };
    const up = () => {
      dragFrom = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    return () => {
      cancelAnimationFrame(raf);
      audio.playMusic("menu");
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      scene.dispose();
    };
  }, []);

  return (
    <div className="game screen">
      <div className="viewport" ref={host} />
      {hud && (
        <div className="hud">
          <div className="hud-top">
            <button className="icon-btn" onClick={onExit} aria-label="Sair">
              ✕
            </button>
            <div className="hud-level">
              <b>{MODES[mode].title}</b>
              <span>{MODES[mode].blurb}</span>
            </div>
            <div className="hud-coins">{wantsBot() && <span className="bot-badge">🤖 BOT</span>}</div>
          </div>
          {hud.boss ? (
            <BossBar name="Ogro da Legião" hp={hud.boss.hp} max={hud.boss.max} enraged={false} />
          ) : (
            <div className="legion-bar" role="meter" aria-label="Legião" aria-valuemin={0} aria-valuemax={hud.legionMax} aria-valuenow={hud.legion}>
              <div className="legion-bar-fill" style={{ width: `${(hud.legion / hud.legionMax) * 100}%` }} />
              <span className="legion-bar-name">⚔ Legião vermelha</span>
              <span className="legion-bar-count">{hud.legion.toLocaleString("pt-BR")}</span>
            </div>
          )}
          <div className="status" aria-label="Seu esquadrão">
            <div className="chip chip-main" title="Soldados">
              🛡️ <Counter value={hud.count} />
            </div>
            <div className="chip" title="Arma">
              🏹 Arqueiros
            </div>
          </div>
          {hud.popup && hud.status === "playing" && (
            <div key={hud.popup.key} className="popup good">
              {hud.popup.text}
            </div>
          )}
        </div>
      )}
      {report && (
        <div className="overlay">
          <div className="card">
            <h2 className={report.won ? "win" : "lose"}>{report.won ? "VITÓRIA!" : "DERROTA"}</h2>
            {report.won && (
              <div className="stars" aria-label={`${report.stars} estrelas`}>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={n <= report.stars ? "on" : ""} style={{ animationDelay: `${n * 160}ms` }}>
                    ★
                  </span>
                ))}
              </div>
            )}
            <dl className="report">
              <div>
                <dt>Soldados no fim</dt>
                <dd>{report.count}</dd>
              </div>
              <div>
                <dt>Baixas</dt>
                <dd className={report.losses > 0 ? "bad" : "good"}>{report.losses}</dd>
              </div>
              <div>
                <dt>Duração</dt>
                <dd>{report.seconds} s</dd>
              </div>
            </dl>
            {!report.won && <p className="hint">{MODES[mode].hint}</p>}
            <div className="actions">
              <button className="btn primary" onClick={onAgain}>
                Jogar de novo
              </button>
              <button className="btn ghost" onClick={onExit}>
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The siege test modes: the run, started over each time the player asks. */
export function Siege({ mode }: { mode: SiegeMode }) {
  const [run, setRun] = useState(0);
  return <SiegeRun key={run} mode={mode} onAgain={() => setRun((r) => r + 1)} onExit={() => (location.href = location.pathname)} />;
}
