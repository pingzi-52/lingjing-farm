import { describe, expect, it } from "vitest";
import { HOME_FURNITURE, HOME_FURNITURE_TEXTURE, getHomeFurnitureArt } from "../src/game/systems/homeFurniturePlan";

interface Rect { x: number; y: number; width: number; height: number }
const legacy: Rect[] = [{ x: 328, y: 120, width: 44, height: 80 }, { x: 140, y: 98, width: 40, height: 32 }];
const obstacles = () => [...legacy, ...HOME_FURNITURE.flatMap(p => p.footprint ? [p.footprint] : [])];
// Test player-center reachability, not just whether furniture images overlap.
function canStand(x: number, y: number): boolean {
  return x >= 112 && x <= 400 && y >= 94 && y <= 338 && !obstacles().some(r =>
    x > r.x - 16 && x < r.x + r.width + 16 && y > r.y - 14 && y < r.y + r.height + 14);
}
function reachable(): Set<string> {
  const queue = [[256, 304]], seen = new Set(["256,304"]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [nx, ny] of [[x - 2, y], [x + 2, y], [x, y - 2], [x, y + 2]]) {
      const key = `${nx},${ny}`;
      if (canStand(nx, ny) && !seen.has(key)) { seen.add(key); queue.push([nx, ny]); }
    }
  }
  return seen;
}

describe("fixed cottage furniture plan", () => {
  it("keeps eight distinct, bounded furnishings and only solid objects have footprints", () => {
    expect(new Set(HOME_FURNITURE.map(p => p.kind)).size).toBe(8);
    for (const p of HOME_FURNITURE) {
      expect(p.x - p.maxWidth / 2).toBeGreaterThanOrEqual(96);
      expect(p.x + p.maxWidth / 2).toBeLessThanOrEqual(416);
      expect(p.y - p.maxHeight).toBeGreaterThanOrEqual(80);
      expect(p.y).toBeLessThanOrEqual(352);
      if (p.footprint) {
        expect(p.footprint.x).toBeGreaterThanOrEqual(p.x - p.maxWidth / 2);
        expect(p.footprint.x + p.footprint.width).toBeLessThanOrEqual(p.x + p.maxWidth / 2);
        expect(p.footprint.y + p.footprint.height).toBe(p.y);
      }
    }
    expect(HOME_FURNITURE.find(p => p.kind === "rug")?.footprint).toBeUndefined();
    expect(HOME_FURNITURE.find(p => p.kind === "wall-shelf")?.footprint).toBeUndefined();
  });

  it("connects spawn to the existing bed, chest and exit with the full 32x28 player", () => {
    const seen = reachable();
    for (const [x, y] of [[256, 304], [306, 190], [176, 178], [256, 326]]) expect(seen.has(`${x},${y}`)).toBe(true);
  });

  it("leaves the whole central approach and doorway clear", () => {
    for (let y = 188; y <= 338; y += 2) {
      for (let x = 224; x <= 288; x += 2) expect(canStand(x, y)).toBe(true);
    }
  });

  it("blocks solid furniture centers but allows walking over the rug", () => {
    for (const p of HOME_FURNITURE) if (p.footprint) {
      const r = p.footprint; expect(canStand(r.x + r.width / 2, r.y + r.height / 2)).toBe(false);
    }
    expect(canStand(258, 260)).toBe(true);
  });
});

describe("optional home furniture art", () => {
  it("selects all actual atlas frames independently", () => {
    for (const p of HOME_FURNITURE) expect(getHomeFurnitureArt(p.kind, () => true)).toEqual({ texture: HOME_FURNITURE_TEXTURE, frame: p.kind });
  });
  it("skips absent art without substituting missing-texture placeholders", () => {
    for (const p of HOME_FURNITURE) expect(getHomeFurnitureArt(p.kind, () => false)).toBeNull();
    const has = (key: string, frame?: string) => key === HOME_FURNITURE_TEXTURE && frame !== "chair";
    expect(getHomeFurnitureArt("chair", has)).toBeNull();
    expect(getHomeFurnitureArt("table", has)?.frame).toBe("table");
  });
});
