import { describe, expect, it } from "vitest";
import { areaExits, openAreaExits } from "../src/data/maps/areaConnections";
import { createForestMap, createTownMap, type ExplorationMap, type MapCell } from "../src/data/maps/explorationMaps";
import { clearForestSightlines } from "../src/data/maps/forestClearings";
import { parseFarm01 } from "../src/data/maps/farm01";

// Pre-clearing terrain: the stable world contract, independent of the new pass.
const originalForestRows = [
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "TTTTTTT...TTT.TTTT.TTT...TTT.TTT",
  "TTTTT.T...RTTTT..TTT.T...RTTTTTT",
  "TTTTT.......................TTTT",
  "TTTT........................TTTT",
  "TTTT....TTT.TTT..TTTT.TTT..TTTTT",
  "TTTT.....TTTT.T.....TTT.T..T.TTT",
  "TTTTTR..TT.TTTT.....RTTTT..TTTTT",
  "TTTTTT......................TTTT",
  "TTTT.T......................TTTT",
  "TTTTTT.....RTTT..TTTT......TTTTT",
  "TTTTTT.....TTRT..T.TTT.....TRTTT",
  "TTTTT...TT.T.....TTT.TTTT....TTT",
  "TTTTTT..TTTP.....RTTTT.TT....TTT",
  "TTTTR........................TTT",
  "TTTTT.......................TTTT",
  "TTTTTT...TTTT....T.T...RT..T.TTT",
  "TTTTT....TRTTT...TPT...TTRTTTTTT",
  "TTTTTTTTTTTTTT...TTTTTTTTTTTTTTT",
  "TTTTTTTTTTTTTTT..TTTTTTTTTTTTTTT",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
];

function originalForest(): ExplorationMap {
  return {
    ...createForestMap(),
    tiles: originalForestRows.map(row => [...row].map(cell => ({
      key: cell === "T" ? "tree" : cell === "R" ? "rock" : "grass",
      solid: cell !== ".",
    }))),
  };
}

const id = ({ row, col }: MapCell) => `${row}_${col}`;
const neighbors = [[0, 1], [1, 0], [0, -1], [-1, 0]];

function reachable(world: ExplorationMap): Set<string> {
  const queue = [world.start], seen = new Set([id(world.start)]);
  for (let index = 0; index < queue.length; index++) for (const [dr, dc] of neighbors) {
    const cell = { row: queue[index].row + dr, col: queue[index].col + dc };
    if (!world.tiles[cell.row]?.[cell.col] || world.tiles[cell.row][cell.col].solid
      || id(cell) === id(world.resident) || seen.has(id(cell))) continue;
    seen.add(id(cell)); queue.push(cell);
  }
  return seen;
}

describe("forest sightline clearings", () => {
  it("clears actual obstacles without mutating or sharing source tiles", () => {
    const source = originalForest(), before = structuredClone(source);
    const result = clearForestSightlines(source);
    expect(source).toEqual(before);
    expect(result).toEqual(clearForestSightlines(source));
    expect(result).not.toBe(source);
    expect(result.tiles).not.toBe(source.tiles);
    expect(result.tiles).not.toEqual(source.tiles);
    for (let row = 0; row < source.height; row++) for (let col = 0; col < source.width; col++) {
      expect(result.tiles[row][col]).not.toBe(source.tiles[row][col]);
    }
    result.tiles[0][0].solid = false;
    expect(source).toEqual(before);
  });

  it("changes only nearby interior tree or rock obstacles into walkable grass", () => {
    const source = originalForest(), result = clearForestSightlines(source);
    let changed = 0;
    for (let row = 0; row < source.height; row++) for (let col = 0; col < source.width; col++) {
      const oldTile = source.tiles[row][col], tile = result.tiles[row][col];
      if (JSON.stringify(tile) === JSON.stringify(oldTile)) continue;
      changed++;
      expect(row).toBeGreaterThan(0); expect(row).toBeLessThan(source.height - 1);
      expect(col).toBeGreaterThan(0); expect(col).toBeLessThan(source.width - 1);
      expect(["tree", "rock"]).toContain(oldTile.key);
      expect(oldTile.solid).toBe(true);
      expect(tile).toEqual({ key: "grass", solid: false });
      const inCamp = row >= 14 && row <= 19 && col >= 10 && col <= 16;
      const atEntry = row >= 16 && row <= 21 && col >= 27 && col <= 30;
      const belowForage = source.nodes.some(node => row >= node.row && row <= node.row + 2 && Math.abs(col - node.col) <= 1);
      expect(inCamp || atEntry || belowForage, `unbounded clearing ${row}_${col}`).toBe(true);
    }
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(80);
    expect(result.tiles.flat().filter(tile => tile.key === "tree").length).toBeGreaterThan(250);
  });

  it("opens an oval camp with southern crown headroom and a small entrance clearing", () => {
    const world = createForestMap();
    for (const [row, col] of [[14, 12], [14, 13], [14, 14], [16, 10], [19, 12], [19, 14], [20, 29], [21, 29]]) {
      expect(world.tiles[row][col], `visible camp or entry ${row}_${col}`).toEqual({ key: "grass", solid: false });
    }
    // The oval keeps its wooded corners instead of becoming a rectangular lawn.
    for (const [row, col] of [[14, 10], [14, 16], [19, 11], [20, 13], [21, 27]]) {
      expect(world.tiles[row][col]).toEqual(originalForest().tiles[row][col]);
    }
  });

  it("keeps foreground crowns one column either side and two rows south of forage clear", () => {
    const world = createForestMap();
    for (const node of world.nodes) for (let dr = 0; dr <= 2; dr++) for (let dc = -1; dc <= 1; dc++) {
      expect(world.tiles[node.row + dr][node.col + dc], `${node.id} sightline ${dr}_${dc}`).toEqual({ key: "grass", solid: false });
    }
  });

  it("preserves endpoints, resource identities, paths, prop solids, and buildings", () => {
    const source = originalForest(), result = clearForestSightlines(source);
    expect({ ...result, tiles: [] }).toEqual({ ...source, tiles: [] });
    expect(result.start).toEqual({ row: 20, col: 15 });
    expect(result.resident).toEqual({ row: 16, col: 13 });
    expect(result.nodes.map(node => [node.id, node.itemId, node.row, node.col])).toEqual([
      ["wood_a", "branch", 5, 8], ["wood_b", "branch", 10, 18], ["wood_c", "branch", 19, 7],
      ["stone_a", "stone", 8, 5], ["stone_b", "stone", 13, 23], ["stone_c", "stone", 19, 21],
      ["mushroom_a", "wild_mushroom", 5, 23], ["mushroom_b", "wild_mushroom", 13, 9], ["mushroom_c", "wild_mushroom", 16, 27],
    ]);
    for (const cell of [source.start, source.bed, source.resident, ...source.paths, ...source.props, ...source.nodes]) {
      expect(result.tiles[cell.row][cell.col]).toEqual(source.tiles[cell.row][cell.col]);
    }
    // Even a terrain-shaped prop or occupied building inside a clearing is authoritative.
    source.props.push({ row: 14, col: 13, frame: "custom-prop", blocking: true });
    source.buildings.push({ row: 19, col: 12, width: 2, height: 1, label: "reserved" });
    const reserved = clearForestSightlines(source);
    for (const [row, col] of [[14, 13], [19, 12], [19, 13]]) expect(reserved.tiles[row][col]).toEqual(source.tiles[row][col]);
  });

  it("retains the closed perimeter and reachable targets before and after opening exits", () => {
    const source = createForestMap();
    expect([source.width, source.height]).toEqual([32, 24]);
    for (let row = 0; row < source.height; row++) for (let col = 0; col < source.width; col++) {
      if (row === 0 || col === 0 || row === 23 || col === 31) expect(source.tiles[row][col].solid).toBe(true);
    }
    for (const world of [source, openAreaExits(source, "forest")]) {
      const seen = reachable(world);
      for (const node of world.nodes) expect(seen.has(id(node))).toBe(true);
      for (const target of [world.resident, ...world.nodes]) {
        expect(neighbors.some(([dr, dc]) => seen.has(id({ row: target.row + dr, col: target.col + dc })))).toBe(true);
      }
    }
    const seen = reachable(openAreaExits(source, "forest"));
    for (const exit of areaExits("forest")) for (const row of [exit.row, exit.row + 1]) {
      expect(seen.has(id({ row, col: exit.edge === "left" ? 0 : source.width - 1 }))).toBe(true);
    }
  });

  it("leaves town terrain and farm01 unchanged", () => {
    const town = createTownMap(), farm = parseFarm01();
    expect(clearForestSightlines(town)).toEqual(town);
    createForestMap();
    expect(createTownMap()).toEqual(town);
    expect(parseFarm01()).toEqual(farm);
  });
});
