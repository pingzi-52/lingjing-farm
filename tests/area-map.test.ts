import { describe, expect, it } from "vitest";
import { buildAreaMap } from "../src/game/systems/areaMap";
import { openAreaExits, passagePathCells } from "../src/data/maps/areaConnections";
import { createForestMap, createTownMap } from "../src/data/maps/explorationMaps";
import { parseFarm01 } from "../src/data/maps/farm01";

describe("read-only area map", () => {
  it("locates the player precisely in tile coordinates and the forest resident and east exit", () => {
    const world = openAreaExits(createForestMap(), "forest");
    const result = buildAreaMap(world, { x: 944, y: 576 }, []);
    expect([result.width, result.height, result.area]).toEqual([32, 24, "forest"]);
    expect(result.markers.find(m => m.kind === "player")).toMatchObject({ x: 29.5, y: 18 });
    expect(result.markers.find(m => m.kind === "resident")).toMatchObject({ x: 13.5, y: 16.5, label: "岚" });
    expect(result.markers.find(m => m.kind === "exit")).toMatchObject({ x: 31.5, y: 18, label: "农场 →" });
    expect(result.cells.find(c => c.row === 17 && c.col === 31)?.kind).toBe("path");
    expect(result.cells.find(c => c.row === 0 && c.col === 31)?.kind).toBe("blocked");
  });

  it("hides only picked resources, restores them with the next day's empty list and never mutates inputs", () => {
    const world = openAreaExits(createForestMap(), "forest"), picked = ["wood_a", "mushroom_b"];
    const before = JSON.stringify(world);
    const result = buildAreaMap(world, { x: 500, y: 500 }, picked);
    const resources = result.markers.filter(m => ["branch", "stone", "wild_mushroom"].includes(m.kind));
    expect(resources).toHaveLength(7);
    expect(resources.some(m => picked.includes(m.id))).toBe(false);
    expect(resources.find(m => m.id === "stone_c")).toMatchObject({ x: 21.5, y: 19.5, label: "溪石" });
    expect(buildAreaMap(world, { x: 500, y: 500 }, []).markers.filter(m => ["branch", "stone", "wild_mushroom"].includes(m.kind))).toHaveLength(9);
    expect(JSON.stringify(world)).toBe(before);
    expect(picked).toEqual(["wood_a", "mushroom_b"]);
  });

  it("uses the town's west exit, actual resident and building footprints without inventing resources", () => {
    const world = openAreaExits(createTownMap(), "town");
    const result = buildAreaMap(world, { x: 80, y: 448 }, []);
    expect(result.markers.find(m => m.kind === "exit")).toMatchObject({ x: 0.5, y: 14, label: "← 农场" });
    expect(result.markers.find(m => m.kind === "resident")).toMatchObject({ x: 18.5, y: 11.5, label: "阿榆" });
    expect(result.markers.filter(m => m.kind === "building").map(m => m.label)).toEqual(["木匠工坊", "林缘会馆"]);
    expect(result.markers).toHaveLength(5);
    expect(result.cells.filter(c => c.kind === "building")).toHaveLength(36);
    expect(result.cells.find(c => c.row === 12 && c.col === 15)?.kind).toBe("path");
    expect(result.cells.find(c => c.row === 6 && c.col === 6)?.kind).toBe("building");
  });

  it("takes a fresh player snapshot on reopening without changing the previous result", () => {
    const world = openAreaExits(createTownMap(), "town"), player = { x: 80, y: 448 };
    const first = buildAreaMap(world, player, []);
    player.x = 256;
    expect(buildAreaMap(world, player, []).markers.find(m => m.kind === "player")?.x).toBe(8);
    expect(first.markers.find(m => m.kind === "player")?.x).toBe(2.5);
  });
});

describe("shared walking path display cells", () => {
  it("includes both woodland approach rows without painting the cleared space below them", () => {
    const world = openAreaExits(createForestMap(), "forest"), before = JSON.stringify(world);
    const result = passagePathCells(world, "forest");
    expect(result).toHaveLength(10);
    expect(result).toContainEqual({ row: 17, col: 31 });
    expect(result).toContainEqual({ row: 18, col: 27 });
    expect(result.some(p => p.row === 19)).toBe(false);
    expect(JSON.stringify(world)).toBe(before);
  });

  it("preserves farm reserved cells and solid terrain while retaining the boundary approach", () => {
    const world = openAreaExits(parseFarm01(), "farm");
    const result = passagePathCells(world, "farm", ["13_2", "14_0"]);
    expect(result).not.toContainEqual({ row: 13, col: 2 });
    expect(result).toContainEqual({ row: 14, col: 0 });
    expect(new Set(result.map(p => `${p.row}_${p.col}`)).size).toBe(result.length);
    for (const p of result) expect(world.tiles[p.row][p.col]).toEqual({ key: "grass", solid: false });
    expect(passagePathCells(world, "farm")).toContainEqual({ row: 13, col: 2 });
  });
});
