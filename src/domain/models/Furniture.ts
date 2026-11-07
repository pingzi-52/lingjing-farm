export type FurnitureKind = "table" | "chair" | "bookcase" | "sideboard" | "plant" | "lamp" | "rug" | "wall-shelf";
export interface FurniturePosition { x: number; y: number }
export interface FurnitureItem { id: number; kind: FurnitureKind; position: FurniturePosition | null }
export interface FurnitureState { nextId: number; items: FurnitureItem[] }
export interface FurnitureRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface HomeFurniture {
  readonly kind: FurnitureKind;
  /** Bottom center of the visible object, independent of transparent atlas padding. */
  readonly x: number;
  readonly y: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly footprint?: FurnitureRect;
}
