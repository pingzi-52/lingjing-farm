import { CROPS } from "../../data/crops";
import type { FarmTileState, Stage } from "../../domain/models/Crop";
import type { GameSession } from "./GameSession";

export interface PlotGuide {
  title: string;
  status: string;
  progress: string;
  next: string;
  mature: boolean;
  watered: boolean;
  canReclaim: boolean;
}

export interface FarmingCatalogEntry {
  id: string;
  name: string;
  seasons: string[];
  growDays: number;
  yield: number;
  sellPrice: number;
  repeatHarvest: boolean;
  regrowDays?: number;
  seedCount: number;
}

export interface FarmingOverview {
  tilled: number;
  empty: number;
  growing: number;
  ready: number;
  needsWater: number;
  plots: { id: string; guide: PlotGuide }[];
  catalog: FarmingCatalogEntry[];
}

type PlotSession = Pick<GameSession, "farming" | "crops" | "weather">;
type OverviewSession = Pick<GameSession, "farming" | "crops" | "weather" | "inventory" | "time">;
const STAGE_NAMES: Record<Stage, string> = { seed: "种子", sprout: "幼苗", young: "成长", mature: "成熟" };

function describePlot(session: PlotSession, tile: FarmTileState | undefined, rain: boolean): PlotGuide {
  if (!tile?.tilled) return {
    title: "未开垦地块", status: "尚未开垦", progress: "开垦后才能播种。", next: "选择锄头，按 Space 开垦。",
    mature: false, watered: false, canReclaim: false,
  };
  const watered = tile.watered || rain;
  const moisture = rain ? "雨水润湿" : watered ? "已湿润" : "干燥";
  if (!tile.crop) return {
    title: "空耕地", status: `等待播种 · ${moisture}`, progress: "尚未播种作物。",
    next: "选择随身种子播种；或按 X 还原未耕状态（1 体力）。",
    mature: false, watered, canReclaim: true,
  };

  const crop = tile.crop, definition = session.crops.getDefinition(crop.cropId);
  if (!definition) throw new Error(`farmingGuide: unknown crop "${crop.cropId}"`);
  const stage = session.crops.stageOf(crop, definition);
  const mature = session.crops.isMature(crop, definition);
  const threshold = session.crops.growthDaysFor(crop, definition);
  const regrowing = !!definition.repeatHarvest && crop.harvestedCount > 0;
  const phase = regrowing && stage === "seed" ? "再生初期" : STAGE_NAMES[stage];
  const cycle = regrowing ? "再生周期" : "首茬";
  const remaining = Math.max(0, threshold - crop.growthDay);
  const progress = `${crop.growthDay}/${threshold} 生长日 · ${mature ? `可收获 ${definition.yield} 份` : `还需 ${remaining} 个有效成长日`}`;
  let next: string;
  if (mature) {
    const afterHarvest = session.crops.afterHarvest(crop, definition);
    next = `按 E 收获 ${definition.yield} 份${definition.name}。${definition.repeatHarvest
      ? `收获后保留植株，再需 ${session.crops.growthDaysFor(afterHarvest, definition)} 个有效成长日。`
      : "收获后可重新播种，或按 X 还原空耕地。"}`;
  } else {
    next = watered ? "今日水分充足，回小屋休息推进一个有效成长日。" : "先浇水，再回小屋休息；干燥时作物暂停成长。";
  }
  return { title: definition.name, status: `${phase} · ${cycle} · ${moisture}`, progress, next, mature, watered, canReclaim: false };
}

/** Read-only display model. Effective water includes today's rain without writing it back. */
export function getPlotGuide(session: PlotSession, tileId: string): PlotGuide {
  return describePlot(session, session.farming.serialize()[tileId], session.weather.current().autoWater);
}

export function getFarmingOverview(session: OverviewSession): FarmingOverview {
  const rain = session.weather.current().autoWater;
  const tiles = Object.values(session.farming.serialize()).filter(tile => tile.tilled).sort((first, second) => {
    const [firstRow, firstCol] = first.id.split("_").map(Number);
    const [secondRow, secondCol] = second.id.split("_").map(Number);
    return firstRow - secondRow || firstCol - secondCol;
  });
  const plots = tiles.map(tile => ({ id: tile.id, guide: describePlot(session, tile, rain) }));
  const empty = tiles.filter(tile => !tile.crop).length;
  const ready = plots.filter(plot => plot.guide.mature).length;
  const growing = tiles.length - empty - ready;
  const needsWater = plots.filter((plot, index) => tiles[index].crop && !plot.guide.mature && !plot.guide.watered).length;
  const catalog = CROPS.map(definition => ({
    id: definition.id, name: definition.name, seasons: [...definition.seasons], growDays: definition.growDays,
    yield: definition.yield, sellPrice: definition.sellPrice, repeatHarvest: !!definition.repeatHarvest,
    ...(definition.regrowDays !== undefined ? { regrowDays: definition.regrowDays } : {}),
    seedCount: session.inventory.count(definition.seedItemId),
  }));
  return { tilled: tiles.length, empty, growing, ready, needsWater, plots, catalog };
}
