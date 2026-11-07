import type { ExplorationMap } from "./explorationMaps";

/** Preserve authoritative map data while opening local woodland sightlines. */
export function clearForestSightlines(world: ExplorationMap): ExplorationMap {
  const tiles = world.tiles.map(row => row.map(tile => ({ ...tile })));
  if (world.kind !== "forest") return { ...world, tiles };

  const reserved = new Set([world.start, world.bed, world.resident, ...world.nodes, ...world.paths, ...world.props]
    .map(cell => `${cell.row}_${cell.col}`));
  for (const building of world.buildings) {
    for (let row = building.row; row < building.row + building.height; row++) {
      for (let col = building.col; col < building.col + building.width; col++) reserved.add(`${row}_${col}`);
    }
  }

  for (let row = 1; row < world.height - 1; row++) for (let col = 1; col < world.width - 1; col++) {
    const tile = tiles[row][col];
    if (!tile.solid || (tile.key !== "tree" && tile.key !== "rock") || reserved.has(`${row}_${col}`)) continue;
    // A slight southward bias removes crowns in front of Lan without squaring the camp.
    const inCamp = ((col - world.resident.col) / 3.25) ** 2
      + ((row - world.resident.row - 0.5) / 2.75) ** 2 <= 1;
    const atEntry = ((col - (world.width - 3)) / 2.25) ** 2 + ((row - 18.5) / 2.5) ** 2 <= 1;
    // Tree art extends upward from its feet, so foreground rows obscure forage behind it.
    const belowForage = world.nodes.some(node => Math.abs(col - node.col) <= 1 && row >= node.row && row <= node.row + 2);
    if (inCamp || atEntry || belowForage) tiles[row][col] = { key: "grass", solid: false };
  }
  return { ...world, tiles };
}
