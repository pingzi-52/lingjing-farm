import { describe, expect, it } from "vitest";
import { FurnitureService, createInitialFurniture, getPlacedFurniture, validateFurnitureState } from "../src/domain/services/FurnitureService";
import { HOME_FURNITURE } from "../src/game/systems/homeFurniturePlan";
import type { FurnitureState } from "../src/domain/models/Furniture";

describe("furniture ownership and layout", () => {
  it("preserves the legacy eight placements and detaches all returned snapshots", () => {
    const service = new FurnitureService();
    expect(getPlacedFurniture(service.state)).toEqual(HOME_FURNITURE);
    const state = service.state; state.items[0].position!.x = 0; state.items.pop();
    expect(service.state).toEqual(createInitialFurniture());
    expect(validateFurnitureState(service.state)).toEqual(service.state);
  });
  it("acquires stable instances into storage and enforces total ownership capacity", () => {
    const service = new FurnitureService();
    expect(service.acquire("bogus").ok).toBe(false);
    for (let i = 0; i < 24; i++) expect(service.acquire("plant").ok).toBe(true);
    expect(service.state.items[31]).toEqual({ id: 32, kind: "plant", position: null });
    expect(service.acquire("rug")).toEqual({ ok: false, reason: "FURNITURE_LIMIT" });
    service.store(1); expect(service.state.items).toHaveLength(32);
    expect(service.acquire("rug").ok).toBe(false);
    service.newGame(); expect(service.state).toEqual(createInitialFurniture());
  });
  it("previews without mutation, moves while ignoring only itself, and stores without deleting", () => {
    const service = new FurnitureService(), before = service.serialize();
    expect(service.preview(7, 395, 248).ok).toBe(true);
    expect(service.preview(7, 168, 282).ok).toBe(false);
    expect(service.state).toEqual(before);
    expect(service.place(7, 398, 248).ok).toBe(true);
    expect(service.state.items[6].position).toEqual({ x: 398, y: 248 });
    expect(service.store(7).ok).toBe(true);
    expect(service.state.items[6]).toEqual({ id: 7, kind: "lamp", position: null });
    expect(service.store(900).ok).toBe(false);
  });
  it("keeps rugs passable and allows them beneath solid furniture", () => {
    const service = new FurnitureService();
    expect(service.place(1, 167, 260).ok).toBe(true);
    expect(service.preview(1, 256, 338, { x: 256, y: 304 }).ok).toBe(true);
  });
  it.each([[7, 96, 200], [7, 416, 200], [7, 390, 90], [7, 390, 353], [7, -1, 200], [7, 390.5, 200], [7, NaN, 200], [7, Infinity, 200], [2, 300, 150]])("rejects invalid placement %s %s %s", (id, x, y) => {
    const service = new FurnitureService(), before = service.state;
    expect(service.place(id, x, y).ok).toBe(false); expect(service.state).toEqual(before);
  });
  it("protects the actual chest AABB, doorway, spawn and current player", () => {
    const service = new FurnitureService();
    expect(service.preview(7, 160, 120).ok).toBe(false);
    expect(service.preview(7, 256, 339).ok).toBe(false);
    expect(service.preview(7, 256, 314).ok).toBe(false);
    expect(service.preview(7, 300, 280, { x: 300.25, y: 275.5 }).ok).toBe(false);
    expect(service.preview(7, 300, 280, { x: NaN, y: 300 }).ok).toBe(false);
  });
  it("uses the chest bottom origin and permits the free floor below it", () => {
    const service = new FurnitureService();
    service.restore({ nextId: 2, items: [{ id: 1, kind: "bookcase", position: null }] });
    // Footprint y145..160 clears the real chest y98..130, but overlaps a wrongly centered chest.
    expect(service.place(1, 160, 160).ok).toBe(true);
    expect(service.place(1, 160, 140)).toEqual({ ok: false, reason: "FURNITURE_OVERLAP" });
  });
  it("rejects trapping a fractional player even when all required room destinations stay connected", () => {
    const service = new FurnitureService();
    service.restore({ nextId: 4, items: [
      { id: 1, kind: "table", position: { x: 351, y: 275 } },
      { id: 2, kind: "plant", position: { x: 310, y: 310 } },
      { id: 3, kind: "plant", position: null },
    ] });
    expect(service.preview(3, 310, 340).ok).toBe(true);
    expect(service.preview(3, 310, 340, { x: 385.25, y: 310.5 })).toEqual({ ok: false, reason: "PLAYER_BLOCKED" });
    expect(service.state.items[2].position).toBeNull();
  });
  it("restores detached snapshots and refuses ID overflow without consuming ownership", () => {
    const service = new FurnitureService(), snapshot = service.serialize();
    service.restore(snapshot); snapshot.items[0].position!.x = 0;
    expect(service.state.items[0].position!.x).toBe(258);
    service.restore({ nextId: 999999, items: [] });
    expect(service.acquire("rug").ok).toBe(true);
    expect(service.state.items[0].id).toBe(999999);
    expect(service.acquire("rug")).toEqual({ ok: false, reason: "FURNITURE_LIMIT" });
  });
  it("rejects a room-spanning barrier even when all footprints are disjoint", () => {
    const state: FurnitureState = { nextId: 6, items: [130, 198, 266, 334].map((x, i) => ({ id: i + 1, kind: "table", position: { x, y: 250 } })) };
    state.items.push({ id: 5, kind: "lamp", position: { x: 395, y: 240 } });
    for (const item of state.items) expect(validateFurnitureState({ nextId: 6, items: [item] })).not.toBeNull();
    expect(validateFurnitureState(state)).toBeNull();
  });
});

describe("strict furniture state validation", () => {
  it.each([
    (s: any) => { s.extra = true; }, (s: any) => { s.items[0].extra = 1; },
    (s: any) => { s.items[0].position.extra = 1; }, (s: any) => { s.items[0].id = 0; },
    (s: any) => { s.items[0].id = 1.5; }, (s: any) => { s.items[1].id = 1; },
    (s: any) => { s.nextId = 8; }, (s: any) => { s.nextId = 1000001; },
    (s: any) => { s.items[0].kind = "bed"; }, (s: any) => { s.items[0].position.x = NaN; },
    (s: any) => { s.items[0].position.x = 258.5; }, (s: any) => { s.items[0].position = {}; },
    (s: any) => { s.items[0].position = { x: 0, y: 0 }; },
    (s: any) => { s.items[6].position = { x: 256, y: 339 }; },
    (s: any) => { s.items = Array(33).fill(s.items[0]); },
  ])("rejects malformed data and restore leaves the previous state intact", mutate => {
    const service = new FurnitureService(), state = service.state; mutate(state);
    expect(validateFurnitureState(state)).toBeNull();
    expect(() => service.restore(state)).toThrow(RangeError);
    expect(service.state).toEqual(createInitialFurniture());
  });
  it("returns null for nonobjects and returns independent valid snapshots", () => {
    for (const bad of [null, undefined, [], 1, "state", { nextId: 1, items: null }]) expect(validateFurnitureState(bad)).toBeNull();
    const source = createInitialFurniture(), parsed = validateFurnitureState(source)!;
    source.items[0].position!.x = 0; expect(parsed.items[0].position!.x).toBe(258);
  });
});
