import type { ParsedMap } from "../../data/maps/farm01.types";

export interface FarmDetail { row: number; col: number; kind: "flowers" | "tufts" }

/** Small art patches, never terrain edits. Each decoration stays inside its tile. */
export function planFarmDetails(world: ParsedMap): FarmDetail[] {
  const cells = new Map<string, FarmDetail>();
  const safe = (row: number, col: number) => {
    if (world.tiles[row]?.[col]?.key !== "grass") return false;
    if (Math.abs(row - world.start.row) <= 1 && Math.abs(col - world.start.col) <= 1) return false;
    if (Math.abs(row - world.bed.row) <= 1 && Math.abs(col - world.bed.col) <= 1) return false;
    // Keep the central approach between the spawn and cultivated beds clear.
    return !(col >= 11 && col <= 13 && row >= 5 && row <= 15);
  };
  const add = (row: number, col: number, kind: FarmDetail["kind"]) => {
    if (safe(row, col)) cells.set(`${row}_${col}`, { row, col, kind });
  };
  for (const [row, col] of [[12, 8], [12, 17], [6, 5], [6, 17]]) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (Math.abs(dr) + Math.abs(dc) > 2) continue;
        if (Math.abs(dr) + Math.abs(dc) === 2 && (row + col + dr * 3 + dc * 7) % 3 === 0) continue;
        add(row + dr, col + dc, (dr + dc + row) % 2 === 0 ? "flowers" : "tufts");
      }
    }
  }
  for (let row = 3; row <= Math.min(18, world.height - 1); row++) {
    for (let col = 3; col <= Math.min(20, world.width - 1); col++) {
      if (world.tiles[row]?.[col]?.key !== "tree") continue;
      for (const [dr, dc] of [[0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
        add(row + dr, col + dc, "tufts");
      }
    }
  }
  return [...cells.values()];
}
