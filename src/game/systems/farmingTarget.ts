import type { ParsedMap } from "../../data/maps/farm01.types";

export interface PointerFarmTarget {
  tileId: string;
  row: number;
  col: number;
  key: "grass" | "soil";
}

export function getPointerFarmTarget(
  world: ParsedMap,
  player: { x: number; y: number },
  point: { x: number; y: number },
  reserved: readonly string[],
): PointerFarmTarget | null {
  const size = 32;
  for (const position of [player, point]) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)
      || position.x < 0 || position.y < 0 || position.x >= world.width * size || position.y >= world.height * size) return null;
  }
  const row = Math.floor(point.y / size), col = Math.floor(point.x / size);
  const playerRow = Math.floor(player.y / size), playerCol = Math.floor(player.x / size);
  if (Math.max(Math.abs(row - playerRow), Math.abs(col - playerCol)) > 1) return null;
  const tileId = `${row}_${col}`, tile = world.tiles[row]?.[col];
  if (!tile || tile.solid || (tile.key !== "grass" && tile.key !== "soil") || reserved.includes(tileId)) return null;
  return { tileId, row, col, key: tile.key };
}
