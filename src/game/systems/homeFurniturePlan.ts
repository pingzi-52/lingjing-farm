import type { HasVisualFrame } from "./cropVisual";
import type { FurnitureKind } from "../../domain/models/Furniture";
export type { FurnitureKind, HomeFurniture } from "../../domain/models/Furniture";
export { HOME_FURNITURE } from "../../data/furniture";

export const HOME_FURNITURE_TEXTURE = "home-furniture-v1";

/** A missing optional sprite removes its blocker as well; core room objects remain. */
export function getHomeFurnitureArt(kind: FurnitureKind, has: HasVisualFrame): { texture: string; frame: string } | null {
  return has(HOME_FURNITURE_TEXTURE, kind) ? { texture: HOME_FURNITURE_TEXTURE, frame: kind } : null;
}
