import { EconomyService } from "../../domain/services/EconomyService";
import { TimeService } from "../../domain/services/TimeService";
import type { DateInfo, SaveData } from "../../domain/models/types";
import { MemoryStorage, SaveManager } from "../../persistence/save";
// ── T4 子阶段1 新增 import ─────────────────────
import { CropService } from "../../domain/services/CropService";
import { FarmingService } from "../../domain/services/FarmingService";
import { InventoryService } from "../../domain/services/InventoryService";
import { ShopService } from "../../domain/services/ShopService";
import { createFarmActions, type FarmActions } from "../../domain/services/FarmActions";
import { CROPS } from "../../data/crops";
import { ITEMS } from "../../data/items";
import { SHOP_HOMU } from "../../data/shops";
import type { FarmTileState } from "../../domain/models/Crop";
import type { WeatherProvider, WeatherState } from "../../domain/models/Weather";

// ── T4 子阶段1 新增常量 ──────────────────────────
export const INIT_GOLD = 500;
export const INIT_TOOLS: readonly string[] = ["hoe", "watering_can"];

const SUNNY: WeatherState = { type: "sunny", autoWater: false };
const SunnyWeatherProvider: WeatherProvider = {
  current: (): WeatherState => SUNNY,
};

/**
 * 跨场景共享的游戏状态（模块级单例）。
 * 场景切换不会重建它，因此金币 / 日期不会重复或丢失。
 */
export interface GameSession {
  time: TimeService;
  economy: EconomyService;
  save: SaveManager;
  // ── T4 子阶段1 新增字段 ────────────────────────
  farming: FarmingService;
  crops: CropService;
  inventory: InventoryService;
  shop: ShopService;
  weather: WeatherProvider;
  actions: FarmActions;

  /** 睡觉：日期 +1 天 + 作物按天气推进，返回最新日期 */
  sleep(): DateInfo;

  /** 持久化当前状态 */
  saveGame(): void;

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
  const shop = new ShopService(SHOP_HOMU, ITEMS);
  const weather: WeatherProvider = SunnyWeatherProvider;
  const actions = createFarmActions({
    farming,
    inventory,
    economy,
    items: ITEMS,
  });

  return {
    time: new TimeService(),
    economy,
    save,
    // ── T4 子阶段1 新增字段 ────────────────────
    farming,
    crops,
    inventory,
    shop,
    weather,
    actions,
    sleep(): DateInfo {
      const d = this.time.advanceDay();
      this.farming.tickDay(this.time.date.day, this.weather.current());
      return d;
    },
    saveGame(): void {
      this.save.save({
        gold: this.economy.goldValue,
        day: this.time.date.day,
      });
    },
    loadGame(): boolean {
      const data: SaveData | null = this.save.load();
      if (!data) return false;
      this.economy.setGold(data.gold);
      this.time.setDay(data.day);
      return true;
    },
    // ── T4 子阶段1 新增：newGame（D6） ─────────
    newGame(): void {
      this.economy.setGold(INIT_GOLD);
      this.time.setDay(1);
      this.farming.restore({});
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
