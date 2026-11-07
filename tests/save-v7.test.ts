import { describe, expect, it } from "vitest";
import { SAVE_KEY, SAVE_VERSION } from "../src/domain/models/types";
import { MemoryStorage, SaveManager, SAVE_BACKUP_KEY, SAVE_IMPORT_BACKUP_KEY, SAVE_RECOVERY_KEY } from "../src/persistence/save";

const container = () => ({ capacity: 24, slots: Array(24).fill(null) });
const v6 = () => ({ version: 6, gold: 9876, day: 12, inventory: { capacity: 24, slots: [{ itemId: "starberry_seed", amount: 7 }, ...Array(23).fill(null)] }, chest: container(), farming: [{ id: "8_12", tilled: true, watered: false, crop: { cropId: "starberry", growthDay: 2, harvestedCount: 3 } }], daily: { minute: 1170, energy: 31 }, introQuest: { status: "completed", cropId: "dew_radish" }, exploration: { forageDay: 11, picked: ["wood_a", "mushroom_c"], forestQuest: "active", carpenterQuest: "completed", lanternBuilt: true } });
const furniture = () => ({ nextId: 3, items: [{ id: 1, kind: "plant", position: { x: 376, y: 305 } }, { id: 2, kind: "table", position: null }] });
const v7 = () => ({ ...v6(), version: 7, furniture: furniture() });

describe("V7 furniture persistence", () => {
  it("round trips furniture without caller or returned-state aliases", () => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const data = v7();
    expect(SAVE_VERSION).toBe(7); expect(save.save(data as any)).toBe(true); expect(save.load()).toEqual(data);
    const original = JSON.parse(storage.get(SAVE_KEY)!);
    data.furniture.items[0].position!.x = 100; data.furniture.items.push({ id: 3, kind: "lamp", position: null });
    const loaded = save.load() as any; loaded.furniture.items[0].position.x = 200; loaded.furniture.items.length = 0;
    expect(save.load()).toEqual(original);
  });

  it.each([1, 2, 3, 4, 5, 6])("strictly migrates V%s with eight original furnishings and keeps old raw bytes", version => {
    const data: any = { ...v6(), version };
    if (version < 6) delete data.exploration; if (version < 5) delete data.introQuest; if (version < 4) delete data.daily; if (version < 3) delete data.chest; if (version < 2) { delete data.inventory; delete data.farming; }
    const raw = `\r\n${JSON.stringify(data, null, 2)}\n`; const storage = new MemoryStorage(); const save = new SaveManager(storage); storage.set(SAVE_KEY, raw);
    const loaded = save.load() as any;
    expect(loaded.version).toBe(7); expect(loaded.furniture.nextId).toBe(9); expect(loaded.furniture.items).toHaveLength(8);
    expect(loaded.furniture.items.map((item: any) => [item.kind, item.position])).toEqual([
      ["rug", { x: 258, y: 294 }], ["wall-shelf", { x: 298, y: 104 }], ["bookcase", { x: 122, y: 169 }], ["sideboard", { x: 282, y: 168 }],
      ["table", { x: 167, y: 250 }], ["chair", { x: 168, y: 282 }], ["lamp", { x: 395, y: 248 }], ["plant", { x: 376, y: 305 }],
    ]);
    for (const [key, value] of Object.entries(data)) if (key !== "version") expect(loaded[key]).toEqual(value);
    expect(storage.get(SAVE_KEY)).toBe(raw); expect(save.previewImport(raw)).toMatchObject({ ok: true, value: { data: loaded, sourceVersion: version, previousRaw: raw } });
    expect(save.save(loaded)).toBe(true); expect(storage.get(SAVE_BACKUP_KEY)).toBe(raw);
    storage.set(SAVE_KEY, JSON.stringify({ ...data, furniture: furniture() })); expect(save.load()).toBeNull();
  });

  const invalid: unknown[] = [undefined, null, [], {}, { ...furniture(), extra: 1 }, { ...furniture(), nextId: 2 }, { ...furniture(), nextId: 1000001 }, { nextId: 2, items: [{ id: 1, kind: "unknown", position: null }] }, { nextId: 2, items: [{ id: 1, kind: "plant", position: { x: 376.5, y: 305 } }] }, { nextId: 2, items: [{ id: 1, kind: "plant", position: { x: 376, y: 305, extra: 1 } }] }, { nextId: 2, items: [{ id: 1, kind: "plant", position: null, extra: 1 }] }, { nextId: 2, items: [{ id: 1, kind: "plant", position: null }, { id: 1, kind: "plant", position: null }] }, { nextId: 34, items: Array.from({ length: 33 }, (_, i) => ({ id: i + 1, kind: "plant", position: null })) }, { nextId: 2, items: [{ id: 1, kind: "table", position: { x: 256, y: 340 } }] }, { nextId: 3, items: [{ id: 1, kind: "table", position: { x: 167, y: 250 } }, { id: 2, kind: "table", position: { x: 167, y: 250 } }] }];
  it.each(invalid.map(furniture => ({ furniture })))("rejects malformed raw V7 through load, import and backup %#", ({ furniture }) => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); const raw = JSON.stringify({ ...v7(), furniture }); storage.set(SAVE_KEY, raw); storage.set(SAVE_BACKUP_KEY, raw);
    expect(save.load()).toBeNull(); expect(save.hasBackup()).toBe(false); expect(save.restoreBackup()).toBe(false);
    expect(save.previewImport(raw)).toEqual({ ok: false, reason: "INVALID_SAVE" }); expect(save.importSave(raw, raw)).toEqual({ ok: false, reason: "INVALID_SAVE" });
    expect(save.save(v7() as any)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw); expect(storage.get(SAVE_RECOVERY_KEY)).toBeNull();
  });

  it.each(invalid.filter(value => value !== undefined).map(furniture => ({ furniture })))("refuses explicit invalid save-time furniture atomically %#", ({ furniture }) => {
    const storage = new MemoryStorage(); const save = new SaveManager(storage); expect(save.save(v7() as any)).toBe(true); const raw = storage.get(SAVE_KEY);
    expect(save.save({ ...v7(), furniture } as any)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw); expect(storage.get(SAVE_BACKUP_KEY)).toBeNull();
  });

  it("refuses a disjoint furniture combination that seals the room despite each piece being valid alone", () => {
    const items = [130, 198, 266, 334].map((x, i) => ({ id: i + 1, kind: "table", position: { x, y: 250 } }));
    items.push({ id: 5, kind: "lamp", position: { x: 395, y: 240 } });
    const storage = new MemoryStorage(); const save = new SaveManager(storage);
    for (const item of items) expect(save.previewImport(JSON.stringify({ ...v7(), furniture: { nextId: 6, items: [item] } })).ok).toBe(true);
    const raw = JSON.stringify({ ...v7(), furniture: { nextId: 6, items } }); storage.set(SAVE_KEY, raw);
    expect(save.load()).toBeNull(); expect(save.previewImport(raw)).toEqual({ ok: false, reason: "INVALID_SAVE" });
    expect(save.save(v7() as any)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it.each([SAVE_KEY, SAVE_BACKUP_KEY, SAVE_IMPORT_BACKUP_KEY])("retains old primary when writing %s fails", key => {
    class Storage extends MemoryStorage { fail = false; override set(k: string, raw: string): void { if (this.fail && k === key) throw new Error("quota"); super.set(k, raw); } }
    const storage = new Storage(); const raw = JSON.stringify(v6(), null, 2); storage.set(SAVE_KEY, raw); const save = new SaveManager(storage); storage.fail = true;
    if (key !== SAVE_IMPORT_BACKUP_KEY) { expect(save.save(v7() as any)).toBe(false); expect(storage.get(SAVE_KEY)).toBe(raw); }
    expect(save.importSave(JSON.stringify(v7()), raw)).toEqual({ ok: false, reason: "STORAGE_FAILED" }); expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("exports exact V7 bytes and imports all furniture on confirmation", () => {
    const storage = new MemoryStorage(); const raw = `\n${JSON.stringify(v7(), null, 2)}\n`; storage.set(SAVE_KEY, raw); const save = new SaveManager(storage);
    expect(save.exportSave()).toEqual({ ok: true, value: { raw, day: 12 } });
    const destination = new SaveManager(new MemoryStorage()); expect(destination.importSave(raw, null).ok).toBe(true); expect(destination.load()).toEqual(v7());
  });

  it("protects V8 future primary and reports unsupported transfer", () => {
    const raw = JSON.stringify({ ...v7(), version: 8 }); const storage = new MemoryStorage(); storage.set(SAVE_KEY, raw); const save = new SaveManager(storage);
    expect(save.load()).toBeNull(); expect(save.save(v7() as any)).toBe(false); expect(save.previewImport(raw)).toEqual({ ok: false, reason: "UNSUPPORTED_VERSION" }); expect(storage.get(SAVE_KEY)).toBe(raw);
  });
});
