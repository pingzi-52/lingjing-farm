import type { ExplorationMap, MapCell } from "../../data/maps/explorationMaps";
import { passagePathCells } from "../../data/maps/areaConnections";
import type { HasVisualFrame } from "./cropVisual";

export interface ExplorationDetail extends MapCell { kind: "flowers" | "tufts" }
export interface PropOverride extends MapCell {
  role: "field-kit" | "workbench" | "civic-lantern";
  texture: string;
  frame: string;
  maxSize: number;
}
export interface ExplorationDecorPlan {
  details: ExplorationDetail[];
  propOverrides: PropOverride[];
  labels: (MapCell & { text: string })[];
}

/** Sparse clusters; roads, collision geometry and stable interaction points are read-only. */
export function planExplorationDecor(world: ExplorationMap): ExplorationDecorPlan {
  const paths = new Set([...world.paths, ...passagePathCells(world, world.kind)].map(p => `${p.row}_${p.col}`));
  const protectedPoints = [world.start, world.resident, ...world.nodes, ...world.props];
  const anchors = world.kind === "forest" ? [[19, 12], [15, 9], [21, 7], [21, 21], [9, 8]] : [[17, 19], [10, 4], [10, 28], [18, 12]];
  const details: ExplorationDetail[] = [];
  for (let row = 1; row < world.height - 1; row++) for (let col = 1; col < world.width - 1; col++) {
    if (world.tiles[row][col].solid || world.tiles[row][col].key !== "grass" || paths.has(`${row}_${col}`)) continue;
    if (protectedPoints.some(p => Math.max(Math.abs(row - p.row), Math.abs(col - p.col)) <= 1)) continue;
    if (!anchors.some(([r, c]) => Math.abs(row - r) + Math.abs(col - c) <= 2)) continue;
    if ((row * 7 + col * 13) % 3 === 0) continue;
    details.push({ row, col, kind: (row + col) % 4 === 0 ? "flowers" : "tufts" });
  }
  const candidates: PropOverride[] = world.kind === "forest"
    ? [{ row: 16, col: 11, role: "field-kit", texture: "TX Props", frame: "TX Props Chest", maxSize: 30 }]
    : [{ row: 10, col: 12, role: "workbench", texture: "farm-forage-v1", frame: "workbench", maxSize: 32 },
      { row: 10, col: 20, role: "civic-lantern", texture: "TX Props", frame: "TX Props Stone Lantern", maxSize: 32 }];
  const propOverrides = candidates.filter(p => world.props.some(old => old.row === p.row && old.col === p.col && old.blocking)
    && world.tiles[p.row]?.[p.col]?.solid);
  return {
    details: details.slice(0, world.kind === "forest" ? 32 : 18),
    propOverrides,
    labels: world.kind === "forest" ? [{ row: 18, col: world.resident.col, text: "岚的林间营地" }] : [],
  };
}

export interface BuildingArt { texture: string; frame: string }

/** Independent fallback for each building; no missing-texture placeholders enter the scene. */
export function getTownBuildingArt(label: string, hasFrame: HasVisualFrame): BuildingArt | null {
  const key = label === "木匠工坊" ? "town-workshop-v1" : "town-hall-v1";
  if (hasFrame(key, "main")) return { texture: key, frame: "main" };
  return hasFrame("farmhouse-main", "trimmed") ? { texture: "farmhouse-main", frame: "trimmed" } : null;
}
