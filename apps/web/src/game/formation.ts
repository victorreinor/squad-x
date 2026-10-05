import { COLUMN_SPACING, MAX_SQUAD, squadColumns } from "@squadx/engine";

/** distance between two rows of full-size soldiers (units) */
export const ROW_SPACING = 0.78;
/** how deep the drawn squad gets, first row to last, before its soldiers start to shrink (units) */
const MAX_DEPTH = 4;
/** up to this many soldiers every one is drawn; past it the crowd grows slower than the count */
const SHOWN_EXACTLY = 90;
/** how many soldiers are drawn at most, with a full squad; the counter above the squad tells the real number */
export const SQUAD_SHOWN = 180;
/** below this size the squad is drawn with the light soldier */
export const FAR_BELOW = 0.9;

/** How the squad is drawn: how many soldiers, how big, and how they line up behind the front row. */
export interface Formation {
  shown: number;
  /** the size of each soldier: 1 until the squad would get deeper than `MAX_DEPTH` */
  scale: number;
  cols: number;
  /** distance between two columns and between two rows (units) */
  dx: number;
  dz: number;
  /** from the front row to the last (units) */
  depth: number;
}

/**
 * A small squad stands on the engine's firing columns, full size. A big one keeps the same width (it is what the
 * rules use for traps and bombs) and a bounded depth, so its soldiers get smaller and closer instead of covering the
 * screen: the road ahead, where the choices are, stays in view.
 */
export function squadFormation(count: number): Formation {
  const shown = count <= SHOWN_EXACTLY ? count : Math.round(SHOWN_EXACTLY + (SQUAD_SHOWN - SHOWN_EXACTLY) * Math.sqrt((count - SHOWN_EXACTLY) / (MAX_SQUAD - SHOWN_EXACTLY)));
  const across = squadColumns(count) - 1;
  const fullDepth = (Math.ceil(shown / (across + 1)) - 1) * ROW_SPACING;
  if (fullDepth <= MAX_DEPTH) return { shown, scale: 1, cols: across + 1, dx: COLUMN_SPACING, dz: ROW_SPACING, depth: fullDepth };

  // the size at which `shown` soldiers, each taking its share of a column and of a row, fill the width and the depth:
  // shown = (across / scale + 1) * (deep / scale + 1)
  const deep = MAX_DEPTH / ROW_SPACING;
  const scale = Math.min(1, (across + deep + Math.sqrt((across + deep) ** 2 + 4 * (shown - 1) * across * deep)) / (2 * (shown - 1)));
  const cols = Math.round(across / scale) + 1;
  const rows = Math.ceil(shown / cols);
  const dz = Math.min(ROW_SPACING * scale, MAX_DEPTH / (rows - 1));
  return { shown, scale, cols, dx: (across * COLUMN_SPACING) / (cols - 1), dz, depth: (rows - 1) * dz };
}
