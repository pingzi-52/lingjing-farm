import type Phaser from "phaser";
import type { HasVisualFrame } from "./cropVisual";

export const MEADOW_TEXTURE = "farm-meadow-v2";
export const PATH_TEXTURE = "farm-path-soft-v1";
export const ROAD_FRAMES = ["nw", "n", "ne", "w", "center", "e", "sw", "s", "se"] as const;
const GRASS_FRAMES = ["a", "b", "c"] as const;
interface GroundVisual { texture: string; frame: string }

/** Enable a complete material, never a mixture of the new and original palettes. */
export function getGrassVisual(row: number, col: number, has: HasVisualFrame): GroundVisual | null {
  const variant = (row * 13 + col * 7) % 3;
  if (GRASS_FRAMES.every(frame => has(MEADOW_TEXTURE, frame))) return { texture: MEADOW_TEXTURE, frame: GRASS_FRAMES[variant] };
  const frame = `TX Tileset Grass ${variant}`;
  return has("TX Tileset Grass", frame) ? { texture: "TX Tileset Grass", frame } : null;
}

export function getRoadVisual(frame: string, has: HasVisualFrame): GroundVisual | null {
  if (ROAD_FRAMES.every(name => has(PATH_TEXTURE, name)) && has(PATH_TEXTURE, frame)) return { texture: PATH_TEXTURE, frame };
  return has("farm-home-path", frame) ? { texture: "farm-home-path", frame } : null;
}

export function groundFrames(scene: Phaser.Scene): HasVisualFrame {
  return (key, frame) => scene.textures.exists(key) && (frame === undefined || scene.textures.get(key).has(frame));
}

export function preloadGroundArt(scene: Phaser.Scene): void {
  for (const [key, file] of [[MEADOW_TEXTURE, "meadow-v2"], [PATH_TEXTURE, "path-soft-v1"]]) {
    if (scene.textures.exists(key)) continue;
    const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/v9/${file}`;
    scene.load.atlas(key, `${base}.png`, `${base}.json`);
  }
}
