import { describe, expect, it, vi } from "vitest";
import { initGameSession, type FarmCommand, type GameSession } from "../src/game/systems/GameSession";
import { MemoryStorage, SaveManager, SAVE_BACKUP_KEY } from "../src/persistence/save";
import { SAVE_KEY } from "../src/domain/models/types";

const TILE = "8_12";
const command = (kind: FarmCommand["kind"], tileId = TILE): FarmCommand => kind === "plant" ? { kind, tileId, seedItemId: "dew_radish_seed" } : { kind, tileId };
const kinds = ["till", "water", "plant", "harvest", "reclaim"] as const;
class FaultStorage extends MemoryStorage {
  failedKey: string | null = null;
  failRead = false;
  override set(key: string, value: string): void {
    if (key === this.failedKey) throw new Error("quota");
    super.set(key, value);
  }
  override get(key: string): string | null { if (this.failRead) throw new Error("blocked"); return super.get(key); }
}
function setup(kind?: FarmCommand["kind"]) {
  const storage = new FaultStorage(); const session = initGameSession(new SaveManager(storage)); session.newGame();
  if (kind && kind !== "till") session.farming.till(TILE);
  if (kind === "plant") session.inventory.add("dew_radish_seed", 1);
  if (kind === "harvest") session.farming.plant(TILE, "dew_radish");
  if (kind === "harvest") session.farming.restore({ [TILE]: { id: TILE, tilled: true, watered: false, crop: { cropId: "dew_radish", growthDay: 4, harvestedCount: 0 } } });
  return { session, storage };
}
const snapshot = (s: GameSession) => ({ farming: s.farming.serialize(), inventory: s.inventory.serialize(), daily: s.life.serialize(), date: s.time.date, gold: s.economy.goldValue, chest: s.chest.serialize(), introQuest: s.introQuest.serialize(), exploration: s.exploration.serialize() });
const references = (s: GameSession) => [s.farming, s.inventory, s.life, s.time, s.crops, s.actions, s.chest, s.introQuest, s.exploration, s.economy];
const partialTick = (s: GameSession) => { for (let i = 0; i < 6; i++) expect(s.advanceTime(1000)).toBe(false); };
const crop = (s: GameSession, cropId: string, growthDay: number, harvestedCount = 0) => s.farming.restore({ [TILE]: { id: TILE, tilled: true, watered: false, crop: { cropId, growthDay, harvestedCount } } });

describe("persistent farming commands", () => {
  it.each(kinds)("persists %s exactly once and restores the complete result after refresh", kind => {
    const { session: s, storage } = setup(kind); const save = vi.spyOn(s.save, "save");
    const refs = references(s); partialTick(s);
    expect(s.performFarmAction(command(kind))).toEqual({ ok: true, value: undefined });
    expect(save).toHaveBeenCalledTimes(1);
    const expectedEnergy = { till: 98, water: 98, plant: 99, harvest: 100, reclaim: 99 }[kind];
    expect(s.life.energy).toBe(expectedEnergy);
    if (kind === "plant") { expect(s.inventory.count("dew_radish_seed")).toBe(0); expect(s.farming.serialize()[TILE].crop?.cropId).toBe("dew_radish"); }
    if (kind === "harvest") { expect(s.inventory.count("dew_radish")).toBe(1); expect(s.farming.serialize()[TILE].crop).toBeUndefined(); }
    if (kind === "reclaim") expect(s.farming.serialize()[TILE]).toBeUndefined();
    references(s).forEach((ref, i) => expect(ref).toBe(refs[i]));
    const saved = snapshot(s); const loaded = initGameSession(new SaveManager(storage)); expect(loaded.loadGame()).toBe(true); expect(snapshot(loaded)).toEqual(saved);
    expect(s.advanceTime(1000)).toBe(true); expect(s.life.minute).toBe(370);
  });

  const faults = ["backup", "primary", "read", "future", "corrupt"] as const;
  it.each(kinds.flatMap(kind => faults.map(fault => ({ kind, fault }))))("rolls back $kind after $fault failure without replacing services or losing the fractional clock", ({ kind, fault }) => {
    const { session: s, storage } = setup(kind); expect(s.saveGame()).toBe(true);
    if (fault === "future") storage.set(SAVE_KEY, JSON.stringify({ ...s.save.load(), version: 8 }));
    if (fault === "corrupt") storage.set(SAVE_KEY, "{broken");
    const original = storage.get(SAVE_KEY); const before = snapshot(s); const refs = references(s); partialTick(s);
    if (fault === "backup") storage.failedKey = SAVE_BACKUP_KEY;
    if (fault === "primary") storage.failedKey = SAVE_KEY;
    if (fault === "read") storage.failRead = true;
    expect(s.performFarmAction(command(kind))).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(s)).toEqual(before); references(s).forEach((ref, i) => expect(ref).toBe(refs[i]));
    storage.failRead = false; expect(storage.get(SAVE_KEY)).toBe(original);
    expect(s.advanceTime(1000)).toBe(true); expect(s.life.minute).toBe(370);
  });

  it.each(["", "08_12", "8_012", "8_12 ", " 8_12", "8_12_extra", "8.0_12", "-1_12", "0_0", "8_8", "1_4", "2_17", "17_27", "23_12", "24_0", "8_36", "999999999999999999999_1", "__proto__", "constructor", null, undefined, 812])("rejects noncanonical, out-of-map or nonfarm IDs before actions: %j", tileId => {
    const { session: s } = setup(); const before = snapshot(s); const save = vi.spyOn(s.save, "save"); const till = vi.spyOn(s.actions, "till");
    expect(s.performFarmAction({ kind: "till", tileId } as FarmCommand)).toEqual({ ok: false, reason: "INVALID_TILE" });
    expect(snapshot(s)).toEqual(before); expect(save).not.toHaveBeenCalled(); expect(till).not.toHaveBeenCalled();
  });

  it.each(["1_1", "8_12", "13_12"])("accepts raw grass, prepared soil and spawn farmland %s", tileId => {
    const { session: s } = setup(); expect(s.performFarmAction(command("till", tileId)).ok).toBe(true); expect(s.save.load()?.farming.some(tile => tile.id === tileId)).toBe(true);
  });

  it("rejects unknown runtime command kinds without mutation or saving", () => {
    const { session: s } = setup(); const before = snapshot(s); const save = vi.spyOn(s.save, "save");
    expect(s.performFarmAction({ kind: "destroy", tileId: TILE } as unknown as FarmCommand)).toEqual({ ok: false, reason: "INVALID_ACTION" });
    expect(snapshot(s)).toEqual(before); expect(save).not.toHaveBeenCalled();
  });

  it.each(["till", "water", "plant", "reclaim"] as const)("refuses exhausted %s and restores all fields without saving", kind => {
    const { session: s } = setup(kind); s.life.spend(100); const before = snapshot(s); const save = vi.spyOn(s.save, "save"); partialTick(s);
    expect(s.performFarmAction(command(kind))).toEqual({ ok: false, reason: "TOO_TIRED" }); expect(snapshot(s)).toEqual(before); expect(save).not.toHaveBeenCalled();
    expect(s.advanceTime(1000)).toBe(true);
  });

  it("retains mature crops on a full backpack and allows harvesting at zero energy after space is freed", () => {
    const { session: s } = setup("harvest"); s.inventory.restore({ capacity: 24, slots: Array.from({ length: 24 }, () => ({ itemId: "hoe", amount: 1 })) }); s.life.spend(100);
    const before = snapshot(s); const save = vi.spyOn(s.save, "save");
    expect(s.performFarmAction(command("harvest"))).toEqual({ ok: false, reason: "INVENTORY_FULL" }); expect(snapshot(s)).toEqual(before); expect(save).not.toHaveBeenCalled();
    s.inventory.remove("hoe", 1); expect(s.performFarmAction(command("harvest")).ok).toBe(true); expect(s.life.energy).toBe(0); expect(s.inventory.count("dew_radish")).toBe(1);
  });

  it("restores exact seed slot order on business failure after lower-level seed removal", () => {
    const { session: s } = setup("plant"); crop(s, "starberry", 1); const bag = s.inventory.serialize(); bag.slots[2] = null; bag.slots[19] = { itemId: "dew_radish_seed", amount: 1 }; s.inventory.restore(bag);
    const before = snapshot(s); const save = vi.spyOn(s.save, "save");
    expect(s.performFarmAction(command("plant"))).toEqual({ ok: false, reason: "ALREADY_HAS_CROP" }); expect(snapshot(s)).toEqual(before); expect(save).not.toHaveBeenCalled();
  });

  it.each([0, 100])("refuses reclaiming a live crop without spending energy at %s energy", energy => {
    const { session: s } = setup(); crop(s, "starberry", 0, 2); s.life.spend(100 - energy);
    const before = snapshot(s); const save = vi.spyOn(s.save, "save");
    expect(s.performFarmAction(command("reclaim"))).toEqual({ ok: false, reason: "CROP_PRESENT" });
    expect(snapshot(s)).toEqual(before); expect(save).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "plant", tileId: TILE, seedItemId: "unknown" }, "UNKNOWN_CROP"],
    [{ kind: "plant", tileId: TILE, seedItemId: "dew_radish_seed" }, "NOT_ENOUGH"],
    [{ kind: "water", tileId: TILE }, "NOT_TILLED"],
    [{ kind: "harvest", tileId: TILE }, "NOT_MATURE"],
    [{ kind: "reclaim", tileId: TILE }, "NOT_TILLED"],
  ] as const)("preserves the lower-level business failure %#", (action, reason) => {
    const { session: s } = setup(); const before = snapshot(s); const save = vi.spyOn(s.save, "save");
    expect(s.performFarmAction(action)).toEqual({ ok: false, reason }); expect(snapshot(s)).toEqual(before); expect(save).not.toHaveBeenCalled();
  });

  it("keeps rain watering and free repeated till/water at zero energy", () => {
    const { session: s } = setup(); s.sleep(); s.sleep();
    expect(s.weather.current().autoWater).toBe(true); expect(s.performFarmAction(command("till")).ok).toBe(true);
    expect(s.life.energy).toBe(98); expect(s.farming.serialize()[TILE].watered).toBe(true); s.life.spend(98);
    expect(s.performFarmAction(command("water")).ok).toBe(true); expect(s.performFarmAction(command("till")).ok).toBe(true); expect(s.life.energy).toBe(0);
    expect(s.save.load()?.daily.energy).toBe(0); expect(s.save.load()?.farming[0].watered).toBe(true);
  });

  it("allows owned out-of-season seeds and preserves their crop across a season boundary", () => {
    const { session: s } = setup("plant"); s.time.setDay(14); s.inventory.add("ember_tomato_seed", 1);
    expect(s.performFarmAction({ kind: "plant", tileId: TILE, seedItemId: "ember_tomato_seed" }).ok).toBe(true);
    expect(s.performFarmAction(command("water")).ok).toBe(true); s.sleep(); expect(s.time.date.season).toBe("summer");
    expect(s.farming.serialize()[TILE].crop).toEqual({ cropId: "ember_tomato", growthDay: 1, harvestedCount: 0 });
  });

  it("persists first and repeat harvest without deleting regrowing plants", () => {
    const { session: s } = setup(); crop(s, "starberry", 8);
    expect(s.performFarmAction(command("harvest")).ok).toBe(true);
    expect(s.save.load()?.farming[0].crop).toEqual({ cropId: "starberry", growthDay: 0, harvestedCount: 1 });
    const before = snapshot(s); expect(s.performFarmAction(command("harvest"))).toEqual({ ok: false, reason: "NOT_MATURE" }); expect(snapshot(s)).toEqual(before);
    crop(s, "starberry", 3, 1); expect(s.performFarmAction(command("harvest")).ok).toBe(true);
    expect(s.inventory.count("starberry")).toBe(2); expect(s.save.load()?.farming[0].crop).toEqual({ cropId: "starberry", growthDay: 0, harvestedCount: 2 });
  });

  it("completes till, plant, water, growth, harvest and reclaim entirely through the persistent entry", () => {
    const { session: s, storage } = setup(); s.inventory.add("dew_radish_seed", 1);
    expect(s.performFarmAction(command("till")).ok).toBe(true);
    expect(s.performFarmAction(command("plant")).ok).toBe(true);
    for (let day = 0; day < 4; day++) { expect(s.performFarmAction(command("water")).ok).toBe(true); s.sleep(); }
    expect(s.performFarmAction(command("harvest")).ok).toBe(true);
    expect(s.inventory.count("dew_radish")).toBe(1); expect(s.performFarmAction(command("reclaim")).ok).toBe(true);
    const final = snapshot(s); const restored = initGameSession(new SaveManager(storage)); expect(restored.loadGame()).toBe(true);
    expect(snapshot(restored)).toEqual(final); expect(restored.farming.serialize()).toEqual({}); expect(restored.inventory.count("dew_radish_seed")).toBe(0);
  });

  it("keeps low-level actions explicitly saved", () => {
    const { session: s } = setup(); s.inventory.add("dew_radish_seed", 1); const save = vi.spyOn(s.save, "save");
    s.actions.till(TILE); s.actions.plant(TILE, "dew_radish_seed"); s.actions.water(TILE); crop(s, "dew_radish", 4); s.actions.harvest(TILE); s.farming.reclaim(TILE);
    expect(save).not.toHaveBeenCalled(); expect(s.save.load()).toBeNull();
  });

  it("migrates an old V1 primary through a successful command with exact original backup", () => {
    const { session: s, storage } = setup(); const original = '\n{ "version": 1, "gold": 123, "day": 4 }\n'; storage.set(SAVE_KEY, original);
    expect(s.loadGame()).toBe(true); expect(s.performFarmAction(command("till")).ok).toBe(true);
    expect(storage.get(SAVE_BACKUP_KEY)).toBe(original); expect(s.save.load()).toMatchObject({ version: 7, gold: 123, day: 4, daily: { energy: 98 } });
  });
});
