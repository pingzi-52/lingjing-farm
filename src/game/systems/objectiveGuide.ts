import { EXPLORATION_QUESTS, type ExplorationQuestKind } from "../../data/exploration";
import { getItem } from "../../data/items";
import { getIntroQuestCrop } from "../../domain/services/IntroQuestService";
import type { Season } from "../../domain/models/types";
import type { GameSession } from "./GameSession";

export type ObjectiveStatus = "available" | "active" | "ready" | "completed";
export interface ObjectiveGuide {
  status: ObjectiveStatus;
  title: string;
  next: string;
  progress: string;
  note?: string;
}

type IntroSession = Pick<GameSession, "introQuest" | "inventory" | "chest" | "farming" | "crops" | "time" | "weather">;
type ExplorationSession = Pick<GameSession, "exploration" | "inventory" | "chest">;
const SEASON_NAMES: Record<Season, string> = { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" };

export function getIntroObjective(session: IntroSession): ObjectiveGuide {
  const state = session.introQuest.state;
  const crop = state.cropId ? session.crops.getDefinition(state.cropId)! : getIntroQuestCrop(session.time.date.season)!;
  if (state.status === "completed") return { title: "首份收成", progress: `已交付：${crop.name} ×1`, status: "completed", next: "首份收成已完成，可继续经营农场。" };
  const progress = `${crop.name} ${session.inventory.count(crop.id)}/1`;
  const base = { title: "首份收成", progress };
  if (state.status === "available") return { ...base, status: "available", next: "去农场找禾木领取种子与委托。" };
  if (session.inventory.count(crop.id) >= 1) return { ...base, status: "ready", next: `去农场找禾木交付 1 份${crop.name}。` };

  const active = { ...base, status: "active" as const };
  const targets = Object.values(session.farming.serialize()).flatMap(tile => tile.crop?.cropId === crop.id
    ? [{ crop: tile.crop, watered: tile.watered, mature: session.crops.isMature(tile.crop, crop) }] : []);
  const autoWater = session.weather.current().autoWater;
  const growing = targets.filter(tile => !tile.mature);
  const dry = growing.filter(tile => !tile.watered && !autoWater);
  if (targets.some(tile => tile.mature)) return {
    ...active, next: `到田里收获${crop.name}，再带给禾木。`,
    ...(dry.length ? { note: `另有 ${dry.length} 株${crop.name}仍需浇水。` } : {}),
  };
  if (dry.length) return { ...active, next: `给田里 ${dry.length} 株作物浇水：${crop.name}。`, note: "浇水后回小屋休息，作物才会推进一个生长日。" };
  if (growing.length) {
    // Report the soonest harvest using the same repeat-cycle threshold as CropService.
    const nearest = growing.map(tile => {
      const threshold = crop.repeatHarvest && tile.crop.harvestedCount > 0 ? crop.regrowDays ?? crop.growDays : crop.growDays;
      return { growth: tile.crop.growthDay, threshold };
    }).sort((a, b) => (a.threshold - a.growth) - (b.threshold - b.growth))[0];
    return { ...active, next: `回小屋休息，等待${crop.name}生长。`, note: `${autoWater ? "雨天自动浇水" : "今日已浇水"} · 最接近收获的一株 ${nearest.growth}/${nearest.threshold} 生长日。` };
  }
  if (session.chest.count(crop.id) >= 1) return { ...active, next: `从家中木箱取出 1 份${crop.name}，放进随身背包。`, note: "只有随身背包里的收成可以交付。" };
  if (session.inventory.count(crop.seedItemId) >= 1) return { ...active, next: `用锄头开垦空地，再播种${crop.name}。` };
  if (session.chest.count(crop.seedItemId) >= 1) return { ...active, next: `从家中木箱取出${crop.name}种子，再去田里播种。` };
  if (crop.seasons.includes(session.time.date.season)) return { ...active, next: `找禾木打开集市，补购${crop.name}种子。`, note: "委托种子仅领取一次，目标作物不会随换季改变。" };
  return { ...active, next: `等待${crop.seasons.map(season => SEASON_NAMES[season]).join("或")}，再找禾木补购${crop.name}种子。`, note: "当季集市不出售这种种子；委托无期限，目标保持不变。" };
}

export function getExplorationObjective(session: ExplorationSession, kind: ExplorationQuestKind): ObjectiveGuide {
  const quest = EXPLORATION_QUESTS[kind];
  const state = session.exploration.state;
  const status = kind === "forest" ? state.forestQuest : state.carpenterQuest;
  const destination = kind === "forest" ? "林缘森林找岚" : "溪桥镇找阿榆";
  if (status === "completed") return {
    title: quest.name, status, next: "委托已完成，可继续探索与制作。",
    progress: `已交付：${quest.requirements.map(material => `${getItem(material.itemId)!.name} ×${material.amount}`).join(" · ")}`,
  };
  const materials = quest.requirements.map(material => ({ ...material, name: getItem(material.itemId)!.name, count: session.inventory.count(material.itemId) }));
  const progress = materials.map(material => `${material.name} ${material.count}/${material.amount}`).join(" · ");
  const base = { title: quest.name, progress };
  if (status === "available") return { ...base, status, next: `去${destination}接取委托。` };
  const missing = materials.filter(material => material.count < material.amount);
  if (!missing.length) return { ...base, status: "ready", next: `去${destination}交付材料。` };
  const inChest = missing.filter(material => session.chest.count(material.itemId) > 0);
  if (missing.every(material => material.count + session.chest.count(material.itemId) >= material.amount)) return {
    ...base, status: "active", next: `从家中木箱取出${missing.map(material => material.name).join("、")}。`, note: "材料放入随身背包后，才能交给居民。",
  };
  return { ...base, status: "active", next: `去林缘森林采集${missing.map(material => material.name).join("、")}。`,
    note: inChest.length ? `木箱中的${inChest.map(material => material.name).join("、")}也可取出，放进随身背包。` : "只有随身背包中的材料可以交付；林间资源睡一觉后恢复。" };
}
