import { IDLE, NO_UPGRADES, createGame, step, type GameState, type Input, type LevelDef, type Upgrades } from "../src";

/** An empty straight road of `length` units; add what a test needs. */
export function emptyLevel(patch: Partial<LevelDef> = {}): LevelDef {
  return { mode: "mixed", twist: "none", world: 0, length: 100, startSquad: 10, startWeapon: "pistol", gates: [], traps: [], events: [], barrels: [], waves: [], boss: null, theme: "bridge", ...patch };
}

/** Run `ticks` ticks with a fixed input. */
export function run(state: GameState, ticks: number, input: Input = IDLE) {
  for (let i = 0; i < ticks && state.status === "playing"; i++) step(state, input);
}

/** Play a whole level to its end (or a safety cap) and return the final state. */
export function play(level: LevelDef, seed: number, player: (s: GameState) => Input, upgrades: Upgrades = NO_UPGRADES): GameState {
  const state = createGame(level, seed, upgrades);
  for (let i = 0; i < 30 * 900 && state.status === "playing"; i++) step(state, player(state));
  return state;
}

/** Step until `until` holds (or `ticks` pass), with the input `player` picks each tick. Returns whether it held. */
export function runUntil(state: GameState, ticks: number, until: (s: GameState) => boolean, player: (s: GameState) => Input = () => IDLE): boolean {
  for (let i = 0; i < ticks && state.status === "playing"; i++) {
    step(state, player(state));
    if (until(state)) return true;
  }
  return false;
}
