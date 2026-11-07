import { EconomyService } from "../../domain/services/EconomyService";
import { TimeService } from "../../domain/services/TimeService";
import { DailyLifeService, weatherForDay } from "../../domain/services/DailyLifeService";
import { IntroQuestService, INTRO_QUEST_REWARD, INTRO_QUEST_SEEDS } from "../../domain/services/IntroQuestService";
import type { DateInfo, SaveData } from "../../domain/models/types";
import { MAX_GOLD, MemoryStorage, SaveManager } from "../../persistence/save";
import type { Result } from "../../domain/models/Result";
import { ItemCategory } from "../../domain/models/Item";
import { ExplorationService } from "../../domain/services/ExplorationService";
import { FORAGE_NODES, RECIPES, EXPLORATION_QUESTS, type ExplorationQuestKind, type RecipeId } from "../../data/exploration";
// ── T4 子阶段1 新增 import ─────────────────────
import { CropService } from "../../domain/services/CropService";
import { FarmingService } from "../../domain/services/FarmingService";
import { InventoryService } from "../../domain/services/InventoryService";
import { ShopService } from "../../domain/services/ShopService";
import { createFarmActions, type FarmActions } from "../../domain/services/FarmActions";
import { CROPS } from "../../data/crops";
import { ITEMS } from "../../data/items";
import { SHOP_HOMU } from "../../data/shops";
import { FARM01 } from "../../data/maps/farm01";
import type { FarmTileState } from "../../domain/models/Crop";
import type { WeatherProvider, WeatherState } from "../../domain/models/Weather";
import { FurnitureService } from "../../domain/services/FurnitureService";
import type { FurniturePosition } from "../../domain/models/Furniture";
import { FURNITURE_DEFINITIONS } from "../../data/furniture";

// ── T4 子阶段1 新增常量 ──────────────────────────
export const INIT_GOLD = 500;
export const INIT_TOOLS: readonly string[] = ["hoe", "watering_can"];

export type FarmCommand =
  | { kind: "till" | "water" | "harvest" | "reclaim"; tileId: string }
  | { kind: "plant"; tileId: string; seedItemId: string };

/** Match the canonical tile IDs and raw terrain accepted by V6 persistence. */
function isPersistableFarmTile(tileId: string): boolean {
  if (typeof tileId !== "string" || !/^(0|[1-9]\d*)_(0|[1-9]\d*)$/.test(tileId)) return false;
  const [row, col] = tileId.split("_").map(Number);
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(col)) return false;
  const terrain = FARM01[row]?.[col];
  return terrain !== undefined && [".", "S", "H"].includes(terrain);
}

/**
 * 跨场景共享的游戏状态（模块级单例）。
 * 场景切换不会重建它，因此金币 / 日期不会重复或丢失。
 */
export interface GameSession {
  time: TimeService;
  life: DailyLifeService;
  introQuest: IntroQuestService;
  exploration: ExplorationService;
  economy: EconomyService;
  save: SaveManager;
  // ── T4 子阶段1 新增字段 ────────────────────────
  farming: FarmingService;
  crops: CropService;
  inventory: InventoryService;
  chest: InventoryService;
  furniture: FurnitureService;
  shop: ShopService;
  weather: WeatherProvider;
  actions: FarmActions;

  /** 睡觉：日期 +1 天 + 作物按天气推进，返回最新日期 */
  sleep(): DateInfo;
  /** Sleep only takes effect if the complete next morning can be saved. */
  sleepAndSave(): Result<DateInfo>;
  /** Advances display clock only. Scenes decide when to persist actual changes. */
  advanceTime(deltaMs: number): boolean;

  /** 持久化当前状态 */
  saveGame(): boolean;

  /** Farm changes and their save succeed together; failure restores current services. */
  performFarmAction(command: FarmCommand): Result;

  /** 当季购买和作物出售：业务失败或存储失败均保持金币/背包原状。 */
  buyItem(itemId: string, amount: number): Result;
  sellItem(itemId: string, amount: number): Result;
  moveInventorySlot(from: number, to: number): Result;
  transferChest(itemId: string, amount: number, direction: "deposit" | "withdraw"): Result;
  buyFurniture(kind: string): Result;
  placeFurniture(id: number, x: number, y: number, player?: FurniturePosition): Result;
  storeFurniture(id: number): Result;
  acceptIntroQuest(): Result;
  completeIntroQuest(): Result;
  gatherNode(id: string): Result;
  acceptExplorationQuest(kind: ExplorationQuestKind): Result;
  completeExplorationQuest(kind: ExplorationQuestKind): Result;
  craftItem(recipe: RecipeId): Result;
  eatMeal(): Result;

  /** 读取存档并恢复到领域层；无存档返回 false */
  loadGame(): boolean;

  /** T4 子阶段1 新增：新游戏（D6） */
  newGame(): void;
}

function createSession(save: SaveManager = new SaveManager(new MemoryStorage())): GameSession {
  // ── T4 子阶段1：领域服务装配 ──────────────────
  // economy 提取为局部变量：actions 与返回对象须共享同一实例
  const economy = new EconomyService();
  const tiles = new Map<string, FarmTileState>();
  const crops = new CropService(CROPS);
  const farming = new FarmingService(tiles, crops);
  const inventory = new InventoryService(24);
  const chest = new InventoryService(24);
  const furniture = new FurnitureService();
  const shop = new ShopService(SHOP_HOMU, ITEMS);
  const time = new TimeService();
  const life = new DailyLifeService();
  const introQuest = new IntroQuestService();
  const exploration = new ExplorationService();
  // Transactions retain service references and preserve the fractional clock tick.
  const explorationTransaction = (operation: () => Result, persist: () => boolean): Result => {
    const before = { inventory: inventory.serialize(), exploration: exploration.serialize(), energy: life.energy, gold: economy.goldValue };
    const result = operation();
    if (result.ok && persist()) return result;
    inventory.restore(before.inventory);
    exploration.restore(before.exploration);
    economy.setGold(before.gold);
    const difference = before.energy - life.energy;
    if (difference >= 0) life.recover(difference); else life.spend(-difference);
    return result.ok ? { ok: false, reason: "SAVE_FAILED" } : result;
  };
  const weather: WeatherProvider = {
    current: (): WeatherState => weatherForDay(time.date.day, time.date.season),
  };
  const applyRain = (): void => {
    if (!weather.current().autoWater) return;
    for (const [id, tile] of Object.entries(farming.serialize())) {
      if (tile.tilled && !tile.watered) farming.water(id);
    }
  };
  const advanceDay = (): DateInfo => {
    const departingWeather = weather.current();
    const date = time.advanceDay();
    farming.tickDay(date.day, departingWeather);
    exploration.beginDay(date.day);
    applyRain();
    return date;
  };
  const persist = (daily = life.serialize()): boolean => save.save({
    gold: economy.goldValue, day: time.date.day,
    inventory: inventory.serialize(), chest: chest.serialize(),
    farming: Object.values(farming.serialize()), daily,
    introQuest: introQuest.serialize(), exploration: exploration.serialize(),
    furniture: furniture.serialize(),
  });
  const furnitureTransaction = (operation: () => Result, persistState: () => boolean): Result => {
    const before = furniture.serialize(), gold = economy.goldValue;
    const result = operation();
    if (result.ok && persistState()) return result;
    furniture.restore(before); economy.setGold(gold);
    return result.ok ? { ok: false, reason: "SAVE_FAILED" } : result;
  };
  const baseActions = createFarmActions({
    farming,
    inventory,
    economy,
    items: ITEMS,
  });
  const actions: FarmActions = {
    ...baseActions,
    till(tileId) {
      const cost = farming.serialize()[tileId]?.tilled ? 0 : 2;
      if (!life.canSpend(cost)) return { ok: false, reason: "TOO_TIRED" };
      const result = baseActions.till(tileId);
      if (result.ok) {
        life.spend(cost);
        if (weather.current().autoWater) farming.water(tileId);
      }
      return result;
    },
    water(tileId) {
      const tile = farming.serialize()[tileId];
      if (!tile) return baseActions.water(tileId);
      const cost = tile.watered ? 0 : 2;
      if (!life.canSpend(cost)) return { ok: false, reason: "TOO_TIRED" };
      const result = baseActions.water(tileId);
      if (result.ok) life.spend(cost);
      return result;
    },
    plant(tileId, seedItemId) {
      if (!life.canSpend(1)) return { ok: false, reason: "TOO_TIRED" };
      const result = baseActions.plant(tileId, seedItemId);
      if (result.ok) life.spend(1);
      return result;
    },
  };

  return {
    time,
    life,
    introQuest,
    exploration,
    economy,
    save,
    // ── T4 子阶段1 新增字段 ────────────────────
    farming,
    crops,
    inventory,
    shop,
    chest,
    furniture,
    weather,
    actions,
    advanceTime(deltaMs): boolean { return this.life.advance(deltaMs); },
    sleep(): DateInfo {
      // The save schema caps days at one million. Keep every service unchanged
      // at that boundary rather than partly advancing into an unsavable day.
      if (this.time.date.day >= 1_000_000) return this.time.date;
      const d = advanceDay();
      this.life.resetMorning();
      return d;
    },
    sleepAndSave(): Result<DateInfo> {
      if (time.date.day >= 1_000_000) return { ok: false, reason: "DAY_LIMIT" };
      const before = { day: time.date.day, farming: farming.serialize(), exploration: exploration.serialize() };
      const date = advanceDay();
      // Persist the prospective morning before resetting life, preserving both
      // energy and the fractional clock tick when storage rejects the write.
      if (persist({ minute: 360, energy: 100 })) {
        life.resetMorning();
        return { ok: true, value: date };
      }
      time.setDay(before.day);
      farming.restore(before.farming);
      exploration.restore(before.exploration);
      return { ok: false, reason: "SAVE_FAILED" };
    },
    saveGame(): boolean {
      return persist();
    },
    performFarmAction(command): Result {
      if (!["till", "water", "plant", "harvest", "reclaim"].includes(command?.kind)) return { ok: false, reason: "INVALID_ACTION" };
      if (!isPersistableFarmTile(command.tileId)) return { ok: false, reason: "INVALID_TILE" };
      const before = { farming: this.farming.serialize(), inventory: this.inventory.serialize(), energy: this.life.energy };
      let result: Result;
      switch (command.kind) {
        case "till": result = this.actions.till(command.tileId); break;
        case "water": result = this.actions.water(command.tileId); break;
        case "plant": result = this.actions.plant(command.tileId, command.seedItemId); break;
        case "harvest": result = this.actions.harvest(command.tileId); break;
        case "reclaim":
          result = this.farming.reclaim(command.tileId);
          if (result.ok && !this.life.spend(1)) result = { ok: false, reason: "TOO_TIRED" };
          break;
      }
      if (result.ok && this.saveGame()) return result;
      this.farming.restore(before.farming);
      this.inventory.restore(before.inventory);
      // Restoring the whole daily state would discard the fractional clock tick.
      const difference = before.energy - this.life.energy;
      if (difference >= 0) this.life.recover(difference); else this.life.spend(-difference);
      return result.ok ? { ok: false, reason: "SAVE_FAILED" } : result;
    },
    loadGame(): boolean {
      const data: SaveData | null = this.save.load();
      if (!data) return false;
      // SaveManager已一次性验证完整数据，此处保留所有服务引用（actions仍指向它们）。
      this.economy.setGold(data.gold);
      this.time.setDay(data.day);
      this.inventory.restore(data.inventory);
      this.chest.restore(data.chest);
      this.farming.restore(Object.fromEntries(data.farming.map(tile => [tile.id, tile])));
      this.life.restore(data.daily);
      this.introQuest.restore(data.introQuest);
      this.exploration.restore(data.exploration, data.day);
      this.furniture.restore(data.furniture);
      applyRain();
      return true;
    },
    buyFurniture(kind): Result {
      const definition = FURNITURE_DEFINITIONS.find(item => item.kind === kind);
      if (!definition) return { ok: false, reason: "UNKNOWN_FURNITURE" };
      if (economy.goldValue < definition.price) return { ok: false, reason: "NOT_ENOUGH_GOLD" };
      return furnitureTransaction(() => {
        const acquired = furniture.acquire(kind);
        if (acquired.ok) economy.spendGold(definition.price);
        return acquired;
      }, () => this.saveGame());
    },
    placeFurniture(id, x, y, player): Result {
      return furnitureTransaction(() => furniture.place(id, x, y, player), () => this.saveGame());
    },
    storeFurniture(id): Result {
      return furnitureTransaction(() => furniture.store(id), () => this.saveGame());
    },
    gatherNode(id): Result {
      const node = FORAGE_NODES.find(node => node.id === id);
      if (!node) return { ok: false, reason: "UNKNOWN_NODE" };
      if (this.exploration.state.picked.includes(id)) return { ok: false, reason: "ALREADY_PICKED" };
      if (!this.life.canSpend(2)) return { ok: false, reason: "TOO_TIRED" };
      if (!this.inventory.hasSpace(node.itemId, 1)) return { ok: false, reason: "INVENTORY_FULL" };
      return explorationTransaction(() => {
        const added = this.inventory.add(node.itemId, 1);
        if (!added.ok) return added;
        this.life.spend(2);
        return this.exploration.gather(id);
      }, () => this.saveGame());
    },
    acceptExplorationQuest(kind): Result {
      return explorationTransaction(() => this.exploration.acceptQuest(kind), () => this.saveGame());
    },
    completeExplorationQuest(kind): Result {
      if (kind !== "forest" && kind !== "carpenter") return { ok: false, reason: "UNKNOWN_QUEST" };
      const key = kind === "forest" ? "forestQuest" : "carpenterQuest";
      if (this.exploration.state[key] !== "active") return { ok: false, reason: "QUEST_NOT_ACTIVE" };
      const quest = EXPLORATION_QUESTS[kind];
      if (quest.requirements.some(material => this.inventory.count(material.itemId) < material.amount)) return { ok: false, reason: "NOT_ENOUGH" };
      if (!Number.isSafeInteger(this.economy.goldValue + quest.reward) || this.economy.goldValue + quest.reward > MAX_GOLD) return { ok: false, reason: "GOLD_LIMIT" };
      return explorationTransaction(() => {
        for (const material of quest.requirements) {
          const removed = this.inventory.remove(material.itemId, material.amount);
          if (!removed.ok) return removed;
        }
        this.economy.setGold(this.economy.goldValue + quest.reward);
        return this.exploration.completeQuest(kind);
      }, () => this.saveGame());
    },
    craftItem(recipeId): Result {
      if (recipeId !== "mushroom_meal" && recipeId !== "farm_lantern") return { ok: false, reason: "UNKNOWN_RECIPE" };
      const recipe = RECIPES[recipeId];
      if (recipeId === "farm_lantern" && this.exploration.state.lanternBuilt) return { ok: false, reason: "ALREADY_BUILT" };
      if (recipe.requiresCarpenter && this.exploration.state.carpenterQuest !== "completed") return { ok: false, reason: "RECIPE_LOCKED" };
      if (recipe.ingredients.some(material => this.inventory.count(material.itemId) < material.amount)) return { ok: false, reason: "NOT_ENOUGH" };
      return explorationTransaction(() => {
        for (const material of recipe.ingredients) {
          const removed = this.inventory.remove(material.itemId, material.amount);
          if (!removed.ok) return removed;
        }
        return recipe.output ? this.inventory.add(recipe.output.itemId, recipe.output.amount) : this.exploration.buildLantern();
      }, () => this.saveGame());
    },
    eatMeal(): Result {
      if (this.life.energy >= 100) return { ok: false, reason: "ENERGY_FULL" };
      if (this.inventory.count("mushroom_meal") < 1) return { ok: false, reason: "NOT_ENOUGH" };
      return explorationTransaction(() => {
        const removed = this.inventory.remove("mushroom_meal", 1);
        if (!removed.ok) return removed;
        this.life.recover(25);
        return { ok: true, value: undefined };
      }, () => this.saveGame());
    },
    acceptIntroQuest(): Result {
      const before = this.introQuest.serialize();
      const inventory = this.inventory.serialize();
      const gold = this.economy.goldValue;
      const accepted = this.introQuest.accept(this.time.date.season);
      if (!accepted.ok) return accepted;
      const added = this.inventory.add(accepted.value.seedItemId, INTRO_QUEST_SEEDS);
      if (!added.ok || !this.saveGame()) {
        this.inventory.restore(inventory);
        this.economy.setGold(gold);
        this.introQuest.restore(before);
        return added.ok ? { ok: false, reason: "SAVE_FAILED" } : added;
      }
      return { ok: true, value: undefined };
    },
    completeIntroQuest(): Result {
      const before = this.introQuest.serialize();
      if (before.status !== "active" || before.cropId === null) return { ok: false, reason: "QUEST_NOT_ACTIVE" };
      if (this.inventory.count(before.cropId) < 1) return { ok: false, reason: "NOT_ENOUGH" };
      const gold = this.economy.goldValue;
      if (!Number.isSafeInteger(gold + INTRO_QUEST_REWARD) || gold + INTRO_QUEST_REWARD > MAX_GOLD) {
        return { ok: false, reason: "GOLD_LIMIT" };
      }
      const inventory = this.inventory.serialize();
      const removed = this.inventory.remove(before.cropId, 1);
      if (!removed.ok) return removed;
      this.economy.setGold(gold + INTRO_QUEST_REWARD);
      const completed = this.introQuest.complete();
      if (!completed.ok || !this.saveGame()) {
        this.inventory.restore(inventory);
        this.economy.setGold(gold);
        this.introQuest.restore(before);
        return completed.ok ? { ok: false, reason: "SAVE_FAILED" } : completed;
      }
      return { ok: true, value: undefined };
    },
    buyItem(itemId: string, amount: number): Result {
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 24 * 99) return { ok: false, reason: "INVALID_AMOUNT" };
      if (!ITEMS.some(item => item.id === itemId)) return { ok: false, reason: "UNKNOWN_ITEM" };
      if (!this.shop.list(this.economy.goldValue, this.time.date.season).some(listing => listing.item.id === itemId)) return { ok: false, reason: "NOT_AVAILABLE" };
      const before = this.inventory.serialize();
      const gold = this.economy.goldValue;
      const result = this.shop.buy(itemId, amount, gold, this.inventory);
      if (!result.ok) return result;
      this.economy.setGold(result.value.goldLeft);
      if (!this.saveGame()) {
        this.inventory.restore(before);
        this.economy.setGold(gold);
        return { ok: false, reason: "SAVE_FAILED" };
      }
      return { ok: true, value: undefined };
    },
    sellItem(itemId: string, amount: number): Result {
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 24 * 99) return { ok: false, reason: "INVALID_AMOUNT" };
      const item = ITEMS.find(item => item.id === itemId);
      if (!item) return { ok: false, reason: "UNKNOWN_ITEM" };
      if ((item.category !== ItemCategory.Crop && item.category !== ItemCategory.Material) || item.sellPrice === undefined) return { ok: false, reason: "NOT_SELLABLE" };
      const before = this.inventory.serialize();
      const gold = this.economy.goldValue;
      if (!Number.isSafeInteger(gold + item.sellPrice * amount) || gold + item.sellPrice * amount > MAX_GOLD) return { ok: false, reason: "GOLD_LIMIT" };
      const result = this.actions.sell(itemId, amount);
      if (!result.ok) return result;
      if (!this.saveGame()) {
        this.inventory.restore(before);
        this.economy.setGold(gold);
        return { ok: false, reason: "SAVE_FAILED" };
      }
      return { ok: true, value: undefined };
    },
    moveInventorySlot(from: number, to: number): Result {
      const before = this.inventory.serialize();
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= before.capacity || to >= before.capacity) return { ok: false, reason: "INVALID_SLOT" };
      if (from === to) return { ok: true, value: undefined };
      const next = this.inventory.serialize();
      [next.slots[from], next.slots[to]] = [next.slots[to], next.slots[from]];
      this.inventory.restore(next);
      if (!this.saveGame()) {
        this.inventory.restore(before);
        return { ok: false, reason: "SAVE_FAILED" };
      }
      return { ok: true, value: undefined };
    },
    transferChest(itemId: string, amount: number, direction: "deposit" | "withdraw"): Result {
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 24 * 99) return { ok: false, reason: "INVALID_AMOUNT" };
      if (!ITEMS.some(item => item.id === itemId)) return { ok: false, reason: "UNKNOWN_ITEM" };
      if (direction !== "deposit" && direction !== "withdraw") return { ok: false, reason: "INVALID_DIRECTION" };
      const source = direction === "deposit" ? this.inventory : this.chest;
      const destination = direction === "deposit" ? this.chest : this.inventory;
      if (source.count(itemId) < amount) return { ok: false, reason: "NOT_ENOUGH" };
      if (!destination.hasSpace(itemId, amount)) return { ok: false, reason: "INVENTORY_FULL" };
      const beforeSource = source.serialize();
      const beforeDestination = destination.serialize();
      const removed = source.remove(itemId, amount);
      if (!removed.ok) return removed;
      const added = destination.add(itemId, amount);
      if (!added.ok || !this.saveGame()) {
        source.restore(beforeSource);
        destination.restore(beforeDestination);
        return added.ok ? { ok: false, reason: "SAVE_FAILED" } : added;
      }
      return { ok: true, value: undefined };
    },
    // ── T4 子阶段1 新增：newGame（D6） ─────────
    newGame(): void {
      this.economy.setGold(INIT_GOLD);
      this.time.setDay(1);
      this.life.resetMorning();
      this.farming.restore({});
      this.introQuest.newGame();
      this.exploration.newGame();
      this.furniture.newGame();
      this.chest.restore({ capacity: 24, slots: new Array(24).fill(null) });
      this.inventory.restore({
        capacity: 24,
        slots: new Array(24).fill(null),
      });
      for (const id of INIT_TOOLS) {
        this.inventory.add(id, 1);
      }
    },
  };
}

/** 唯一的全局会话（由 createGame 初始化一次） */
let session: GameSession = createSession();

export function getGameSession(): GameSession {
  return session;
}

export function initGameSession(save?: SaveManager): GameSession {
  session = createSession(save);
  return session;
}
