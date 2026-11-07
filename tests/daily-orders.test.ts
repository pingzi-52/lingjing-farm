import { describe, expect, it } from "vitest";
import { CROPS } from "../src/data/crops";
import { getItem } from "../src/data/items";
import type { DailyOrdersState } from "../src/domain/models/DailyOrders";
import type { InventoryState } from "../src/domain/models/Item";
import { createDailyOrders, DailyOrdersService, dailyOrderRequester, dailyOrderReward, validateDailyOrders } from "../src/domain/services/DailyOrdersService";
import { TimeService } from "../src/domain/services/TimeService";

const inventory = (itemId: string, amount: number): InventoryState => ({ capacity: 2, slots: [{ itemId, amount }, null] });
const forage = ["branch", "stone", "wild_mushroom"];
const tile = (cropId: string, growthDay: number, harvestedCount = 0) => ({ id: "1_1", tilled: true, watered: false, crop: { cropId, growthDay, harvestedCount } });

describe("daily order generation", () => {
  it.each([1, 14, 15, 29, 43, 1_000_000])("generates two distinct deterministic forage orders on day %i without resources", day => {
    const state = createDailyOrders(day);
    expect(createDailyOrders(day)).toEqual(state);
    expect(state.day).toBe(day);
    expect(new Set(state.orders.map(order => order.itemId)).size).toBe(2);
    expect(state.orders).toHaveLength(2);
    state.orders.forEach((order, index) => {
      expect(order.id).toBe(`daily-${day}-${index}`);
      expect(forage).toContain(order.itemId);
      expect(order.status).toBe("available");
      expect(order.amount).toBeGreaterThanOrEqual(1);
      expect(order.amount).toBeLessThanOrEqual(3);
    });
  });
  it.each(CROPS)("uses existing in-season $id and caps quantity to stock", crop => {
    const day = ({ spring: 1, summer: 15, autumn: 29, winter: 43 })[crop.seasons[0]];
    const state = createDailyOrders(day, { inventory: inventory(crop.id, 1) });
    expect(state.orders[1]).toMatchObject({ itemId: crop.id, amount: 1 });
  });
  it("counts chest stock and yield across mature tiles", () => {
    expect(createDailyOrders(3, { chest: inventory("morning_bean", 1) }).orders[1]).toMatchObject({ itemId: "morning_bean", amount: 1 });
    expect(createDailyOrders(3, { farming: [tile("morning_bean", 6)] }).orders[1]).toMatchObject({ itemId: "morning_bean" });
    expect(createDailyOrders(3, { farming: [tile("morning_bean", 6)] }).orders[1].amount).toBeLessThanOrEqual(2);
    const combined = createDailyOrders(3, { inventory: inventory("morning_bean", 1), chest: inventory("morning_bean", 1), farming: [tile("morning_bean", 6)] });
    expect(combined.orders[1].amount).toBe(3);
  });
  it("uses regrow maturity and excludes immature, seeds, empty tiles and out-of-season harvests", () => {
    expect(createDailyOrders(3, { farming: [tile("starberry", 3, 1)] }).orders[1].itemId).toBe("starberry");
    for (const context of [
      { farming: [tile("starberry", 3)] }, { farming: [tile("starberry", 2, 1)] },
      { inventory: inventory("dew_radish_seed", 20) }, { inventory: inventory("ember_tomato", 20) },
      { farming: [tile("ember_tomato", 8)] }, { farming: [{ id: "1_1", tilled: true, watered: false }] },
    ]) expect(forage).toContain(createDailyOrders(3, context).orders[1].itemId);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 1_000_001])("rejects invalid generation day %s", day => {
    expect(() => createDailyOrders(day)).toThrow(RangeError);
    expect(() => new DailyOrdersService(day)).toThrow(RangeError);
  });
  it("keeps every generated crop in season over repeated years", () => {
    const allStock = { capacity: CROPS.length, slots: CROPS.map(crop => ({ itemId: crop.id, amount: 99 })) };
    for (const day of [14, 15, 28, 29, 42, 43, 56, 57, 1_000_000]) {
      const state = createDailyOrders(day, { inventory: allStock });
      const definition = CROPS.find(crop => crop.id === state.orders[1].itemId)!;
      expect(definition.seasons).toContain(new TimeService(day).date.season);
      expect(validateDailyOrders(state, day)).toEqual(state);
    }
  });
});

describe("daily order state and rewards", () => {
  it("enforces transitions, distinct duplicate errors and unknown ids without mutation", () => {
    const service = new DailyOrdersService();
    const id = service.state.orders[0].id;
    expect(service.complete(id)).toEqual({ ok: false, reason: "ORDER_NOT_ACTIVE" });
    expect(service.accept("other")).toEqual({ ok: false, reason: "UNKNOWN_ORDER" });
    expect(service.complete("other")).toEqual({ ok: false, reason: "UNKNOWN_ORDER" });
    expect(service.accept(id).ok).toBe(true);
    expect(service.accept(id)).toEqual({ ok: false, reason: "ORDER_ALREADY_ACCEPTED" });
    expect(service.complete(id).ok).toBe(true);
    expect(service.complete(id)).toEqual({ ok: false, reason: "ORDER_COMPLETED" });
    expect(service.accept(id)).toEqual({ ok: false, reason: "ORDER_COMPLETED" });
    expect(service.state.orders[1].status).toBe("available");
  });
  it("freezes the same day despite changed context and replaces orders on the next day", () => {
    const service = new DailyOrdersService(1);
    service.accept(service.state.orders[0].id);
    const frozen = service.state;
    service.beginDay(1, { inventory: inventory("dew_radish", 99) });
    expect(service.state).toEqual(frozen);
    service.beginDay(2, { inventory: inventory("dew_radish", 1) });
    expect(service.state.orders[1].itemId).toBe("dew_radish");
    expect(service.accept(frozen.orders[0].id)).toEqual({ ok: false, reason: "UNKNOWN_ORDER" });
    expect(() => service.beginDay(1)).toThrow(RangeError);
    expect(() => service.beginDay(1_000_001)).toThrow(RangeError);
    service.newGame();
    expect(service.state).toEqual(createDailyOrders(1));
    service.newGame(15, { chest: inventory("blue_melon", 1) });
    expect(service.state.orders[1].itemId).toBe("blue_melon");
  });
  it("copies state, serialization, restore and validation results deeply", () => {
    const input = createDailyOrders(3);
    const service = new DailyOrdersService();
    service.restore(input);
    input.orders[0].status = "completed";
    service.state.orders[0].status = "completed";
    service.serialize().orders[0].status = "completed";
    expect(service.state.orders[0].status).toBe("available");
    const validation = validateDailyOrders(input, 3)!;
    validation.orders[1].status = "active";
    expect(input.orders[1].status).toBe("available");
  });
  it("restores default own day and regenerates stale orders only for an explicit later day", () => {
    const input = createDailyOrders(14, { inventory: inventory("dew_radish", 1) });
    input.orders[1].status = "completed";
    const service = new DailyOrdersService();
    service.restore(input);
    expect(service.state).toEqual(input);
    service.restore(input, 15, { chest: inventory("blue_melon", 1) });
    expect(service.state).toEqual(createDailyOrders(15, { chest: inventory("blue_melon", 1) }));
    expect(() => service.restore(input, 13)).toThrow(RangeError);
    const before = service.state;
    expect(() => service.restore(null)).toThrow(RangeError);
    expect(service.state).toEqual(before);
  });
  it("derives reward from the catalog and maps requesters", () => {
    for (const itemId of [...forage, ...CROPS.map(crop => crop.id)]) {
      for (const amount of [1, 2, 3]) expect(dailyOrderReward({ itemId, amount })).toBe(Math.ceil(getItem(itemId)!.sellPrice! * amount * 1.5) + 20);
    }
    expect(dailyOrderRequester({ itemId: "branch" })).toBe("阿榆");
    expect(dailyOrderRequester({ itemId: "stone" })).toBe("阿榆");
    expect(dailyOrderRequester({ itemId: "wild_mushroom" })).toBe("岚");
    expect(dailyOrderRequester({ itemId: "dew_radish" })).toBe("禾木");
  });
});

describe("daily order validation", () => {
  it("accepts stale and spent completed crop orders without requiring current availability", () => {
    const state = createDailyOrders(14, { inventory: inventory("dew_radish", 1) });
    state.orders[1].status = "completed";
    expect(validateDailyOrders(state, 15)).toEqual(state);
    expect(validateDailyOrders(state, 13)).toBeNull();
  });
  it.each([0, 1.5, Infinity, NaN, 1_000_001])("rejects invalid saved day %s", day => expect(validateDailyOrders(createDailyOrders(1), day)).toBeNull());
  it("rejects malformed state, extra keys, bad slots, quantities, statuses and seasonal targets", () => {
    const mutations: ((state: DailyOrdersState) => unknown)[] = [
      () => null, () => [], () => ({}), s => ({ ...s, reward: 999 }), s => ({ ...s, day: 0 }), s => ({ ...s, day: 2 }),
      s => ({ ...s, orders: [] }), s => ({ ...s, orders: [...s.orders, s.orders[0]] }),
      s => ({ ...s, orders: [null, s.orders[1]] }),
      s => ({ ...s, orders: [{ ...s.orders[0], reward: 999 }, s.orders[1]] }),
      s => ({ ...s, orders: [{ ...s.orders[0], id: "daily-1-1" }, s.orders[1]] }),
      s => ({ ...s, orders: [{ ...s.orders[0], amount: 0 }, s.orders[1]] }),
      s => ({ ...s, orders: [{ ...s.orders[0], amount: 4 }, s.orders[1]] }),
      s => ({ ...s, orders: [{ ...s.orders[0], amount: 1.5 }, s.orders[1]] }),
      s => ({ ...s, orders: [{ ...s.orders[0], status: "claimed" }, s.orders[1]] }),
      s => ({ ...s, orders: [{ ...s.orders[0], itemId: "dew_radish" }, s.orders[1]] }),
      s => ({ ...s, orders: [s.orders[0], { ...s.orders[1], itemId: s.orders[0].itemId }] }),
      ...["ember_tomato", "dew_radish_seed", "hoe", "missing"].map(itemId => (s: DailyOrdersState) => ({ ...s, orders: [s.orders[0], { ...s.orders[1], itemId }] })),
    ];
    for (const mutate of mutations) {
      const invalid = mutate(createDailyOrders(1));
      expect(validateDailyOrders(invalid, 1)).toBeNull();
      expect(() => new DailyOrdersService().restore(invalid, 1)).toThrow(RangeError);
    }
  });
});
