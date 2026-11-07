import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ROAD_FRAMES } from "../src/game/systems/groundVisual";

describe("ground art source contracts", () => {
  for (const name of ["meadow-v2", "path-soft-v1"]) {
    it(`${name} frames fit the unchanged source PNG`, () => {
      const base = `../public/farm-assets/original-addons/v9/${name}`;
      const png = readFileSync(new URL(`${base}.png`, import.meta.url));
      const atlas = JSON.parse(readFileSync(new URL(`${base}.json`, import.meta.url), "utf8"));
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(atlas.meta.size).toEqual({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) });
      if (name === "path-soft-v1") {
        expect(png[25]).toBe(6);
        expect(Object.keys(atlas.frames)).toEqual(expect.arrayContaining([...ROAD_FRAMES]));
      } else expect(Object.keys(atlas.frames).sort()).toEqual(["a", "b", "c"]);
      for (const { frame } of Object.values(atlas.frames)) {
        expect(frame.x).toBeGreaterThanOrEqual(0); expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.w).toBeGreaterThan(0); expect(frame.h).toBeGreaterThan(0);
        expect(frame.x + frame.w).toBeLessThanOrEqual(atlas.meta.size.w);
        expect(frame.y + frame.h).toBeLessThanOrEqual(atlas.meta.size.h);
      }
    });
  }
});
