import type { FurnitureKind, HomeFurniture } from "../domain/models/Furniture";

export interface FurnitureDefinition {
  readonly kind: FurnitureKind;
  readonly name: string;
  readonly price: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly footprint?: { readonly dx: number; readonly dy: number; readonly width: number; readonly height: number };
  readonly wall?: boolean;
}
export const FURNITURE_DEFINITIONS: readonly FurnitureDefinition[] = [
  { kind: "table", name: "木餐桌", price: 220, maxWidth: 68, maxHeight: 45, footprint: { dx: -34, dy: -28, width: 68, height: 28 } },
  { kind: "chair", name: "软垫木椅", price: 100, maxWidth: 23, maxHeight: 44, footprint: { dx: -11, dy: -14, width: 22, height: 14 } },
  { kind: "bookcase", name: "书架", price: 280, maxWidth: 36, maxHeight: 58, footprint: { dx: -18, dy: -15, width: 36, height: 15 } },
  { kind: "sideboard", name: "厨房矮柜", price: 320, maxWidth: 50, maxHeight: 52, footprint: { dx: -24, dy: -18, width: 48, height: 18 } },
  { kind: "plant", name: "盆栽", price: 80, maxWidth: 32, maxHeight: 38, footprint: { dx: -11, dy: -11, width: 22, height: 11 } },
  { kind: "lamp", name: "落地灯", price: 180, maxWidth: 22, maxHeight: 54, footprint: { dx: -6, dy: -10, width: 12, height: 10 } },
  { kind: "rug", name: "田园地毯", price: 150, maxWidth: 112, maxHeight: 74 },
  { kind: "wall-shelf", name: "壁架", price: 120, maxWidth: 36, maxHeight: 24, wall: true },
];

/** Original eight free instances, in stable save ID order. */
export const HOME_FURNITURE: readonly HomeFurniture[] = [
  { kind: "rug", x: 258, y: 294, maxWidth: 112, maxHeight: 74 },
  { kind: "wall-shelf", x: 298, y: 104, maxWidth: 36, maxHeight: 24 },
  { kind: "bookcase", x: 122, y: 169, maxWidth: 36, maxHeight: 58, footprint: { x: 104, y: 154, width: 36, height: 15 } },
  { kind: "sideboard", x: 282, y: 168, maxWidth: 50, maxHeight: 52, footprint: { x: 258, y: 150, width: 48, height: 18 } },
  { kind: "table", x: 167, y: 250, maxWidth: 68, maxHeight: 45, footprint: { x: 133, y: 222, width: 68, height: 28 } },
  { kind: "chair", x: 168, y: 282, maxWidth: 23, maxHeight: 44, footprint: { x: 157, y: 268, width: 22, height: 14 } },
  { kind: "lamp", x: 395, y: 248, maxWidth: 22, maxHeight: 54, footprint: { x: 389, y: 238, width: 12, height: 10 } },
  { kind: "plant", x: 376, y: 305, maxWidth: 32, maxHeight: 38, footprint: { x: 365, y: 294, width: 22, height: 11 } },
];
