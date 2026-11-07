import { FORAGE_NODES } from "../../data/exploration";
import { areaExits, passagePathCells } from "../../data/maps/areaConnections";
import type { ExplorationKind, ExplorationMap, MapCell } from "../../data/maps/explorationMaps";

export type AreaMapCellKind = "ground" | "blocked" | "path" | "building";
export type AreaMapMarkerKind = "player" | "resident" | "exit" | "branch" | "stone" | "wild_mushroom" | "building";
export interface AreaMapMarker {
  id: string;
  kind: AreaMapMarkerKind;
  label: string;
  /** Coordinates in tiles, matching the actual world rather than a separate layout. */
  x: number;
  y: number;
}
export interface AreaMapSnapshot {
  area: ExplorationKind;
  width: number;
  height: number;
  cells: (MapCell & { kind: AreaMapCellKind })[];
  markers: AreaMapMarker[];
}

/** A fresh display snapshot; never writes to world, session, or save data. */
export function buildAreaMap(world: ExplorationMap, player: { x: number; y: number }, picked: readonly string[]): AreaMapSnapshot {
  const paths = new Set([...world.paths, ...passagePathCells(world, world.kind)].map(p => `${p.row}_${p.col}`));
  const buildings = new Set<string>();
  for (const b of world.buildings) for (let row = b.row; row < b.row + b.height; row++) {
    for (let col = b.col; col < b.col + b.width; col++) buildings.add(`${row}_${col}`);
  }
  const cells: AreaMapSnapshot["cells"] = [];
  for (let row = 0; row < world.height; row++) for (let col = 0; col < world.width; col++) {
    const id = `${row}_${col}`;
    const kind = buildings.has(id) ? "building" : world.tiles[row][col].solid ? "blocked" : paths.has(id) ? "path" : "ground";
    cells.push({ row, col, kind });
  }
  const markers: AreaMapMarker[] = world.buildings.map(b => ({
    id: `building_${b.row}_${b.col}`, kind: "building", label: b.label,
    x: b.col + b.width / 2, y: b.row + b.height / 2,
  }));
  markers.push({ id: "resident", kind: "resident", label: world.kind === "forest" ? "岚" : "阿榆", x: world.resident.col + 0.5, y: world.resident.row + 0.5 });
  const collected = new Set(picked);
  for (const p of world.nodes) if (!collected.has(p.id)) {
    markers.push({ id: p.id, kind: p.itemId, label: FORAGE_NODES.find(n => n.id === p.id)!.name, x: p.col + 0.5, y: p.row + 0.5 });
  }
  for (const exit of areaExits(world.kind)) markers.push({
    id: exit.id, kind: "exit", label: exit.edge === "left" ? "← 农场" : "农场 →",
    x: exit.edge === "left" ? 0.5 : world.width - 0.5, y: exit.row + 1,
  });
  markers.push({ id: "player", kind: "player", label: "你", x: player.x / 32, y: player.y / 32 });
  return { area: world.kind, width: world.width, height: world.height, cells, markers };
}
