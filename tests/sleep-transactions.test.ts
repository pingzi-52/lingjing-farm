import { describe, expect, it } from "vitest";
import { initGameSession, type GameSession } from "../src/game/systems/GameSession";
import { MemoryStorage, SaveManager, SAVE_BACKUP_KEY } from "../src/persistence/save";
import { SAVE_KEY } from "../src/domain/models/types";

class FaultStorage extends MemoryStorage {
  failKey: string | null = null;
  override set(key: string, value: string): void {
    if (key === this.failKey) throw new Error("quota");
    super.set(key, value);
  }
}
const snapshot = (s: GameSession) => ({
  date: s.time.date, daily: s.life.serialize(), farming: s.farming.serialize(),
  exploration: s.exploration.serialize(), inventory: s.inventory.serialize(),
  chest: s.chest.serialize(), gold: s.economy.goldValue,
});
function setup(day = 2) {
  const storage = new FaultStorage();
  const s = initGameSession(new SaveManager(storage)); s.newGame();
  s.time.setDay(day); s.exploration.beginDay(day); s.exploration.gather("wood_a");
  s.inventory.add("dew_radish_seed", 3); s.chest.add("branch", 4);
  s.exploration.acceptQuest("forest"); s.economy.setGold(777);
  s.farming.restore({ "8_12": { id: "8_12", tilled: true, watered: true,
    crop: { cropId: "dew_radish", growthDay: 1, harvestedCount: 0 } } });
  s.life.restore({ minute: 1130, energy: 17 });
  expect(s.saveGame()).toBe(true);
  for (let i = 0; i < 6; i++) s.advanceTime(1000);
  return { s, storage };
}

describe("sleep persistence transaction", () => {
  it.each([2, 3, 14].flatMap(day => [SAVE_KEY, SAVE_BACKUP_KEY].map(key => ({ day, key }))))("rolls back day $day when writing $key fails", ({ day, key }) => {
    const { s, storage } = setup(day); const before = snapshot(s), raw = storage.get(SAVE_KEY);
    const refs = [s.time, s.life, s.farming, s.exploration]; storage.failKey = key;
    expect(s.sleepAndSave()).toEqual({ ok: false, reason: "SAVE_FAILED" });
    expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
    [s.time, s.life, s.farming, s.exploration].forEach((service, i) => expect(service).toBe(refs[i]));
    expect(s.advanceTime(1000)).toBe(true); expect(s.life.minute).toBe(1140);
  });

  it("persists growth, morning rain, energy and renewed forage together", () => {
    const { s, storage } = setup(); const previous = storage.get(SAVE_KEY);
    expect(s.sleepAndSave()).toEqual({ ok: true, value: { day: 3, season: "spring" } });
    expect(s.farming.serialize()["8_12"].crop?.growthDay).toBe(2);
    expect(s.farming.serialize()["8_12"].watered).toBe(true);
    expect(s.life.serialize()).toEqual({ minute: 360, energy: 100 });
    expect(s.exploration.state.picked).toEqual([]);
    expect(storage.get(SAVE_BACKUP_KEY)).toBe(previous);
    const beforeReload = snapshot(s); expect(s.loadGame()).toBe(true);
    expect(snapshot(s)).toEqual(beforeReload);
    expect(s.advanceTime(1000)).toBe(false);
  });

  it("allows retry after failure without growing crops twice", () => {
    const { s, storage } = setup(); storage.failKey = SAVE_KEY;
    expect(s.sleepAndSave().ok).toBe(false); storage.failKey = null;
    expect(s.sleepAndSave().ok).toBe(true);
    expect(s.time.date.day).toBe(3);
    expect(s.farming.serialize()["8_12"].crop?.growthDay).toBe(2);
  });

  it.each([14, 42, 56])("persists the season boundary after day %i", day => {
    const { s } = setup(day);
    expect(s.sleepAndSave().ok).toBe(true);
    expect(s.time.date.day).toBe(day + 1);
    expect(s.save.load()?.day).toBe(day + 1);
    expect(s.save.load()?.daily).toEqual({ minute: 360, energy: 100 });
  });

  it("refuses the save day limit without claiming a rest or resetting the clock", () => {
    const { s, storage } = setup(1_000_000); const before = snapshot(s), raw = storage.get(SAVE_KEY);
    expect(s.sleepAndSave()).toEqual({ ok: false, reason: "DAY_LIMIT" });
    expect(snapshot(s)).toEqual(before); expect(storage.get(SAVE_KEY)).toBe(raw);
    expect(s.advanceTime(1000)).toBe(true);
  });
});
