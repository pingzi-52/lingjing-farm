import { FURNITURE_DEFINITIONS, HOME_FURNITURE } from "../../data/furniture";
import type { FurnitureItem, FurniturePosition, FurnitureRect, FurnitureState, HomeFurniture } from "../models/Furniture";
import type { Result } from "../models/Result";

const MAX_ITEMS = 32;
const MAX_ID = 1_000_000;
const fixed: readonly FurnitureRect[] = [
  { x: 328, y: 120, width: 44, height: 80 },
  // The chest is bottom-origin, unlike the centered bed.
  { x: 140, y: 98, width: 40, height: 32 },
];
const doorway: FurnitureRect = { x: 232, y: 327, width: 48, height: 25 };
// Fixed, usable standing locations for spawn, exit, bed and chest respectively.
const anchors: readonly FurniturePosition[] = [{ x: 256, y: 304 }, { x: 256, y: 338 }, { x: 306, y: 190 }, { x: 176, y: 178 }];
const definition = (kind: string) => FURNITURE_DEFINITIONS.find(entry => entry.kind === kind);
const success = (): Result => ({ ok: true, value: undefined });
const failure = (reason: string): Result => ({ ok: false, reason });
const copy = (state: FurnitureState): FurnitureState => ({ nextId: state.nextId, items: state.items.map(item => ({ ...item, position: item.position && { ...item.position } })) });
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]): boolean => Object.keys(value).length === expected.length && expected.every(key => Object.prototype.hasOwnProperty.call(value, key));
const overlaps = (a: FurnitureRect, b: FurnitureRect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function createInitialFurniture(): FurnitureState {
  return { nextId: 9, items: HOME_FURNITURE.map((item, i) => ({ id: i + 1, kind: item.kind, position: { x: item.x, y: item.y } })) };
}

export function getPlacedFurniture(state: FurnitureState): HomeFurniture[] {
  return state.items.flatMap(item => {
    if (!item.position) return [];
    const data = definition(item.kind)!;
    const { x, y } = item.position, footprint = data.footprint;
    return [{ kind: item.kind, x, y, maxWidth: data.maxWidth, maxHeight: data.maxHeight,
      ...(footprint ? { footprint: { x: x + footprint.dx, y: y + footprint.dy, width: footprint.width, height: footprint.height } } : {}) }];
  });
}

/** Exact axis-aligned free-space graph, compressed at obstacle boundaries.
 * Mid-edge checks prevent jumping across an obstacle whose boundary nodes are free.
 * Player coordinates may be fractional; saved furniture coordinates may not.
 */
function checkPaths(obstacles: readonly FurnitureRect[], player?: FurniturePosition): Result {
  const expanded = obstacles.map(r => ({ x: r.x - 16, y: r.y - 14, width: r.width + 32, height: r.height + 28 }));
  const free = (x: number, y: number): boolean => x >= 112 && x <= 400 && y >= 94 && y <= 338
    && !expanded.some(r => x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height);
  if (anchors.some(point => !free(point.x, point.y))) return failure("PROTECTED_SPACE");
  if (player && (!Number.isFinite(player.x) || !Number.isFinite(player.y) || !free(player.x, player.y))) return failure("PLAYER_BLOCKED");
  const targets = [...anchors, ...(player ? [player] : [])];
  const xs = [...new Set([112, 400, ...targets.map(p => p.x), ...expanded.flatMap(r => [r.x, r.x + r.width])])].filter(x => x >= 112 && x <= 400).sort((a, b) => a - b);
  const ys = [...new Set([94, 338, ...targets.map(p => p.y), ...expanded.flatMap(r => [r.y, r.y + r.height])])].filter(y => y >= 94 && y <= 338).sort((a, b) => a - b);
  const width = xs.length, count = width * ys.length;
  const walkable = new Uint8Array(count), seen = new Uint8Array(count), queue = new Int32Array(count);
  for (let row = 0; row < ys.length; row++) for (let col = 0; col < width; col++) walkable[row * width + col] = +free(xs[col], ys[row]);
  const index = (point: FurniturePosition) => ys.indexOf(point.y) * width + xs.indexOf(point.x);
  let head = 0, tail = 1;
  queue[0] = index(anchors[0]); seen[queue[0]] = 1;
  while (head < tail) {
    const current = queue[head++], col = current % width, row = Math.floor(current / width);
    for (const [nc, nr] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]) {
      if (nc < 0 || nc >= width || nr < 0 || nr >= ys.length) continue;
      const next = nr * width + nc;
      if (seen[next] || !walkable[next] || !free((xs[col] + xs[nc]) / 2, (ys[row] + ys[nr]) / 2)) continue;
      seen[next] = 1; queue[tail++] = next;
    }
  }
  if (anchors.some(point => !seen[index(point)])) return failure("PATH_BLOCKED");
  return player && !seen[index(player)] ? failure("PLAYER_BLOCKED") : success();
}

function checkLayout(state: FurnitureState, player?: FurniturePosition): Result {
  const placed = getPlacedFurniture(state), obstacles = [...fixed];
  for (const item of placed) {
    if (item.x - item.maxWidth / 2 < 96 || item.x + item.maxWidth / 2 > 416 || item.y - item.maxHeight < 80 || item.y > 352) return failure("OUT_OF_BOUNDS");
    if (definition(item.kind)!.wall && item.y > 112) return failure("WALL_ONLY");
    if (!item.footprint) continue;
    if (obstacles.some(other => overlaps(item.footprint!, other))) return failure("FURNITURE_OVERLAP");
    if (overlaps(item.footprint, doorway)) return failure("PROTECTED_SPACE");
    obstacles.push(item.footprint);
  }
  return checkPaths(obstacles, player);
}

/** The same strict structural and physical rules protect imports and live restore. */
export function validateFurnitureState(value: unknown): FurnitureState | null {
  if (!object(value) || !keys(value, ["nextId", "items"]) || !integer(value.nextId, 1, MAX_ID)
    || !Array.isArray(value.items) || value.items.length > MAX_ITEMS) return null;
  const ids = new Set<number>(), items: FurnitureItem[] = [];
  for (const item of value.items) {
    if (!object(item) || !keys(item, ["id", "kind", "position"]) || !integer(item.id, 1, MAX_ID - 1)
      || item.id >= value.nextId || ids.has(item.id) || typeof item.kind !== "string") return null;
    const data = definition(item.kind);
    if (!data) return null;
    const p = item.position;
    let position: FurniturePosition | null = null;
    if (p !== null) {
      if (!object(p) || !keys(p, ["x", "y"]) || !integer(p.x, 96, 416) || !integer(p.y, 80, 352)) return null;
      position = { x: p.x, y: p.y };
    }
    ids.add(item.id); items.push({ id: item.id, kind: data.kind, position });
  }
  const state = { nextId: value.nextId, items };
  return checkLayout(state).ok ? state : null;
}

export class FurnitureService {
  private current = createInitialFurniture();
  get state(): FurnitureState { return copy(this.current); }
  serialize(): FurnitureState { return this.state; }
  restore(state: unknown): void {
    const valid = validateFurnitureState(state);
    if (!valid) throw new RangeError("Invalid furniture state");
    this.current = valid;
  }
  newGame(): void { this.current = createInitialFurniture(); }
  acquire(kind: string): Result {
    const data = definition(kind);
    if (!data) return failure("UNKNOWN_FURNITURE");
    if (this.current.items.length >= MAX_ITEMS || this.current.nextId >= MAX_ID) return failure("FURNITURE_LIMIT");
    this.current.items.push({ id: this.current.nextId++, kind: data.kind, position: null });
    return success();
  }
  preview(id: number, x: number, y: number, player?: FurniturePosition): Result {
    const item = this.current.items.find(entry => entry.id === id);
    if (!item) return failure("UNKNOWN_FURNITURE");
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return failure("INVALID_POSITION");
    const candidate = copy(this.current);
    candidate.items.find(entry => entry.id === id)!.position = { x, y };
    return checkLayout(candidate, player);
  }
  place(id: number, x: number, y: number, player?: FurniturePosition): Result {
    const result = this.preview(id, x, y, player);
    if (result.ok) this.current.items.find(entry => entry.id === id)!.position = { x, y };
    return result;
  }
  store(id: number): Result {
    const item = this.current.items.find(entry => entry.id === id);
    if (!item) return failure("UNKNOWN_FURNITURE");
    item.position = null; return success();
  }
}
