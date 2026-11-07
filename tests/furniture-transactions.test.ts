import { describe, expect, it } from "vitest";
import { initGameSession } from "../src/game/systems/GameSession";
import { MemoryStorage, SaveManager, SAVE_BACKUP_KEY } from "../src/persistence/save";
import { SAVE_KEY } from "../src/domain/models/types";

class FaultStorage extends MemoryStorage {
  failKey: string | null = null;
  override set(key: string, value: string): void {
    if (key === this.failKey) throw new Error("quota");
    super.set(key, value);
  }
}
function setup() {
  const storage = new FaultStorage(), s = initGameSession(new SaveManager(storage));
  s.newGame(); expect(s.saveGame()).toBe(true);
  return { storage, s };
}
describe("persistent furniture transactions", () => {
  it("buys into separate storage, spends gold and restores the exact furniture after reload", () => {
    const { s } = setup(); const bag = s.inventory.serialize(), chest = s.chest.serialize();
    expect(s.buyFurniture("plant").ok).toBe(true);
    expect(s.economy.goldValue).toBe(420); expect(s.furniture.state.items).toHaveLength(9);
    expect(s.furniture.state.items[8].position).toBeNull();
    expect(s.inventory.serialize()).toEqual(bag); expect(s.chest.serialize()).toEqual(chest);
    const furniture = s.furniture.serialize(); expect(s.loadGame()).toBe(true);
    expect(s.furniture.serialize()).toEqual(furniture);
  });

  it("keeps preview and cancellation free of all persistence side effects", () => {
    const { s, storage } = setup(); const raw = storage.get(SAVE_KEY), before = s.furniture.serialize();
    const plant = s.furniture.state.items.find(item => item.kind === "plant")!;
    s.furniture.preview(plant.id, 360, 312, { x: 256, y: 304 });
    expect(s.furniture.serialize()).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("moves and stores an owned piece while retaining its stable identity and count", () => {
    const { s } = setup(); const plant = s.furniture.state.items.find(item => item.kind === "plant")!;
    expect(s.placeFurniture(plant.id, 360, 312, { x: 256, y: 304 }).ok).toBe(true);
    expect(s.furniture.state.items.find(item => item.id === plant.id)?.position).toEqual({ x: 360, y: 312 });
    expect(s.storeFurniture(plant.id).ok).toBe(true);
    expect(s.furniture.state.items.find(item => item.id === plant.id)?.position).toBeNull();
    expect(s.furniture.state.items).toHaveLength(8);
    expect(s.save.load()?.furniture).toEqual(s.furniture.state);
  });

  it.each([SAVE_KEY, SAVE_BACKUP_KEY])("rolls back gold and furniture on %s failure without losing a clock tick", key => {
    const { s, storage } = setup(); const before = s.furniture.serialize(), raw = storage.get(SAVE_KEY);
    const service = s.furniture; storage.failKey = key;
    for (let i = 0; i < 6; i++) s.advanceTime(1000);
    expect(s.buyFurniture("plant")).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(s.economy.goldValue).toBe(500); expect(s.furniture.serialize()).toEqual(before);
    expect(s.furniture).toBe(service); expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(s.advanceTime(1000)).toBe(true);
    const plant = before.items.find(item => item.kind === "plant")!;
    expect(s.placeFurniture(plant.id, 360, 312, { x: 256, y: 304 })).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(s.storeFurniture(plant.id)).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(s.furniture.serialize()).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("rejects an unknown product, insufficient gold, and a placement blocking the door", () => {
    const { s, storage } = setup(); const raw = storage.get(SAVE_KEY), before = s.furniture.serialize();
    expect(s.buyFurniture("unknown").ok).toBe(false);
    s.economy.setGold(0); expect(s.buyFurniture("table").ok).toBe(false); s.economy.setGold(500);
    const table = before.items.find(item => item.kind === "table")!;
    expect(s.placeFurniture(table.id, 256, 330, { x: 256, y: 304 }).ok).toBe(false);
    expect(s.furniture.serialize()).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("a new game resets furniture instead of retaining purchases from the previous farm", () => {
    const { s } = setup(); const initial = s.furniture.serialize(); s.buyFurniture("plant");
    s.newGame(); expect(s.furniture.serialize()).toEqual(initial); expect(s.economy.goldValue).toBe(500);
  });
});
