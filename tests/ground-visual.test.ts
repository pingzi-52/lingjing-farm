import { describe, expect, it } from "vitest";
import { getGrassVisual, getRoadVisual, MEADOW_TEXTURE, PATH_TEXTURE, ROAD_FRAMES } from "../src/game/systems/groundVisual";

const all = () => true;
describe("coherent terrain art selection", () => {
  it("uses repeatable new grass variants for matching environment/soil coordinates", () => {
    const picks = Array.from({ length: 9 }, (_, col) => getGrassVisual(8, col, all));
    expect(picks).toEqual(Array.from({ length: 9 }, (_, col) => getGrassVisual(8, col, all)));
    expect(new Set(picks.map(p => p?.frame)).size).toBe(3);
    expect(picks.every(p => p?.texture === MEADOW_TEXTURE)).toBe(true);
  });
  it("falls back as a whole when any meadow frame is absent, avoiding mixed colors", () => {
    for (let col = 0; col < 3; col++) {
      expect(getGrassVisual(0, col, (key, frame) => key !== MEADOW_TEXTURE || frame !== "c"))
        .toEqual({ texture: "TX Tileset Grass", frame: `TX Tileset Grass ${col % 3}` });
    }
  });
  it("returns null if both original and new grass are unavailable", () => {
    expect(getGrassVisual(2, 3, () => false)).toBeNull();
  });
  it("preserves all nine road topology frame names", () => {
    for (const frame of ROAD_FRAMES) expect(getRoadVisual(frame, all)).toEqual({ texture: PATH_TEXTURE, frame });
  });
  it("falls back as a whole when an unused new road frame is missing", () => {
    expect(getRoadVisual("center", (key, frame) => key !== PATH_TEXTURE || frame !== "ne"))
      .toEqual({ texture: "farm-home-path", frame: "center" });
  });
  it("falls back independently for grass and path failures", () => {
    const noMeadow = (key: string) => key !== MEADOW_TEXTURE;
    expect(getGrassVisual(0, 0, noMeadow)?.texture).toBe("TX Tileset Grass");
    expect(getRoadVisual("n", noMeadow)?.texture).toBe(PATH_TEXTURE);
    const noPath = (key: string) => key !== PATH_TEXTURE;
    expect(getGrassVisual(0, 0, noPath)?.texture).toBe(MEADOW_TEXTURE);
    expect(getRoadVisual("n", noPath)?.texture).toBe("farm-home-path");
  });
  it("returns null if neither road atlas can provide the requested frame", () => {
    expect(getRoadVisual("n", () => false)).toBeNull();
  });
});
