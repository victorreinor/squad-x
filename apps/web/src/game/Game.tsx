import { useEffect, useRef, useState } from "react";
import { COINS_PER_LEVEL, IDLE, SHOP_FROM_LEVEL, STAR_COINS, TICK_MS, botInput, campaignLevel, campaignSpec, createGame, levelReward, randomSeed, replayShare, runPayout, bossOf, soldiersInStrip, starsFor, step, type GameState, type Input, type LevelDef, type Upgrades } from "@squadx/engine";
import { Scene3D } from "./scene";
import { audio } from "./audio";
import { BOSS_IN_SIGHT, causeOfLoss, deriveFeed, type FeedItem } from "./feed";
import { BossBar, Counter, Feed, StatusStrip } from "./hud";
import { MODE_INFO, TWIST_INFO } from "./modes";
import { BOSS_NAME } from "./names";
import { playSounds } from "./sfx";
import { lookFor } from "./themes";

export interface RunResult {
  level: number;
  stars: number;
  /** coins picked up from barrels */
  coins: number;
  won: boolean;
  /** soldiers left, soldiers lost on the way, and what took the last of them */
  count: number;
  losses: number;
  cause: string | null;
}

/** The level's record before the run, which decides what a win pays: earlier wins, best stars, and the level the player is on. */
export interface RunRecord {
  wins: number;
  best: number;
  frontier?: number;
}

interface Hud {
  count: number;
  progress: number;
  coins: number;
  status: GameState["status"];
  popup: { text: string; good: boolean; key: number } | null;
  /** the boss once it is in sight, for its health bar */
  boss: { name: string; hp: number; max: number; enraged: boolean } | null;
  /** what the squad has to get out of right now, if anything */
  danger: "strip" | "fire" | "ice" | null;
  weapon: GameState["squad"]["weapon"];
  vehicles: GameState["squad"]["vehicles"];
}

/** ?bot, ?bot=1 or ?bot=true lets the engine's test bot drive, handy for looking at a level without playing it. */
const wantsBot = () => {
  const value = new URLSearchParams(location.search).get("bot");
  return value !== null && value !== "0" && value !== "false";
};

/** The boss for its health bar, once it is in sight. */
const bossHud = (s: GameState): Hud["boss"] => {
  const fight = s.bossFight;
  const boss = fight ? bossOf(s) : undefined;
  return fight && boss && boss.z - s.distance < BOSS_IN_SIGHT ? { name: BOSS_NAME[fight.kind], hp: boss.hp, max: boss.maxHp, enraged: fight.enraged } : null;
};

/** The warning over the road: a strip about to be hit (or a missile on its way), the squad standing in fire, or frozen. */
const dangerOf = (s: GameState): Hud["danger"] => {
  if (s.hazards.length || s.projectiles.some((p) => p.kind === "missile")) return "strip";
  if (s.fires.some((f) => soldiersInStrip(s, f.x, f.halfWidth) > 0)) return "fire";
  return s.chill ? "ice" : null;
};

/** What the warning says for each danger. */
const DANGER_TEXT: Record<NonNullable<Hud["danger"]>, string> = { strip: "⚠ SAIA DA FAIXA!", fire: "🔥 SAIA DO FOGO!", ice: "❄ CONGELADOS!" };

/** The boss's health in steps of a percent: the bar's own transition smooths the rest, and the HUD is not redrawn on every hit. */
const bossStep = (h: Hud) => (h.boss ? Math.ceil((h.boss.hp / h.boss.max) * 100) : -1);

const hudOf = (s: GameState): Hud => ({
  count: s.squad.count,
  progress: s.distance / s.length,
  coins: s.coins,
  status: s.status,
  popup: s.lastGate ? { text: s.lastGate.text, good: s.lastGate.good, key: s.lastGate.tick } : null,
  boss: bossHud(s),
  danger: dangerOf(s),
  weapon: s.squad.weapon,
  vehicles: [...s.squad.vehicles],
});

const sameHud = (a: Hud, b: Hud) =>
  a.count === b.count && a.coins === b.coins && a.status === b.status && bossStep(a) === bossStep(b) && a.boss?.enraged === b.boss?.enraged && a.danger === b.danger && a.weapon === b.weapon && a.vehicles.join() === b.vehicles.join() && a.popup?.key === b.popup?.key && Math.round(a.progress * 100) === Math.round(b.progress * 100);

/**
 * One run of one level: the 3D scene, the fixed-step loop and the HUD on top. `def` plays that road instead of the
 * campaign's level `level` (the boss arena), and then the run ends without the report card: the caller decides what next.
 */
export function Game({ level, def, upgrades, record = { wins: 0, best: 0 }, onFinish, onPlay, onShop, onExit }: { level: number; def?: LevelDef; upgrades: Upgrades; record?: RunRecord; onFinish: (r: RunResult) => void; onPlay: (level: number) => void; onShop: () => void; onExit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [muted, setMuted] = useState(audio.muted);
  const [feed, setFeed] = useState<(FeedItem & { id: number; count: number })[]>([]);
  const finish = useRef(onFinish);
  finish.current = onFinish;
  // the level's record as it was when the run started: the report is about this run, not the record it just set
  const before = useRef(record).current;
  const spec = campaignSpec(level);

  useEffect(() => {
    const el = host.current!;
    const state = createGame(def ?? campaignLevel(level), randomSeed(), upgrades);
    const scene = new Scene3D(el, state);
    audio.resume();
    audio.playMusic("battle");
    let prev = structuredClone(state);
    const keys = new Set<string>();
    let target: number | null = null;
    let dragFrom: { clientX: number; squadX: number } | null = null;
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let shownHud: Hud = hudOf(state);
    let lastHudAt = 0;
    let reported = false;
    let feedId = 0;
    let cause: string | null = null;
    setHud(shownHud);

    const autoplay = wantsBot();
    const input = (): Input => {
      if (autoplay) return botInput(state);
      const move = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
      // the keys take over from a drag; after a drag ends the squad still finishes the slide to where it was let go
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
        step(state, input());
        playSounds(prev, state);
        cause = causeOfLoss(prev, state) ?? cause;
        const news = deriveFeed(prev, state);
        if (news.length) {
          const stamped = news.map((n) => ({ ...n, id: ++feedId, count: 1 }));
          // the same news again while it is still on screen counts up on its line instead of stacking a copy
          setFeed((old) => {
            let next = old;
            for (const n of stamped) {
              const same = next.find((x) => x.text === n.text);
              next = [...next.filter((x) => x !== same), same ? { ...n, count: same.count + 1 } : n];
            }
            return next.slice(-4);
          });
          for (const n of stamped) window.setTimeout(() => setFeed((old) => old.filter((x) => x.id !== n.id)), 3200);
        }
      }
      scene.render(prev, state, acc / TICK_MS, dt, now / 1000);

      if (now - lastHudAt > 90) {
        lastHudAt = now;
        const next = hudOf(state);
        if (!sameHud(next, shownHud)) setHud((shownHud = next));
      }
      if (state.status !== "playing" && !reported) {
        reported = true;
        const r: RunResult = { level, stars: starsFor(state), coins: state.coins, won: state.status === "won", count: state.squad.count, losses: state.losses, cause };
        audio.playMusic(null);
        audio.sfx(r.won ? "win" : "lose");
        window.setTimeout(() => {
          setHud(hudOf(state));
          setResult(r);
          finish.current(r);
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
      if (!dragFrom) return;
      target = dragFrom.squadX + (e.clientX - dragFrom.clientX) * scene.unitsPerPixel();
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
    // a level is restarted by remounting (key), never by changing props
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const look = lookFor(spec.theme);
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
              <b>FASE {level}</b>
              <span>
                {look.name} · {MODE_INFO[spec.mode].name}
              </span>
            </div>
            <div className="hud-coins">
              {wantsBot() && <span className="bot-badge">🤖 BOT</span>} 🪙 <Counter value={hud.coins} />
              <button
                className="mute-btn"
                aria-label={muted ? "Ligar o som" : "Desligar o som"}
                onClick={() => {
                  audio.setMuted(!muted);
                  setMuted(!muted);
                }}
              >
                {muted ? "🔇" : "🔊"}
              </button>
            </div>
          </div>
          {hud.boss ? (
            <BossBar name={hud.boss.name} hp={hud.boss.hp} max={hud.boss.max} enraged={hud.boss.enraged} />
          ) : (
            <div className="track">
              <div className="track-fill" style={{ width: `${Math.min(100, hud.progress * 100)}%` }} />
              {spec.boss && <span className="track-boss">☠</span>}
            </div>
          )}
          <StatusStrip state={{ count: hud.count, weapon: hud.weapon, vehicles: hud.vehicles }} upgrades={upgrades} />
          {/* in the flow, between the panel and the messages, so it pushes the messages down instead of covering them */}
          {hud.danger && (
            <div key={hud.danger} className={`slam-warning ${hud.danger}`}>
              {DANGER_TEXT[hud.danger]}
            </div>
          )}
          <Feed items={feed} />
          <div className="mode-banner">
            <b>
              {MODE_INFO[spec.mode].icon} {spec.boss ? "Chefão · " : ""}
              {MODE_INFO[spec.mode].name}
            </b>
            <span>{MODE_INFO[spec.mode].blurb}</span>
            {TWIST_INFO[spec.twist] && (
              <em>
                {TWIST_INFO[spec.twist]!.name}: {TWIST_INFO[spec.twist]!.blurb}
              </em>
            )}
          </div>
          {hud.popup && hud.status === "playing" && (
            <div key={hud.popup.key} className={`popup ${hud.popup.good ? "good" : "bad"}`}>
              {hud.popup.text}
            </div>
          )}
        </div>
      )}
      {result && !def && <ResultCard result={result} upgrades={upgrades} record={before} onPlay={onPlay} onShop={onShop} onExit={onExit} />}
    </div>
  );
}

/**
 * The card after a run: what happened, where the coins came from and what to do next. `record` is how many times the
 * level had been won and its best stars before this run: a level pays less every time it is won again, and only new
 * stars pay.
 */
function ResultCard({ result, upgrades, record, onPlay, onShop, onExit }: { result: RunResult; upgrades: Upgrades; record: RunRecord; onPlay: (level: number) => void; onShop: () => void; onExit: () => void }) {
  const { level } = result;
  const total = runPayout(result.coins, result.stars, upgrades, level, record.wins, record.best, record.frontier);
  const bonus = Math.round(COINS_PER_LEVEL * upgrades.coins * 100);
  const share = replayShare(level, record.wins, record.frontier);
  const again = record.wins > 0 ? ` · ${Math.round(share * 100)}%` : "";
  const needsShop = !result.won && level >= SHOP_FROM_LEVEL;
  return (
    <div className="overlay">
      <div className="card">
        <h2 className={result.won ? "win" : "lose"}>{result.won ? "VITÓRIA!" : "DERROTA"}</h2>
        {result.won && (
          <div className="stars" aria-label={`${result.stars} estrelas`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= result.stars ? "on" : ""} style={{ animationDelay: `${n * 160}ms` }}>
                ★
              </span>
            ))}
          </div>
        )}
        <dl className="report">
          <div>
            <dt>Soldados no fim</dt>
            <dd>{result.count}</dd>
          </div>
          <div>
            <dt>Baixas no caminho</dt>
            <dd className={result.losses > 0 ? "bad" : "good"}>{result.losses}</dd>
          </div>
          {result.won ? (
            <>
              <div>
                <dt>Recompensa da fase{again}</dt>
                <dd>+{Math.round(levelReward(level) * share)} 🪙</dd>
              </div>
              <div>
                <dt>{record.best > 0 ? "Estrelas novas" : "Estrelas"}</dt>
                <dd>+{Math.max(0, result.stars - record.best) * STAR_COINS} 🪙</dd>
              </div>
              <div>
                <dt>Saque dos barris</dt>
                <dd>+{Math.round(result.coins * share)} 🪙</dd>
              </div>
              {bonus > 0 && (
                <div>
                  <dt>Butim</dt>
                  <dd>+{bonus}%</dd>
                </div>
              )}
              <div className="total">
                <dt>Total</dt>
                <dd>+{total} 🪙</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Quem derrubou o esquadrão</dt>
              <dd>{result.cause ?? "—"}</dd>
            </div>
          )}
        </dl>
        {needsShop && <p className="hint">Esta fase pede um esquadrão melhor. Passe na loja, compre melhorias e tente de novo.</p>}
        {!result.won && !needsShop && <p className="hint">Escolha melhor os portais, desvie das zonas vermelhas e atire nas hordas antes que cheguem.</p>}
        <div className="actions">
          {result.won && (
            <button className="btn primary" onClick={() => onPlay(level + 1)}>
              Próxima fase
            </button>
          )}
          {needsShop && (
            <button className="btn primary" onClick={onShop}>
              🛒 Ir à loja
            </button>
          )}
          <button className="btn" onClick={() => onPlay(level)}>
            Jogar de novo
          </button>
          <button className="btn ghost" onClick={onExit}>
            Mapa
          </button>
        </div>
      </div>
    </div>
  );
}
