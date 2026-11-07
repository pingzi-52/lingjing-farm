import { describe, expect, it } from "vitest";
import { FarmingService } from "../src/domain/services/FarmingService";
import { CropService } from "../src/domain/services/CropService";
import { CROPS } from "../src/data/crops";
import type { FarmTileState } from "../src/domain/models/Crop";

describe("safe empty farmland reclamation", () => {
  it.each([false, true])("deletes an empty %s-watered tile from the shared map and not its neighbours", watered => {
    const tiles = new Map<string, FarmTileState>([["8_12", { id: "8_12", tilled: true, watered }], ["8_13", { id: "8_13", tilled: true, watered: true }]]);
    const farming = new FarmingService(tiles, new CropService(CROPS));
    expect(farming.reclaim("8_12")).toEqual({ ok: true, value: undefined });
    expect(tiles.has("8_12")).toBe(false); expect(farming.serialize()).toEqual({ "8_13": { id: "8_13", tilled: true, watered: true } });
    expect(farming.reclaim("8_12")).toEqual({ ok: false, reason: "NOT_TILLED" });
  });

  it.each([{ cropId: "dew_radish", growthDay: 0, harvestedCount: 0 }, { cropId: "dew_radish", growthDay: 4, harvestedCount: 0 }, { cropId: "starberry", growthDay: 0, harvestedCount: 2 }, { cropId: "starberry", growthDay: 3, harvestedCount: 2 }])("refuses planted, mature and regrowing crops without changing them %#", crop => {
    const farming = new FarmingService(new Map(), new CropService(CROPS)); farming.restore({ "8_12": { id: "8_12", tilled: true, watered: true, crop } }); const before = farming.serialize();
    expect(farming.reclaim("8_12")).toEqual({ ok: false, reason: "CROP_PRESENT" }); expect(farming.serialize()).toEqual(before);
  });
});
