import { describe, expect, it, vi } from "vitest";
import { CROPS } from "../src/data/crops";
import type { CropDefinition, FarmTileState } from "../src/domain/models/Crop";
import { CropService } from "../src/domain/services/CropService";
import { FarmingService } from "../src/domain/services/FarmingService";
import { InventoryService } from "../src/domain/services/InventoryService";
import { TimeService } from "../src/domain/services/TimeService";
import { getFarmingOverview, getPlotGuide } from "../src/game/systems/farmingGuide";

function session(tiles: FarmTileState[] = [], rainy = false) {
  const crops = new CropService();
  return {
    crops, farming: new FarmingService(new Map(tiles.map(tile => [tile.id, tile])), crops),
    inventory: new InventoryService(), time: new TimeService(),
    weather: { current: () => ({ type: rainy ? "rain" as const : "sunny" as const, autoWater: rainy }) },
  };
}

const plot = (id: string, growthDay: number, watered = false, cropId = "dew_radish", harvestedCount = 0): FarmTileState => ({
  id, tilled: true, watered, crop: { cropId, growthDay, harvestedCount },
});

describe("CropService public cycle threshold", () => {
  it("reports first-harvest 8 days and later 3-day starberry cycles", () => {
    const crops = new CropService();
    expect(crops.growthDaysFor({ cropId: "starberry", growthDay: 0, harvestedCount: 0 })).toBe(8);
    expect(crops.growthDaysFor({ cropId: "starberry", growthDay: 0, harvestedCount: 1 })).toBe(3);
    expect(crops.growthDaysFor({ cropId: "starberry", growthDay: 2, harvestedCount: 99 })).toBe(3);
    expect(crops.growthDaysFor({ cropId: "dew_radish", growthDay: 2, harvestedCount: 1 })).toBe(4);
  });

  it("supports explicit definitions and delegates missing regrowDays to original growth rule", () => {
    const definition: CropDefinition = { ...CROPS[2], id: "test-repeat", growDays: 7, regrowDays: undefined };
    const crops = new CropService([]), crop = { cropId: definition.id, growthDay: 0, harvestedCount: 1 };
    expect(crops.growthDaysFor(crop, definition)).toBe(7);
    expect(() => crops.growthDaysFor(crop)).toThrow(/unknown crop/);
  });
});

describe("plot guide", () => {
  it("distinguishes unprepared land from empty tilled land and explains safe X reclaim", () => {
    const state = session([{ id: "3_4", tilled: true, watered: false }]);
    const untouched = getPlotGuide(state, "3_3"), empty = getPlotGuide(state, "3_4");
    expect(untouched.title).toContain("未开垦");
    expect(untouched.canReclaim).toBe(false);
    expect(untouched.mature).toBe(false); expect(untouched.watered).toBe(false);
    expect(empty.title).toContain("空耕地");
    expect(empty.canReclaim).toBe(true);
    expect(empty.next).toMatch(/播种/); expect(empty.next).toMatch(/X/); expect(empty.next).toMatch(/未耕/);
  });

  it.each([[0, "种子"], [1, "幼苗"], [2, "成长"], [4, "成熟"]])("derives stage for radish day %s", (growthDay, label) => {
    const state = session([plot("3_3", growthDay)]), guide = getPlotGuide(state, "3_3");
    expect(guide.title).toBe("青露萝卜");
    expect(guide.status).toContain(label);
    expect(guide.progress).toContain(`${growthDay}/4`);
    expect(guide.canReclaim).toBe(false);
    expect(guide.mature).toBe(growthDay >= 4);
  });

  it("describes remaining effective growth days without promising calendar days", () => {
    const guide = getPlotGuide(session([plot("3_3", 1)]), "3_3");
    expect(guide.progress).toMatch(/3.*有效成长日/);
    expect(guide.status).toContain("干燥");
    expect(guide.next).toContain("浇水");
    expect(guide.watered).toBe(false);
  });

  it("distinguishes manual water and automatic rain and directs wet crops to rest", () => {
    const wet = getPlotGuide(session([plot("3_3", 1, true)]), "3_3");
    const rain = getPlotGuide(session([plot("3_3", 1)], true), "3_3");
    expect(wet.watered).toBe(true); expect(wet.status).toContain("已湿"); expect(wet.next).toContain("休息");
    expect(rain.watered).toBe(true); expect(rain.status).toContain("雨水"); expect(rain.next).toContain("休息");
    expect(getPlotGuide(session([], true), "3_3").watered).toBe(false);
  });

  it("describes first and repeat growth cycles and keeps the regrowing plant", () => {
    const first = getPlotGuide(session([plot("3_3", 1, true, "starberry")]), "3_3");
    const repeat = getPlotGuide(session([plot("3_3", 0, true, "starberry", 1)]), "3_3");
    expect(first.progress).toContain("1/8"); expect(first.progress).toMatch(/7.*有效成长日/);
    expect(first.status).toContain("首茬");
    expect(repeat.progress).toContain("0/3"); expect(repeat.progress).toMatch(/3.*有效成长日/);
    expect(repeat.status).toContain("再生"); expect(repeat.status).not.toContain("种子");
    expect(repeat.canReclaim).toBe(false);
  });

  it("shows mature yield and the repeat interval instead of suggesting more water", () => {
    const normal = getPlotGuide(session([plot("3_3", 8, false, "ember_tomato")]), "3_3");
    const repeat = getPlotGuide(session([plot("3_3", 3, false, "starberry", 1)]), "3_3");
    expect(normal.mature).toBe(true); expect(normal.next).toContain("E"); expect(normal.next).toContain("3");
    expect(normal.next).not.toContain("浇水");
    expect(repeat.next).toContain("保留植株"); expect(repeat.next).toMatch(/3.*有效成长日/);
    expect(repeat.progress).not.toMatch(/还需 -/);
  });

  it("uses CropService stage, maturity and cycle threshold rather than copying formulas", () => {
    const state = session([plot("3_3", 2)]);
    const stage = vi.spyOn(state.crops, "stageOf").mockReturnValue("sprout");
    const mature = vi.spyOn(state.crops, "isMature").mockReturnValue(false);
    const threshold = vi.spyOn(state.crops, "growthDaysFor").mockReturnValue(9);
    const guide = getPlotGuide(state, "3_3");
    expect(guide.status).toContain("幼苗"); expect(guide.progress).toContain("2/9");
    expect(stage).toHaveBeenCalled(); expect(mature).toHaveBeenCalled(); expect(threshold).toHaveBeenCalled();
  });
});

describe("farming overview", () => {
  it("counts only growing dry crops as needing water and sorts plots numerically", () => {
    const state = session([
      plot("10_2", 1), { id: "2_10", tilled: true, watered: false },
      plot("2_3", 1, true), plot("2_2", 4), plot("12_4", 1, false, "starberry", 1),
    ]);
    const overview = getFarmingOverview(state);
    expect(overview).toMatchObject({ tilled: 5, empty: 1, growing: 3, ready: 1, needsWater: 2 });
    expect(overview.plots.map(entry => entry.id)).toEqual(["2_2", "2_3", "2_10", "10_2", "12_4"]);
    for (const entry of overview.plots) expect(entry.guide).toEqual(getPlotGuide(state, entry.id));
  });

  it("rain covers unwatered crops and mature or empty plots never need water", () => {
    const state = session([plot("3_3", 1), plot("3_4", 4), { id: "3_5", tilled: true, watered: false }], true);
    expect(getFarmingOverview(state)).toMatchObject({ tilled: 3, empty: 1, growing: 1, ready: 1, needsWater: 0 });
  });

  it("lists all eleven crops in every season and counts only carried seeds", () => {
    const state = session();
    state.time.setDay(43);
    state.inventory.add("starberry_seed", 5); state.inventory.add("ice_grass_seed", 2);
    const overview = getFarmingOverview(state);
    expect(overview.catalog).toHaveLength(11);
    expect(overview.catalog.map(crop => crop.id)).toEqual(CROPS.map(crop => crop.id));
    for (const definition of CROPS) {
      expect(overview.catalog.find(crop => crop.id === definition.id)).toMatchObject({
        id: definition.id, name: definition.name, seasons: definition.seasons, growDays: definition.growDays,
        yield: definition.yield, sellPrice: definition.sellPrice, repeatHarvest: !!definition.repeatHarvest,
        seedCount: definition.id === "starberry" ? 5 : definition.id === "ice_grass" ? 2 : 0,
      });
    }
    expect(overview.catalog.find(crop => crop.id === "starberry")?.regrowDays).toBe(3);
    expect(overview).toMatchObject({ tilled: 0, empty: 0, growing: 0, ready: 0, needsWater: 0, plots: [] });
  });

  it("does not change farm, inventory, crop definitions or date and returns independent display arrays", () => {
    const state = session([plot("3_3", 1)]);
    const before = { farm: state.farming.serialize(), inventory: state.inventory.serialize(), date: state.time.date, definitions: structuredClone(CROPS) };
    const overview = getFarmingOverview(state);
    getPlotGuide(state, "3_3"); getPlotGuide(state, "4_4");
    overview.catalog[0].seasons.push("changed"); overview.plots[0].guide.title = "changed";
    expect({ farm: state.farming.serialize(), inventory: state.inventory.serialize(), date: state.time.date, definitions: CROPS }).toEqual(before);
    expect(getFarmingOverview(state).plots[0].guide.title).toBe("青露萝卜");
  });
});
