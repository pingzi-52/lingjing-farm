/** 季节枚举（原创设定：一季 14 天，一年 56 天） */
export type Season = "spring" | "summer" | "autumn" | "winter";

/** 当前游戏日期 */
export interface DateInfo {
  /** 游戏内总天数，从 1 开始 */
  day: number;
  /** 当前所处季节 */
  season: Season;
}

/** 存档数据（v1） */
export interface SaveData {
  version: number;
  gold: number;
  day: number;
}

export const SAVE_VERSION = 1;

/** 存档 key */
export const SAVE_KEY = "four-seasons-farm/save";
