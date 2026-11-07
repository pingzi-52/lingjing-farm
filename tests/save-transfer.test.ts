import { describe, expect, it } from "vitest";
import { createInitialFurniture } from "../src/domain/services/FurnitureService";
import { SAVE_KEY, SAVE_VERSION, type SaveData } from "../src/domain/models/types";
import type { InventoryState } from "../src/domain/models/Item";
import { MAX_SAVE_BYTES, MemoryStorage, SaveManager, SAVE_BACKUP_KEY, SAVE_IMPORT_BACKUP_KEY, SAVE_RECOVERY_KEY } from "../src/persistence/save";

const container = (slots: InventoryState["slots"]): InventoryState => ({ capacity: 24, slots: [...slots, ...Array<null>(24 - slots.length).fill(null)] });
const richV6 = (): Omit<SaveData, "version" | "furniture"> & { version: 6 } => ({
  version: 6, gold: 98231, day: 42,
  inventory: container([{ itemId: "hoe", amount: 1 }, { itemId: "watering_can", amount: 1 }, { itemId: "starberry_seed", amount: 17 }, null, { itemId: "mushroom_meal", amount: 3 }]),
  chest: container([{ itemId: "branch", amount: 45 }, { itemId: "stone", amount: 32 }, { itemId: "wild_mushroom", amount: 8 }, { itemId: "dew_radish", amount: 9 }]),
  farming: [
    { id: "8_12", tilled: true, watered: true, crop: { cropId: "starberry", growthDay: 2, harvestedCount: 4 } },
    { id: "8_13", tilled: true, watered: false, crop: { cropId: "dew_radish", growthDay: 4, harvestedCount: 0 } },
    { id: "8_14", tilled: true, watered: false },
  ],
  daily: { minute: 1130, energy: 23 }, introQuest: { status: "completed", cropId: "dew_radish" },
  exploration: { forageDay: 41, picked: ["wood_a", "stone_c", "mushroom_b"], forestQuest: "active", carpenterQuest: "completed", lanternBuilt: true },
});
const canonical = (): SaveData => ({ ...richV6(), version: SAVE_VERSION, furniture: createInitialFurniture() });
const encoded = () => JSON.stringify(richV6());
const legacy = (version: number): string => {
  const data: Record<string, unknown> = { ...richV6(), version };
  delete data.exploration;
  if (version < 5) delete data.introQuest;
  if (version < 4) delete data.daily;
  if (version < 3) delete data.chest;
  if (version < 2) { delete data.inventory; delete data.farming; }
  return JSON.stringify(data, null, 2);
};

class ObservedStorage extends MemoryStorage {
  writes: Array<[string, string]> = [];
  removals: string[] = [];
  failRead = false;
  failWriteKey: string | null = null;
  seed(key: string, raw: string): void { super.set(key, raw); }
  override get(key: string): string | null { if (this.failRead) throw new Error("blocked read"); return super.get(key); }
  override set(key: string, raw: string): void {
    this.writes.push([key, raw]);
    if (key === this.failWriteKey) throw new Error("quota");
    super.set(key, raw);
  }
  override remove(key: string): void { this.removals.push(key); super.remove(key); }
}
const setup = (raw: string | null = null) => {
  const storage = new ObservedStorage();
  if (raw !== null) storage.seed(SAVE_KEY, raw);
  return { storage, save: new SaveManager(storage) };
};
const failure = (reason: string) => ({ ok: false, reason });

describe("explicit save transfer", () => {
  it("previews every V6 field without writing and commits a complete round trip", () => {
    const raw = encoded(); const { storage, save } = setup();
    expect(save.previewImport(raw)).toEqual({ ok: true, value: { data: canonical(), sourceVersion: 6, previousRaw: null } });
    expect(storage.writes).toEqual([]); expect(storage.removals).toEqual([]);
    expect(save.importSave(raw, null)).toEqual({ ok: true, value: undefined });
    expect(save.load()).toEqual(canonical()); expect(JSON.parse(storage.get(SAVE_KEY)!)).toEqual(canonical());
    const exported = save.exportSave();
    expect(exported).toEqual({ ok: true, value: { raw: storage.get(SAVE_KEY), day: 42 } });
    const destination = setup();
    if (!exported.ok) throw new Error("expected export");
    expect(destination.save.importSave(exported.value.raw, null).ok).toBe(true);
    expect(destination.save.load()).toEqual(canonical());
  });

  it.each([1, 2, 3, 4, 5])("previews V%s in memory and writes canonical V7 only on confirmation", version => {
    const raw = legacy(version); const { storage, save } = setup();
    const preview = save.previewImport(raw);
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error("expected preview");
    expect(preview.value.sourceVersion).toBe(version); expect(preview.value.data.version).toBe(SAVE_VERSION);
    expect(preview.value.data.gold).toBe(98231); expect(preview.value.data.day).toBe(42);
    expect(preview.value.data.exploration).toEqual({ forageDay: 42, picked: [], forestQuest: "available", carpenterQuest: "available", lanternBuilt: false });
    if (version >= 2) { expect(preview.value.data.inventory).toEqual(richV6().inventory); expect(preview.value.data.farming).toEqual(richV6().farming); }
    if (version >= 3) expect(preview.value.data.chest).toEqual(richV6().chest);
    if (version >= 4) expect(preview.value.data.daily).toEqual(richV6().daily);
    if (version >= 5) expect(preview.value.data.introQuest).toEqual(richV6().introQuest);
    expect(storage.get(SAVE_KEY)).toBeNull(); expect(storage.writes).toEqual([]);
    expect(save.importSave(raw, preview.value.previousRaw).ok).toBe(true);
    expect(storage.get(SAVE_KEY)).toBe(JSON.stringify(preview.value.data));
  });

  it("canceling after preview preserves primary and both recovery records exactly", () => {
    const current = `\n${legacy(5)}\n`; const { storage, save } = setup(current);
    storage.seed(SAVE_BACKUP_KEY, legacy(1)); storage.seed(SAVE_RECOVERY_KEY, "broken before");
    expect(save.previewImport(encoded())).toMatchObject({ ok: true, value: { previousRaw: current } });
    expect(storage.get(SAVE_KEY)).toBe(current); expect(storage.get(SAVE_BACKUP_KEY)).toBe(legacy(1));
    expect(storage.get(SAVE_RECOVERY_KEY)).toBe("broken before"); expect(storage.writes).toEqual([]); expect(storage.removals).toEqual([]);
  });

  it("backs up exact valid original bytes before replacing the primary", () => {
    const current = `\r\n ${legacy(3)} \n`; const { storage, save } = setup(current);
    expect(save.importSave(encoded(), current).ok).toBe(true);
    expect(storage.writes.map(([key]) => key)).toEqual([SAVE_BACKUP_KEY, SAVE_IMPORT_BACKUP_KEY, SAVE_KEY]);
    expect(storage.get(SAVE_BACKUP_KEY)).toBe(current); expect(save.load()).toEqual(canonical());
  });

  it.each(["{broken", "", JSON.stringify({ ...richV6(), version: 99 }, null, 2)])("preserves rejected original bytes and retains an existing valid backup %#", current => {
    const { storage, save } = setup(current); const backup = legacy(4); storage.seed(SAVE_BACKUP_KEY, backup);
    expect(save.previewImport(encoded())).toMatchObject({ ok: true, value: { previousRaw: current } });
    expect(save.importSave(encoded(), current).ok).toBe(true);
    expect(storage.writes.map(([key]) => key)).toEqual([SAVE_RECOVERY_KEY, SAVE_IMPORT_BACKUP_KEY, SAVE_KEY]);
    expect(storage.get(SAVE_RECOVERY_KEY)).toBe(current); expect(storage.get(SAVE_BACKUP_KEY)).toBe(backup);
  });

  it("imports into empty storage while retaining an existing valid backup", () => {
    const { storage, save } = setup(); const backup = legacy(2); storage.seed(SAVE_BACKUP_KEY, backup);
    expect(save.importSave(encoded(), null).ok).toBe(true);
    expect(storage.writes.map(([key]) => key)).toEqual([SAVE_KEY]);
    expect(storage.get(SAVE_BACKUP_KEY)).toBe(backup); expect(storage.removals).toEqual([]);
  });

  const invalid = ["", "{", "null", "[]", "5", JSON.stringify({ ...richV6(), gold: -1 }), JSON.stringify({ ...richV6(), exploration: null }),
    JSON.stringify({ ...richV6(), extra: 1 }), encoded().replace('"version":6', '"version":"6"'),
    encoded().replace('"version":6', '"__proto__":{"polluted":true},"version":6'),
    encoded().replace('"capacity":24', '"capacity":24,"constructor":{}')];
  it.each(invalid)("rejects invalid import bytes without writing %#", raw => {
    const current = legacy(1); const { storage, save } = setup(current);
    expect(save.previewImport(raw)).toEqual(failure("INVALID_SAVE"));
    expect(save.importSave(raw, current)).toEqual(failure("INVALID_SAVE"));
    expect(storage.get(SAVE_KEY)).toBe(current); expect(storage.writes).toEqual([]);
  });

  it.each([8, 99])("rejects future V%s before any write", version => {
    const { storage, save } = setup(legacy(1)); const raw = JSON.stringify({ ...richV6(), version });
    expect(save.previewImport(raw)).toEqual(failure("UNSUPPORTED_VERSION"));
    expect(save.importSave(raw, legacy(1))).toEqual(failure("UNSUPPORTED_VERSION")); expect(storage.writes).toEqual([]);
  });

  it.each([" ".repeat(MAX_SAVE_BYTES + 1), JSON.stringify({ note: "田".repeat(Math.ceil(MAX_SAVE_BYTES / 3)), version: 6 })])("enforces the 256KiB byte bound before parsing %#", raw => {
    const { storage, save } = setup();
    expect(save.previewImport(raw)).toEqual(failure("SAVE_TOO_LARGE"));
    expect(save.importSave(raw, null)).toEqual(failure("SAVE_TOO_LARGE")); expect(storage.writes).toEqual([]);
  });

  it("accepts a valid document exactly at the byte limit", () => {
    const raw = encoded(); const padded = raw + " ".repeat(MAX_SAVE_BYTES - new TextEncoder().encode(raw).length);
    const { save } = setup(); expect(save.previewImport(padded).ok).toBe(true); expect(save.importSave(padded, null).ok).toBe(true);
  });

  it("refuses an oversized existing primary because its original bytes cannot be preserved", () => {
    const current = "田".repeat(Math.ceil(MAX_SAVE_BYTES / 3)); const { storage, save } = setup(current);
    expect(save.importSave(encoded(), current)).toEqual(failure("SAVE_TOO_LARGE"));
    expect(storage.get(SAVE_KEY)).toBe(current); expect(storage.writes).toEqual([]);
  });

  it.each([[null, legacy(1)], [legacy(1), null], [legacy(1), `${legacy(1)}\n`], [legacy(1), encoded()]] as const)("rejects exact-snapshot conflict %#", (previous, current) => {
    const { storage, save } = setup(previous); const preview = save.previewImport(encoded());
    if (!preview.ok) throw new Error("expected preview");
    if (current === null) storage.remove(SAVE_KEY); else storage.seed(SAVE_KEY, current);
    expect(save.importSave(encoded(), preview.value.previousRaw)).toEqual(failure("SAVE_CHANGED"));
    expect(storage.get(SAVE_KEY)).toBe(current); expect(storage.writes).toEqual([]);
  });

  it("revalidates the submitted raw bytes even after a successful preview", () => {
    const current = legacy(1); const { storage, save } = setup(current); const preview = save.previewImport(encoded());
    if (!preview.ok) throw new Error("expected preview");
    expect(save.importSave("broken", preview.value.previousRaw)).toEqual(failure("INVALID_SAVE")); expect(storage.writes).toEqual([]);
  });

  it.each([SAVE_BACKUP_KEY, SAVE_RECOVERY_KEY, SAVE_IMPORT_BACKUP_KEY, SAVE_KEY])("handles failed %s writes without changing the old primary", key => {
    const current = key === SAVE_RECOVERY_KEY ? "{broken" : legacy(5); const { storage, save } = setup(current);
    storage.failWriteKey = key;
    expect(save.importSave(encoded(), current)).toEqual(failure("STORAGE_FAILED"));
    expect(storage.get(SAVE_KEY)).toBe(current);
    if (key === SAVE_IMPORT_BACKUP_KEY) expect(storage.writes.map(([written]) => written)).toEqual([SAVE_BACKUP_KEY, SAVE_IMPORT_BACKUP_KEY]);
    else if (key !== SAVE_KEY) expect(storage.writes.map(([written]) => written)).toEqual([key]);
    else expect(storage.get(SAVE_BACKUP_KEY)).toBe(current);
  });

  it("keeps rejected bytes when primary writing fails after preserving a corrupt original", () => {
    const current = "corrupt"; const { storage, save } = setup(current); storage.failWriteKey = SAVE_KEY;
    expect(save.importSave(encoded(), current)).toEqual(failure("STORAGE_FAILED"));
    expect(storage.get(SAVE_KEY)).toBe(current); expect(storage.get(SAVE_RECOVERY_KEY)).toBe(current);
  });

  it("reports primary write failure for empty storage while retaining existing backup", () => {
    const { storage, save } = setup(); storage.seed(SAVE_BACKUP_KEY, legacy(1)); storage.failWriteKey = SAVE_KEY;
    expect(save.importSave(encoded(), null)).toEqual(failure("STORAGE_FAILED"));
    expect(storage.get(SAVE_KEY)).toBeNull(); expect(storage.get(SAVE_BACKUP_KEY)).toBe(legacy(1));
  });

  it("reports read failures in preview, import and export with no writes", () => {
    const { storage, save } = setup(); storage.failRead = true;
    expect(save.previewImport(encoded())).toEqual(failure("STORAGE_FAILED"));
    expect(save.importSave(encoded(), null)).toEqual(failure("STORAGE_FAILED"));
    expect(save.exportSave()).toEqual(failure("STORAGE_FAILED")); expect(storage.writes).toEqual([]);
  });

  it.each([legacy(1), legacy(5), `\r\n${JSON.stringify(richV6(), null, 2)} \n`])("exports exact persisted bytes without migrating or writing %#", raw => {
    const { storage, save } = setup(raw);
    expect(save.exportSave()).toEqual({ ok: true, value: { raw, day: 42 } }); expect(storage.writes).toEqual([]); expect(storage.removals).toEqual([]);
  });

  it.each([[null, "NO_SAVE"], ["", "INVALID_SAVE"], ["broken", "INVALID_SAVE"], [JSON.stringify({ ...richV6(), version: 8 }), "UNSUPPORTED_VERSION"], [" ".repeat(MAX_SAVE_BYTES + 1), "SAVE_TOO_LARGE"]] as const)("does not export defaults or rejected primary bytes %#", (raw, reason) => {
    const { storage, save } = setup(raw); storage.seed(SAVE_BACKUP_KEY, encoded());
    expect(save.exportSave()).toEqual(failure(reason)); expect(storage.writes).toEqual([]);
  });
});

describe("durable pre-import backup", () => {
  it("preserves exact legacy bytes across two normal saves and normal backup restoration", () => {
    const current = `\r\n ${legacy(5)}\n`; const { storage, save } = setup(current);
    expect(save.importSave(encoded(), current).ok).toBe(true);
    expect(storage.get(SAVE_IMPORT_BACKUP_KEY)).toBe(current);
    expect(save.save({ ...richV6(), gold: 1 })).toBe(true);
    expect(save.save({ ...richV6(), gold: 2 })).toBe(true);
    expect(storage.get(SAVE_BACKUP_KEY)).not.toBe(current);
    expect(save.restoreBackup()).toBe(true);
    expect(storage.get(SAVE_IMPORT_BACKUP_KEY)).toBe(current);
    const writeCount = storage.writes.length;
    expect(save.exportImportBackup()).toEqual({ ok: true, value: { raw: current, day: 42 } });
    expect(storage.writes).toHaveLength(writeCount);
  });

  it("imports to empty storage without overwriting a prior durable backup", () => {
    const { storage, save } = setup(); const prior = legacy(2); storage.seed(SAVE_IMPORT_BACKUP_KEY, prior);
    expect(save.importSave(encoded(), null).ok).toBe(true);
    expect(storage.get(SAVE_IMPORT_BACKUP_KEY)).toBe(prior);
    expect(storage.writes.map(([key]) => key)).toEqual([SAVE_KEY]);
  });

  it.each(["{broken", JSON.stringify({ ...richV6(), version: 8 }, null, 2)])("preserves exact rejected original bytes in the durable record %#", current => {
    const { storage, save } = setup(current);
    expect(save.importSave(encoded(), current).ok).toBe(true);
    expect(storage.get(SAVE_IMPORT_BACKUP_KEY)).toBe(current);
    expect(storage.get(SAVE_RECOVERY_KEY)).toBe(current);
  });

  it("keeps the prior durable record when a preservation write fails", () => {
    const current = "broken"; const prior = legacy(1); const { storage, save } = setup(current);
    storage.seed(SAVE_IMPORT_BACKUP_KEY, prior); storage.failWriteKey = SAVE_IMPORT_BACKUP_KEY;
    expect(save.importSave(encoded(), current)).toEqual(failure("STORAGE_FAILED"));
    expect(storage.get(SAVE_KEY)).toBe(current); expect(storage.get(SAVE_IMPORT_BACKUP_KEY)).toBe(prior);
    expect(storage.get(SAVE_RECOVERY_KEY)).toBe(current);
    expect(storage.writes.map(([key]) => key)).toEqual([SAVE_RECOVERY_KEY, SAVE_IMPORT_BACKUP_KEY]);
  });

  it("keeps a durable original when the final primary write fails", () => {
    const current = legacy(3); const { storage, save } = setup(current); storage.failWriteKey = SAVE_KEY;
    expect(save.importSave(encoded(), current)).toEqual(failure("STORAGE_FAILED"));
    expect(storage.get(SAVE_KEY)).toBe(current); expect(storage.get(SAVE_IMPORT_BACKUP_KEY)).toBe(current);
    expect(storage.writes.map(([key]) => key)).toEqual([SAVE_BACKUP_KEY, SAVE_IMPORT_BACKUP_KEY, SAVE_KEY]);
  });

  it.each([legacy(1), legacy(5), `\r\n${JSON.stringify(richV6(), null, 2)} \n`])("exports exact durable bytes with no writes or migration %#", raw => {
    const { storage, save } = setup(encoded()); storage.seed(SAVE_IMPORT_BACKUP_KEY, raw);
    expect(save.exportImportBackup()).toEqual({ ok: true, value: { raw, day: 42 } });
    expect(storage.writes).toEqual([]); expect(storage.removals).toEqual([]); expect(storage.get(SAVE_IMPORT_BACKUP_KEY)).toBe(raw);
  });

  it.each([[null, "NO_IMPORT_BACKUP"], ["", "INVALID_SAVE"], ["broken", "INVALID_SAVE"], [JSON.stringify({ ...richV6(), version: 8 }), "UNSUPPORTED_VERSION"], ["田".repeat(Math.ceil(MAX_SAVE_BYTES / 3)), "SAVE_TOO_LARGE"]] as const)("rejects missing or unusable durable backup without falling back to primary %#", (raw, reason) => {
    const { storage, save } = setup(encoded());
    if (raw !== null) storage.seed(SAVE_IMPORT_BACKUP_KEY, raw);
    expect(save.exportImportBackup()).toEqual(failure(reason)); expect(storage.writes).toEqual([]); expect(storage.removals).toEqual([]);
  });

  it("reports durable backup read failure without any write", () => {
    const { storage, save } = setup(); storage.failRead = true;
    expect(save.exportImportBackup()).toEqual(failure("STORAGE_FAILED")); expect(storage.writes).toEqual([]);
  });
});
