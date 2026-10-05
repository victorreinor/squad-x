import type { VehicleKind, WeaponKind } from "@squadx/engine";

/** What the player reads on screen for the weapons and vehicles, and a small symbol for each. */
export const WEAPON_LABEL: Record<WeaponKind, { name: string; icon: string; tier: number }> = {
  pistol: { name: "Pistola", icon: "🔫", tier: 0 },
  rifle: { name: "Fuzil", icon: "🔫", tier: 1 },
  smg: { name: "Submetralhadora", icon: "🔫", tier: 2 },
  minigun: { name: "Minigun", icon: "⚙️", tier: 3 },
};

export const VEHICLE_LABEL: Record<VehicleKind, { name: string; icon: string }> = {
  moto: { name: "Moto", icon: "🏍️" },
  heli: { name: "Helicóptero", icon: "🚁" },
  tank: { name: "Tanque", icon: "🛞" },
};
