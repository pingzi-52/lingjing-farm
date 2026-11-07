import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("exploration building atlas assets", () => {
  for (const name of ["workshop-v1", "town-hall-v1"]) {
    it(`${name} exposes an in-bounds main frame in the actual RGBA PNG`, () => {
      const root = `../public/farm-assets/original-addons/v8/${name}`;
      const png = readFileSync(new URL(`${root}.png`, import.meta.url));
      const atlas = JSON.parse(readFileSync(new URL(`${root}.json`, import.meta.url), "utf8"));
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png[25]).toBe(6); // PNG color type: truecolor with alpha.
      expect(atlas.meta.size).toEqual({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) });
      const { frame, sourceSize, spriteSourceSize } = atlas.frames.main;
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.w).toBeGreaterThan(0);
      expect(frame.h).toBeGreaterThan(0);
      expect(frame.x + frame.w).toBeLessThanOrEqual(atlas.meta.size.w);
      expect(frame.y + frame.h).toBeLessThanOrEqual(atlas.meta.size.h);
      expect(sourceSize).toEqual({ w: frame.w, h: frame.h });
      expect(spriteSourceSize).toEqual({ x: 0, y: 0, w: frame.w, h: frame.h });
    });
  }
});
