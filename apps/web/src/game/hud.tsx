import { useEffect, useRef, useState } from "react";
import { ARMOR_PER_LEVEL, BOSS_FURY_AT, DAMAGE_PER_LEVEL, SQUAD_PER_LEVEL, type GameState, type Upgrades } from "@squadx/engine";
import type { FeedItem } from "./feed";
import { VEHICLE_LABEL, WEAPON_LABEL } from "./names";

/** A number that rolls to its new value instead of jumping, and flashes green or red in the direction it moved. */
export function Counter({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const from = useRef(value);
  useEffect(() => {
    if (value === from.current) return;
    setFlash(value > from.current ? "up" : "down");
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / 420);
      setShown(Math.round(origin + (value - origin) * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(frame);
      else {
        from.current = value;
        window.setTimeout(() => setFlash(null), 250);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={`counter ${flash ?? ""} ${className ?? ""}`}>{shown}</span>;
}

/** What the player has right now: soldiers, weapon, vehicles and what the shop gave them. */
export function StatusStrip({ state, upgrades }: { state: Pick<GameState["squad"], "count" | "weapon" | "vehicles">; upgrades: Upgrades }) {
  const weapon = WEAPON_LABEL[state.weapon];
  const perks = [
    upgrades.damage > 0 && { icon: "💥", text: `+${Math.round(DAMAGE_PER_LEVEL * upgrades.damage * 100)}%`, title: "Dano" },
    upgrades.armor > 0 && { icon: "🛡️", text: `-${Math.round(ARMOR_PER_LEVEL * upgrades.armor * 100)}%`, title: "Baixas" },
    upgrades.squad > 0 && { icon: "🪖", text: `+${SQUAD_PER_LEVEL * upgrades.squad}`, title: "Reforços" },
  ].filter(Boolean) as { icon: string; text: string; title: string }[];
  return (
    <div className="status" aria-label="Seu esquadrão">
      <div className="chip chip-main" title="Soldados">
        🪖 <Counter value={state.count} />
      </div>
      <div className={`chip tier-${weapon.tier}`} key={state.weapon} title="Arma">
        {weapon.icon} {weapon.name}
      </div>
      {state.vehicles.map((v, i) => (
        <div className="chip chip-vehicle" key={`${v}${i}`} title={VEHICLE_LABEL[v].name}>
          {VEHICLE_LABEL[v].icon} {VEHICLE_LABEL[v].name}
        </div>
      ))}
      {perks.map((p) => (
        <div className="chip chip-perk" key={p.title} title={p.title}>
          {p.icon} {p.text}
        </div>
      ))}
    </div>
  );
}

/**
 * The boss's health, in place of the progress track while it is in sight: a red bar with a pale trail that drains a
 * moment later, so each burst of fire shows how much it took. A notch marks where it turns furious, and then the bar
 * burns brighter.
 */
export function BossBar({ name, hp, max, enraged }: { name: string; hp: number; max: number; enraged: boolean }) {
  const left = `${Math.max(0, Math.min(1, hp / max)) * 100}%`;
  const shown = Math.max(0, Math.ceil(hp));
  return (
    <div className={`boss-bar ${enraged ? "enraged" : ""}`} role="meter" aria-label={`Vida do ${name}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={shown}>
      <div className="boss-bar-trail" style={{ width: left }} />
      <div className="boss-bar-fill" style={{ width: left }} />
      <div className="boss-bar-notch" style={{ left: `${BOSS_FURY_AT * 100}%` }} />
      <span className="boss-bar-name">{enraged ? "😡" : "☠"} {name}</span>
      <span className="boss-bar-hp">{shown.toLocaleString("pt-BR")}</span>
    </div>
  );
}

/** The messages about what just happened, stacking down the left side and fading after a few seconds. */
export function Feed({ items }: { items: (FeedItem & { id: number; count: number })[] }) {
  return (
    <ul className="feed" aria-live="polite">
      {items.map((item) => (
        <li key={item.id} className={`feed-item ${item.tone}`}>
          <span aria-hidden>{item.icon}</span>
          {item.text}
          {item.count > 1 && <b className="feed-count">×{item.count}</b>}
        </li>
      ))}
    </ul>
  );
}
