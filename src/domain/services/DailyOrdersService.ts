import { CROPS } from "../../data/crops";
import { getItem } from "../../data/items";
import type { DailyOrder, DailyOrderContext, DailyOrdersState } from "../models/DailyOrders";
import type { InventoryState } from "../models/Item";
import type { Result } from "../models/Result";
import { CropService } from "./CropService";
import { TimeService } from "./TimeService";

const FORAGE_ITEMS: readonly string[] = ["branch", "stone", "wild_mushroom"];
const cropRules = new CropService();
const validDay = (day: unknown): day is number => typeof day === "number" && Number.isSafeInteger(day) && day >= 1 && day <= 1_000_000;
const copy = (state: DailyOrdersState): DailyOrdersState => ({ day: state.day, orders: state.orders.map(order => ({ ...order })) });
const recordWithKeys = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));

function stock(state: InventoryState | undefined, itemId: string): number {
  return state?.slots.reduce((sum, slot) => sum + (slot?.itemId === itemId ? slot.amount : 0), 0) ?? 0;
}

/** Generate once per day; only already obtainable seasonal crops may replace slot 1. */
export function createDailyOrders(day: number, context: DailyOrderContext = {}): DailyOrdersState {
  if (!validDay(day)) throw new RangeError("Invalid daily orders day");
  const season = new TimeService(day).date.season;
  const candidates = CROPS.filter(crop => crop.seasons.includes(season)).map(crop => {
    const matureYield = (context.farming ?? []).reduce((sum, tile) =>
      sum + (tile.crop?.cropId === crop.id && cropRules.isMature(tile.crop, crop) ? crop.yield : 0), 0);
    return { itemId: crop.id, available: stock(context.inventory, crop.id) + stock(context.chest, crop.id) + matureYield };
  }).filter(candidate => candidate.available > 0);
  const first = FORAGE_ITEMS[(day - 1) % FORAGE_ITEMS.length];
  const second = candidates[(day - 1) % candidates.length];
  const amount = (day - 1) % 3 + 1;
  return {
    day,
    orders: [
      { id: `daily-${day}-0`, itemId: first, amount, status: "available" },
      { id: `daily-${day}-1`, itemId: second?.itemId ?? FORAGE_ITEMS[day % FORAGE_ITEMS.length], amount: second ? Math.min(amount, second.available) : amount, status: "available" },
    ],
  };
}

/** Validate durable facts only: delivery may have already consumed the original resources. */
export function validateDailyOrders(value: unknown, savedDay: number): DailyOrdersState | null {
  if (!validDay(savedDay) || !recordWithKeys(value, ["day", "orders"]) || !validDay(value.day) || value.day > savedDay
    || !Array.isArray(value.orders) || value.orders.length !== 2) return null;
  const day = value.day;
  const season = new TimeService(day).date.season;
  const orders: DailyOrder[] = [];
  for (let slot = 0; slot < 2; slot++) {
    const order: unknown = value.orders[slot];
    if (!recordWithKeys(order, ["id", "itemId", "amount", "status"]) || order.id !== `daily-${day}-${slot}`
      || typeof order.itemId !== "string" || typeof order.amount !== "number" || !Number.isInteger(order.amount) || order.amount < 1 || order.amount > 3
      || (order.status !== "available" && order.status !== "active" && order.status !== "completed")) return null;
    if (!FORAGE_ITEMS.includes(order.itemId) && (slot === 0 || !CROPS.some(crop => crop.id === order.itemId && crop.seasons.includes(season)))) return null;
    if (orders.some(previous => previous.itemId === order.itemId)) return null;
    orders.push({ id: order.id as string, itemId: order.itemId, amount: order.amount, status: order.status });
  }
  return { day, orders };
}

export function dailyOrderReward(order: Pick<DailyOrder, "itemId" | "amount">): number {
  const sellPrice = getItem(order.itemId)?.sellPrice;
  if (sellPrice === undefined || !Number.isInteger(order.amount) || order.amount < 1 || order.amount > 3) throw new RangeError("Invalid daily order reward");
  return Math.ceil(sellPrice * order.amount * 1.5) + 20;
}

export function dailyOrderRequester(order: Pick<DailyOrder, "itemId">): string {
  if (order.itemId === "wild_mushroom") return "岚";
  return FORAGE_ITEMS.includes(order.itemId) ? "阿榆" : "禾木";
}

/** Owns order generation and transitions; the session owns delivery and save transactions. */
export class DailyOrdersService {
  private current: DailyOrdersState;

  constructor(day = 1, context?: DailyOrderContext) { this.current = createDailyOrders(day, context); }
  get state(): DailyOrdersState { return copy(this.current); }
  serialize(): DailyOrdersState { return this.state; }

  newGame(day = 1, context?: DailyOrderContext): void { this.current = createDailyOrders(day, context); }

  beginDay(day: number, context?: DailyOrderContext): void {
    if (!validDay(day) || day < this.current.day) throw new RangeError("Invalid daily orders day");
    if (day !== this.current.day) this.current = createDailyOrders(day, context);
  }

  restore(state: unknown, day?: number, context?: DailyOrderContext): void {
    const targetDay = day === undefined && state !== null && typeof state === "object" && "day" in state ? state.day : day;
    if (!validDay(targetDay)) throw new RangeError("Invalid daily orders day");
    const restored = validateDailyOrders(state, targetDay);
    if (!restored) throw new RangeError("Invalid daily orders state");
    this.current = restored.day === targetDay ? restored : createDailyOrders(targetDay, context);
  }

  accept(id: string): Result {
    const order = this.current.orders.find(candidate => candidate.id === id);
    if (!order) return { ok: false, reason: "UNKNOWN_ORDER" };
    if (order.status === "completed") return { ok: false, reason: "ORDER_COMPLETED" };
    if (order.status === "active") return { ok: false, reason: "ORDER_ALREADY_ACCEPTED" };
    order.status = "active";
    return { ok: true, value: undefined };
  }

  complete(id: string): Result {
    const order = this.current.orders.find(candidate => candidate.id === id);
    if (!order) return { ok: false, reason: "UNKNOWN_ORDER" };
    if (order.status === "completed") return { ok: false, reason: "ORDER_COMPLETED" };
    if (order.status !== "active") return { ok: false, reason: "ORDER_NOT_ACTIVE" };
    order.status = "completed";
    return { ok: true, value: undefined };
  }
}
