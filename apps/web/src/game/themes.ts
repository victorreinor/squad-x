/** How one scenery looks. `props` are the boxes (buildings, rocks, pylons) standing beside the road. */
export interface ThemeLook {
  name: string;
  sky: number;
  /** the colour of the sky overhead; the sky fades from this down to `sky` at the horizon */
  skyTop: number;
  ground: number;
  /** the road's base colour, as a CSS colour for the canvas texture */
  road: string;
  rail: number;
  props: number[];
  /** tall paired pylons every so often (suspension bridge) instead of scattered props */
  pylons: boolean;
  /** the ground sits far below the road, like water under a bridge */
  sunken: boolean;
  sun: number;
  /** what grows beside the road, if anything */
  plants: "cactus" | "pine" | null;
  /** the ground is glowing lava rather than a plain colour */
  lava: boolean;
}

/** Keyed by the engine's `LevelDef.theme`. */
export const THEME_LOOKS: Record<string, ThemeLook> = {
  bridge: { name: "Ponte", sky: 0xbfe6ff, skyTop: 0x3d8fe0, ground: 0x2f86bd, road: "#9ba1aa", rail: 0xd24a3a, props: [0xd24a3a], pylons: true, sunken: true, sun: 0xfff3d6, plants: null, lava: false },
  desert: { name: "Deserto", sky: 0xffe9c0, skyTop: 0x6fb2ee, ground: 0xd9b57a, road: "#7d7c82", rail: 0x8d8d99, props: [0xc99655, 0xb07c42, 0xe0b878], pylons: false, sunken: false, sun: 0xffe2b0, plants: "cactus", lava: false },
  city: { name: "Cidade", sky: 0xd5dfe9, skyTop: 0x6f8fb3, ground: 0x4c525b, road: "#5d626b", rail: 0x9aa0aa, props: [0x7b8794, 0x5f6b7a, 0x9aa7b5, 0xb57f5a], pylons: false, sunken: false, sun: 0xffffff, plants: null, lava: false },
  snow: { name: "Neve", sky: 0xeef6fd, skyTop: 0x9cc4e8, ground: 0xf1f7fc, road: "#8c97a5", rail: 0x6e8fb3, props: [0xdfeaf5, 0xb9d3ea, 0x7fa4c8], pylons: false, sunken: false, sun: 0xeaf4ff, plants: "pine", lava: false },
  volcano: { name: "Vulcão", sky: 0xff7a3a, skyTop: 0x2a0e12, ground: 0xff5a1f, road: "#4a4044", rail: 0xff6a2a, props: [0x3a2a2a, 0x58332b, 0xff5a1f], pylons: false, sunken: false, sun: 0xffb07a, plants: null, lava: true },
};

export const lookFor = (theme: string): ThemeLook => THEME_LOOKS[theme] ?? THEME_LOOKS.bridge;
