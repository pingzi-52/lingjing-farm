import { describe, expect, it } from "vitest";
import { createForestMap, createTownMap } from "../src/data/maps/explorationMaps";
import { openAreaExits, passagePathCells } from "../src/data/maps/areaConnections";
import { planExplorationDecor, getTownBuildingArt } from "../src/game/systems/explorationDecorPlan";

describe("exploration decoration planning", () => {
  for (const make of [createForestMap, createTownMap]) {
    it(`${make.name}: is deterministic and leaves maps and stable interaction positions untouched`, () => {
      const world = openAreaExits(make(), make().kind), before = JSON.stringify(world);
      const first = planExplorationDecor(world);
      expect(first).toEqual(planExplorationDecor(world));
      expect(JSON.stringify(world)).toBe(before);
      expect(first.details.length).toBeGreaterThan(0);
      expect(first.details.length).toBeLessThanOrEqual(world.kind === "forest" ? 32 : 18);
      expect(new Set(first.details.map(p => `${p.row}_${p.col}`)).size).toBe(first.details.length);
    });

    it(`${make.name}: keeps foliage off roads, obstacles and interaction envelopes`, () => {
      const world = openAreaExits(make(), make().kind), plan = planExplorationDecor(world);
      const paths = new Set([...world.paths, ...passagePathCells(world, world.kind)].map(p => `${p.row}_${p.col}`));
      for (const p of plan.details) {
        expect(world.tiles[p.row][p.col]).toEqual({ key: "grass", solid: false });
        expect(paths.has(`${p.row}_${p.col}`)).toBe(false);
        for (const point of [world.start, world.resident, ...world.nodes, ...world.props]) {
          expect(Math.max(Math.abs(p.row - point.row), Math.abs(p.col - point.col))).toBeGreaterThan(1);
        }
      }
    });

    it(`${make.name}: changes only the display of existing solid props, never adds furniture to the road`, () => {
      const world = make(), plan = planExplorationDecor(world);
      for (const prop of plan.propOverrides) {
        const original = world.props.find(p => p.row === prop.row && p.col === prop.col);
        expect(original?.blocking).toBe(true);
        expect(world.tiles[prop.row][prop.col].solid).toBe(true);
        expect(prop.maxSize).toBeLessThanOrEqual(32);
      }
    });
  }

  it("gives the forest a field kit, and the town a real woodwork bench and civic lantern", () => {
    expect(planExplorationDecor(createForestMap()).propOverrides.some(p => p.role === "field-kit")).toBe(true);
    const town = planExplorationDecor(createTownMap());
    expect(town.propOverrides.find(p => p.role === "workbench")).toMatchObject({ texture: "farm-forage-v1", frame: "workbench" });
    expect(town.propOverrides.some(p => p.role === "civic-lantern")).toBe(true);
  });
});

describe("town building art selection", () => {
  it("uses distinct original building silhouettes when their frames are available", () => {
    expect(getTownBuildingArt("木匠工坊", () => true)).toEqual({ texture: "town-workshop-v1", frame: "main" });
    expect(getTownBuildingArt("林缘会馆", () => true)).toEqual({ texture: "town-hall-v1", frame: "main" });
  });
  it("falls back independently for a missing building while keeping the other original", () => {
    const available = (key: string) => key !== "town-workshop-v1";
    expect(getTownBuildingArt("木匠工坊", available)).toEqual({ texture: "farmhouse-main", frame: "trimmed" });
    expect(getTownBuildingArt("林缘会馆", available)).toEqual({ texture: "town-hall-v1", frame: "main" });
  });
  it("skips a building only when both its new frame and legacy fallback are absent", () => {
    expect(getTownBuildingArt("木匠工坊", () => false)).toBeNull();
  });
});
