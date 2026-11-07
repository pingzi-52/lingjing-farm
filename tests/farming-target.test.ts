import { describe, expect, it } from "vitest";
import type { ParsedMap, TileDef } from "../src/data/maps/farm01.types";
import { getPointerFarmTarget } from "../src/game/systems/farmingTarget";

function map(): ParsedMap {
  return {
    width: 8, height: 8,
    tiles: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ key: "grass", solid: false }))),
    start: { row: 3, col: 3 }, bed: { row: 0, col: 0 },
  };
}

describe("pointer farming target", () => {
  it("accepts the player's current tile and all eight adjacent tiles", () => {
    const world = map(), player = { x: 112, y: 112 };
    for (let row = 2; row <= 4; row++) for (let col = 2; col <= 4; col++) {
      expect(getPointerFarmTarget(world, player, { x: col * 32 + 16, y: row * 32 + 16 }, []))
        .toEqual({ tileId: `${row}_${col}`, row, col, key: "grass" });
    }
  });

  it("uses world coordinates with exact 32px floor boundaries", () => {
    const world = map(), player = { x: 95.999, y: 95.999 };
    expect(getPointerFarmTarget(world, player, { x: 127.999, y: 127.999 }, []))
      .toEqual({ tileId: "3_3", row: 3, col: 3, key: "grass" });
    expect(getPointerFarmTarget(world, player, { x: 128, y: 96 }, [])).toBeNull();
    expect(getPointerFarmTarget(world, { x: 255.999, y: 255.999 }, { x: 255.999, y: 255.999 }, []))
      .toEqual({ tileId: "7_7", row: 7, col: 7, key: "grass" });
  });

  it("accepts nonsolid soil and never changes map, player, pointer or reserved cells", () => {
    const world = map(), player = { x: 112, y: 112 }, point = { x: 144, y: 112 }, reserved = ["2_3"];
    world.tiles[3][4] = { key: "soil", solid: false };
    const before = structuredClone({ world, player, point, reserved });
    expect(getPointerFarmTarget(world, player, point, reserved)).toEqual({ tileId: "3_4", row: 3, col: 4, key: "soil" });
    expect({ world, player, point, reserved }).toEqual(before);
    expect(getPointerFarmTarget(world, player, point, reserved)).toEqual(getPointerFarmTarget(world, player, point, reserved));
  });

  it("rejects reserved land, every solid tile, unsupported terrain and distant clicks", () => {
    const world = map(), player = { x: 112, y: 112 }, point = { x: 144, y: 112 };
    expect(getPointerFarmTarget(world, player, point, ["3_4"])).toBeNull();
    for (const key of ["grass", "soil", "tree", "rock", "water", "fence", "bed"] as TileDef["key"][]) {
      world.tiles[3][4] = { key, solid: true };
      expect(getPointerFarmTarget(world, player, point, [])).toBeNull();
      if (key === "grass" || key === "soil") continue;
      world.tiles[3][4].solid = false;
      expect(getPointerFarmTarget(world, player, point, [])).toBeNull();
    }
    for (const point of [{ x: 48, y: 112 }, { x: 112, y: 176 }, { x: 176, y: 176 }]) {
      expect(getPointerFarmTarget(world, player, point, [])).toBeNull();
    }
  });

  it("rejects negative, out-of-map, missing and nonfinite coordinates for either actor", () => {
    const world = map(), valid = { x: 16, y: 16 };
    for (const point of [{ x: -0.01, y: 16 }, { x: 16, y: -0.01 }, { x: 256, y: 16 }, { x: 16, y: 256 }]) {
      expect(getPointerFarmTarget(world, valid, point, [])).toBeNull();
      expect(getPointerFarmTarget(world, point, valid, [])).toBeNull();
    }
    for (const value of [NaN, Infinity, -Infinity]) for (const point of [{ x: value, y: 16 }, { x: 16, y: value }]) {
      expect(getPointerFarmTarget(world, valid, point, [])).toBeNull();
      expect(getPointerFarmTarget(world, point, valid, [])).toBeNull();
    }
    world.tiles[0] = [];
    expect(getPointerFarmTarget(world, valid, valid, [])).toBeNull();
  });
});
