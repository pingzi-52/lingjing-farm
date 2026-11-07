import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CROPS } from "../src/data/crops";

describe("complete farming original asset contracts", () => {
  for (const name of ["crops-warm-v1", "crops-cool-v1", "soil-patches-v1"]) {
    it(`${name} crops fit actual RGBA source dimensions`, () => {
      const base = `../public/farm-assets/original-addons/v10/${name}`;
      const png = readFileSync(new URL(`${base}.png`, import.meta.url));
      const atlas = JSON.parse(readFileSync(new URL(`${base}.json`, import.meta.url), "utf8"));
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png[25]).toBe(6);
      expect(atlas.meta.size).toEqual({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) });
      for (const f of Object.values(atlas.frames)) {
        expect(f.frame.x).toBeGreaterThanOrEqual(0); expect(f.frame.y).toBeGreaterThanOrEqual(0);
        expect(f.frame.w).toBeGreaterThan(0); expect(f.frame.h).toBeGreaterThan(0);
        expect(f.frame.x + f.frame.w).toBeLessThanOrEqual(atlas.meta.size.w);
        expect(f.frame.y + f.frame.h).toBeLessThanOrEqual(atlas.meta.size.h);
        if (f.trimmed) {
          expect(f.sourceSize).toEqual({ w: 320, h: 320 });
          expect(f.spriteSourceSize.x + f.frame.w).toBeLessThanOrEqual(320);
          expect(f.spriteSourceSize.y + f.frame.h).toBe(318);
        }
      }
      if (name.startsWith("crops-")) {
        const warm = name === "crops-warm-v1";
        const crops = CROPS.filter(c => c.seasons.some(s => s === "spring" || s === "summer") === warm);
        const expected = crops.flatMap(c => ["seed", "sprout", "young", "mature"].map(s => `${c.id}_${s}`));
        expect(Object.keys(atlas.frames).sort()).toEqual(expected.sort());
      } else expect(Object.keys(atlas.frames)).toHaveLength(108);
    });
  }
});
