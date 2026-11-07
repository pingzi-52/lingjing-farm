import { describe, expect, it, vi } from "vitest";
import { initGameSession } from "../src/game/systems/GameSession";
import { getIntroObjective, getExplorationObjective } from "../src/game/systems/objectiveGuide";
import type { FarmTileState } from "../src/domain/models/Crop";

function setup() {
  const session = initGameSession();
  session.newGame();
  return session;
}

function field(cropId: string, growthDay: number, watered = false, harvestedCount = 0): FarmTileState {
  return { id: `${cropId}_${growthDay}`, tilled: true, watered, crop: { cropId, growthDay, harvestedCount } };
}

function setFields(session: ReturnType<typeof setup>, ...tiles: FarmTileState[]) {
  session.farming.restore(Object.fromEntries(tiles.map((tile, index) => [String(index), tile])));
}

function activeIntro(cropId = "dew_radish") {
  const s = setup();
  s.introQuest.restore({ status: "active", cropId });
  return s;
}

describe("introductory objective guide", () => {
  it("shows where to accept even if the player already owns the target crop", () => {
    const s = setup();
    s.inventory.add("dew_radish", 4);
    expect(getIntroObjective(s)).toMatchObject({ status: "available", title: "首份收成" });
    expect(getIntroObjective(s).next).toMatch(/禾木.*领取/);
    expect(getIntroObjective(s).progress).toContain("青露萝卜 4/1");
  });

  it("uses actual bag counts for readiness without completing the quest", () => {
    const s = setup();
    s.introQuest.accept("spring");
    s.inventory.add("dew_radish", 5);
    expect(getIntroObjective(s)).toMatchObject({ status: "ready", progress: "青露萝卜 5/1" });
    expect(getIntroObjective(s).next).toMatch(/禾木.*交付/);
    expect(s.introQuest.state.status).toBe("active");
  });

  it("keeps completed status after materials are consumed, without another reward claim", () => {
    const s = setup();
    s.introQuest.accept("spring");
    s.introQuest.complete();
    const guide = getIntroObjective(s);
    expect(guide.status).toBe("completed");
    expect(`${guide.next} ${guide.note ?? ""}`).not.toMatch(/领取报酬|可交付/);
  });

  it("shows the introductory historical delivery after consumption regardless of remaining bag stock", () => {
    const s = activeIntro();
    s.inventory.add("dew_radish", 1);
    expect(s.completeIntroQuest().ok).toBe(true);
    expect(s.inventory.count("dew_radish")).toBe(0);
    expect(getIntroObjective(s)).toMatchObject({ status: "completed", progress: "已交付：青露萝卜 ×1" });
    s.inventory.add("dew_radish", 9);
    expect(getIntroObjective(s).progress).toBe("已交付：青露萝卜 ×1");
  });

  it("directs a seed owner to sow when there is no target crop in the field", () => {
    const s = activeIntro();
    s.inventory.add("dew_radish_seed", 2);
    expect(getIntroObjective(s).next).toMatch(/播种.*青露萝卜/);
    expect(getIntroObjective(s).status).toBe("active");
  });

  it("asks to buy missing seeds in season, including after the previous harvest is sold", () => {
    const s = activeIntro();
    s.inventory.add("dew_radish", 1);
    s.inventory.remove("dew_radish", 1);
    expect(getIntroObjective(s).next).toMatch(/禾木.*补购.*青露萝卜种子/);
    expect(getIntroObjective(s).progress).toBe("青露萝卜 0/1");
  });

  it("does not let unrelated crops or seeds replace the locked goal", () => {
    const s = activeIntro();
    s.inventory.add("morning_bean_seed", 5);
    s.inventory.add("morning_bean", 2);
    setFields(s, field("morning_bean", 6), field("starberry", 1));
    expect(getIntroObjective(s).next).toMatch(/补购.*青露萝卜种子/);
    expect(getIntroObjective(s).progress).toBe("青露萝卜 0/1");
  });

  it("prioritizes target harvest over watering and preserves the secondary watering reminder", () => {
    const s = activeIntro();
    setFields(s, field("dew_radish", 4), field("dew_radish", 1), field("morning_bean", 0));
    const guide = getIntroObjective(s);
    expect(guide.next).toMatch(/收获.*青露萝卜/);
    expect(guide.note).toMatch(/1.*青露萝卜.*浇水/);
    expect(guide.status).toBe("active");
  });

  it("gives bag delivery priority over harvest and watering", () => {
    const s = activeIntro();
    s.inventory.add("dew_radish", 1);
    setFields(s, field("dew_radish", 4), field("dew_radish", 0));
    expect(getIntroObjective(s).status).toBe("ready");
    expect(getIntroObjective(s).next).toMatch(/禾木.*交付/);
  });

  it("waters only immature target crops on dry days", () => {
    const s = activeIntro();
    setFields(s, field("dew_radish", 1), field("dew_radish", 2, true), field("morning_bean", 0));
    expect(getIntroObjective(s).next).toMatch(/浇水.*青露萝卜/);
  });

  it("waits after watering even if unrelated crops are dry", () => {
    const s = activeIntro();
    setFields(s, field("dew_radish", 2, true), field("morning_bean", 0));
    const guide = getIntroObjective(s);
    expect(guide.next).toMatch(/休息.*生长/);
    expect(guide.note).toContain("2/4");
    expect(guide.next).not.toContain("浇水");
  });

  it("uses automatic watering even when a serialized target tile is still dry", () => {
    const s = activeIntro();
    s.weather = { current: () => ({ type: "rain", autoWater: true }) };
    setFields(s, field("dew_radish", 2));
    const guide = getIntroObjective(s);
    expect(guide.next).toMatch(/休息.*生长/);
    expect(guide.note).toMatch(/雨.*自动浇水/);
  });

  it("does not remind watering for mature crops in rain and mixed fields", () => {
    const s = activeIntro();
    s.weather = { current: () => ({ type: "rain", autoWater: true }) };
    setFields(s, field("dew_radish", 4), field("dew_radish", 1));
    const guide = getIntroObjective(s);
    expect(guide.next).toMatch(/收获/);
    expect(guide.note ?? "").not.toMatch(/仍需|待浇水/);
  });

  it("uses repeat harvest maturity and its actual growth threshold", () => {
    const s = activeIntro("starberry");
    setFields(s, field("starberry", 2, true, 1));
    const mature = vi.spyOn(s.crops, "isMature");
    expect(getIntroObjective(s).next).toMatch(/休息.*生长/);
    expect(getIntroObjective(s).note).toContain("2/3");
    expect(mature).toHaveBeenCalled();
    setFields(s, field("starberry", 3, false, 1));
    expect(getIntroObjective(s).next).toMatch(/收获.*星芽莓/);
    mature.mockRestore();
  });

  it("prioritizes field work over chest contents, then withdraws harvested crops before seeds", () => {
    const s = activeIntro();
    s.chest.add("dew_radish", 1);
    s.chest.add("dew_radish_seed", 2);
    s.inventory.add("dew_radish_seed", 1);
    setFields(s, field("dew_radish", 1));
    expect(getIntroObjective(s).next).toMatch(/浇水/);
    setFields(s);
    expect(getIntroObjective(s).next).toMatch(/木箱.*取出.*青露萝卜/);
    expect(getIntroObjective(s).status).toBe("active");
    s.chest.remove("dew_radish", 1);
    expect(getIntroObjective(s).next).toMatch(/播种/);
    s.inventory.remove("dew_radish_seed", 1);
    expect(getIntroObjective(s).next).toMatch(/木箱.*取出.*青露萝卜种子/);
  });

  it("keeps the locked crop across seasons and explains unavailable seeds", () => {
    const s = activeIntro();
    s.time.setDay(15);
    const guide = getIntroObjective(s);
    expect(guide.next).toMatch(/等待.*春季.*补购.*青露萝卜种子/);
    expect(guide.note).toMatch(/当季.*不.*出售/);
    expect(s.introQuest.state.cropId).toBe("dew_radish");
  });

  it("continues to sow owned seeds outside their shop season without changing the rules", () => {
    const s = activeIntro();
    s.time.setDay(15);
    s.inventory.add("dew_radish_seed", 1);
    expect(getIntroObjective(s).next).toMatch(/播种/);
  });

  it("serializes the farm once and never serializes inventory or mutates session state", () => {
    const s = activeIntro();
    setFields(s, field("dew_radish", 1));
    s.chest.add("dew_radish_seed", 3);
    const before = { farm: s.farming.serialize(), inventory: s.inventory.serialize(), chest: s.chest.serialize(), quest: s.introQuest.state, date: s.time.date };
    const farmRead = vi.spyOn(s.farming, "serialize");
    const bagRead = vi.spyOn(s.inventory, "serialize");
    const chestRead = vi.spyOn(s.chest, "serialize");
    const save = vi.spyOn(s, "saveGame");
    const guide = getIntroObjective(s);
    guide.title = "changed by caller";
    expect(farmRead).toHaveBeenCalledTimes(1);
    expect(bagRead).not.toHaveBeenCalled();
    expect(chestRead).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect({ farm: s.farming.serialize(), inventory: s.inventory.serialize(), chest: s.chest.serialize(), quest: s.introQuest.state, date: s.time.date }).toEqual(before);
    expect(getIntroObjective(s).title).toBe("首份收成");
  });
});

describe("exploration objective guide", () => {
  it.each([
    ["forest", "已交付：野蘑菇 ×3"],
    ["carpenter", "已交付：树枝 ×6 · 溪石 ×4"],
  ] as const)("shows the %s historical delivery quantities instead of current bag stock", (kind, progress) => {
    const s = setup();
    s.exploration.acceptQuest(kind);
    s.inventory.add("wild_mushroom", 3);
    s.inventory.add("branch", 6);
    s.inventory.add("stone", 4);
    expect(s.completeExplorationQuest(kind).ok).toBe(true);
    expect(getExplorationObjective(s, kind)).toMatchObject({ status: "completed", progress });
    s.inventory.add("wild_mushroom", 9);
    s.inventory.add("branch", 9);
    s.inventory.add("stone", 9);
    expect(getExplorationObjective(s, kind).progress).toBe(progress);
  });

  it.each([
    ["forest", "岚", "林缘森林", "野蘑菇 0/3"],
    ["carpenter", "阿榆", "溪桥镇", "树枝 0/6 · 溪石 0/4"],
  ] as const)("locates the available %s quest with all named material counts", (kind, resident, location, progress) => {
    const s = setup();
    const guide = getExplorationObjective(s, kind);
    expect(guide).toMatchObject({ status: "available", progress });
    expect(guide.next).toContain(resident);
    expect(guide.next).toContain(location);
  });

  it("does not mark an unaccepted quest ready even with enough materials", () => {
    const s = setup();
    s.inventory.add("wild_mushroom", 9);
    expect(getExplorationObjective(s, "forest")).toMatchObject({ status: "available", progress: "野蘑菇 9/3" });
  });

  it("keeps all material progress visible and requests gathering when one ingredient is missing", () => {
    const s = setup();
    s.exploration.acceptQuest("carpenter");
    s.inventory.add("branch", 10);
    s.inventory.add("stone", 2);
    const guide = getExplorationObjective(s, "carpenter");
    expect(guide).toMatchObject({ status: "active", progress: "树枝 10/6 · 溪石 2/4" });
    expect(guide.next).toMatch(/林缘森林.*采集/);
  });

  it("counts only the backpack and explains withdrawing materials that are in the chest", () => {
    const s = setup();
    s.exploration.acceptQuest("carpenter");
    s.inventory.add("branch", 6);
    s.inventory.add("stone", 1);
    s.chest.add("stone", 3);
    const guide = getExplorationObjective(s, "carpenter");
    expect(guide.status).toBe("active");
    expect(guide.progress).toBe("树枝 6/6 · 溪石 1/4");
    expect(guide.next).toMatch(/木箱.*取出.*溪石/);
    expect(guide.note).toMatch(/随身背包/);
  });

  it("mentions partial chest stock while more materials still need gathering", () => {
    const s = setup();
    s.exploration.acceptQuest("carpenter");
    s.chest.add("branch", 2);
    const guide = getExplorationObjective(s, "carpenter");
    expect(guide.next).toMatch(/采集/);
    expect(guide.note).toMatch(/木箱.*树枝.*取出/);
  });

  it.each([
    ["forest", "岚", "林缘森林"], ["carpenter", "阿榆", "溪桥镇"],
  ] as const)("shows the ready %s delivery resident and location without mutations", (kind, resident, location) => {
    const s = setup();
    s.exploration.acceptQuest(kind);
    s.inventory.add("wild_mushroom", 8);
    s.inventory.add("branch", 6);
    s.inventory.add("stone", 5);
    const before = { inventory: s.inventory.serialize(), chest: s.chest.serialize(), exploration: s.exploration.state };
    const read = vi.spyOn(s.inventory, "serialize");
    const guide = getExplorationObjective(s, kind);
    expect(guide.status).toBe("ready");
    expect(guide.next).toContain(resident);
    expect(guide.next).toContain(location);
    expect(guide.next).toContain("交付");
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
    expect({ inventory: s.inventory.serialize(), chest: s.chest.serialize(), exploration: s.exploration.state }).toEqual(before);
    s.exploration.completeQuest(kind);
    const completed = getExplorationObjective(s, kind);
    expect(completed.status).toBe("completed");
    expect(`${completed.next} ${completed.note ?? ""}`).not.toMatch(/领取报酬|可交付/);
  });
});
