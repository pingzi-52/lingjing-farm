import { describe, expect, it } from "vitest";
import { CROPS } from "../src/data/crops";
import { getCropVisual } from "../src/game/systems/cropVisual";
import { selectSoilSurfaceTexture } from "../src/game/systems/farmSoilSurface";

describe("readable complete farming art", () => {
  it("provides new original art for all 11 crops and four stages", () => {
    for (const crop of CROPS) for (const stage of ["seed", "sprout", "young", "mature"] as const) {
      const expected = crop.seasons.some(s => s === "spring" || s === "summer") ? "farm-crops-warm-v1" : "farm-crops-cool-v1";
      expect(getCropVisual(crop.id, stage, () => true)).toMatchObject({ texture: expected, frame: `${crop.id}_${stage}`, width: 32, height: 32 });
    }
  });
  it("keeps a regrowing berry bush rather than displaying seeds again", () => {
    expect(getCropVisual("starberry", "seed", () => true, true).frame).toBe("starberry_young");
    expect(getCropVisual("starberry", "sprout", () => true, true).frame).toBe("starberry_young");
    expect(getCropVisual("starberry", "mature", () => true, true).frame).toBe("starberry_mature");
  });
  it("falls back to the original spring sprites independently of new files", () => {
    expect(getCropVisual("dew_radish", "young", key => key === "farm-spring-crops-v1").texture).toBe("farm-spring-crops-v1");
  });
  it("keeps the specific mature fallback and generic growth fallback", () => {
    expect(getCropVisual("blue_melon", "mature", key => key === "crop_blue_melon_mature").texture).toBe("crop_blue_melon_mature");
    expect(getCropVisual("blue_melon", "young", () => false).texture).toBe("crop_young");
  });
  it("only enables a complete new connected soil atlas", () => {
    expect(selectSoilSurfaceTexture(() => true)).toBe("farm-soil-pixel-v1");
    expect(selectSoilSurfaceTexture((key, frame) => key !== "farm-soil-pixel-v1" || frame !== "wet_2_2_1_1")).toBe("farm-soil-patch-v2");
  });
  it("rejects both incomplete soil sets", () => {
    expect(selectSoilSurfaceTexture(() => false)).toBeNull();
  });
});
