import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HOME_FURNITURE } from "../src/game/systems/homeFurniturePlan";

describe("cottage furniture atlas", () => {
  it("provides eight nonoverlapping in-bounds RGBA crops for the actual source PNG", () => {
    const root = "../public/farm-assets/original-addons/v11/home-furniture-v1";
    const png = readFileSync(new URL(`${root}.png`, import.meta.url));
    const atlas = JSON.parse(readFileSync(new URL(`${root}.json`, import.meta.url), "utf8"));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png[25]).toBe(6);
    expect(atlas.meta.size).toEqual({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) });
    expect(Object.keys(atlas.frames).sort()).toEqual(HOME_FURNITURE.map(p => p.kind).sort());
    const frames = Object.values(atlas.frames).map(entry => entry.frame);
    for (const r of frames) {
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.w).toBeGreaterThan(0); expect(r.h).toBeGreaterThan(0);
      expect(r.x + r.w).toBeLessThanOrEqual(atlas.meta.size.w);
      expect(r.y + r.h).toBeLessThanOrEqual(atlas.meta.size.h);
      for (const other of frames) if (other !== r) expect(
        r.x >= other.x + other.w || other.x >= r.x + r.w || r.y >= other.y + other.h || other.y >= r.y + r.h,
      ).toBe(true);
    }
  });
});
