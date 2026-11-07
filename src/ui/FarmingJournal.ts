import type Phaser from "phaser";
import { getGameSession } from "../game/systems/GameSession";
import { getFarmingOverview, getPlotGuide } from "../game/systems/farmingGuide";
import { ItemIconCache } from "../game/systems/itemVisual";
import { PausePanel, node } from "./PausePanel";

const SEASONS: Record<string, string> = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

export class FarmingJournal extends PausePanel {
  private tab: "fields" | "crops" = "fields";
  private readonly icons: ItemIconCache;

  constructor(scene: Phaser.Scene, private readonly selected: () => string | undefined) {
    super(scene, "农务手记", "KeyF");
    this.icons = new ItemIconCache(scene);
  }

  open(): void { if (this.begin()) this.render(); }

  private render(): void {
    const session = getGameSession(), overview = getFarmingOverview(session), panel = this.panel("农务手记");
    panel.classList.add("farming-journal");
    const tabs = node("nav", "farm-menu-tabs");
    for (const [id, label] of [["fields", "田地与今日待办"], ["crops", "四季作物图鉴"]] as const) {
      const button = this.button(label, `farm-${id}`, () => { this.tab = id; this.render(); });
      button.setAttribute("aria-pressed", String(this.tab === id)); tabs.append(button);
    }
    panel.append(tabs);
    if (this.tab === "fields") {
      const summary = node("div", "farming-summary");
      for (const [label, value] of [["已耕地", overview.tilled], ["空耕地", overview.empty], ["成长中", overview.growing], ["可收获", overview.ready], ["待浇水", overview.needsWater]]) {
        const stat = node("div"); stat.append(node("strong", "", String(value)), node("small", "", String(label))); summary.append(stat);
      }
      panel.append(summary);
      const selected = this.selected();
      if (selected) {
        const guide = getPlotGuide(session, selected), card = node("div", "merchant-quest farming-selected");
        card.append(node("strong", "", `选中 · ${guide.title}`), node("p", "", guide.status), node("p", "", guide.progress), node("p", "quest-guide-next", guide.next));
        panel.append(card);
      }
      panel.append(node("p", "farm-menu-note", session.weather.current().autoWater
        ? "今天下雨，所有耕地有充足水分。休息后，未成熟作物推进一个有效成长日。"
        : "干燥的作物会暂停生长。先浇水，再回小屋休息；成熟作物可直接收获。"));
      if (!overview.plots.length) panel.append(node("p", "farm-menu-note", "还没有耕地。靠近草地或预留田地，选锄头后左键点击相邻地块，或朝向地块按 Space。"));
      for (const plot of overview.plots) {
        const [row, col] = plot.id.split("_").map(Number), card = node("div", "farming-plot-row");
        card.dataset.plotId = plot.id;
        card.append(node("strong", "", `${plot.guide.mature ? "可收获 · " : ""}${plot.guide.title} · ${row + 1}行${col + 1}列`),
          node("small", "", plot.guide.status), node("small", "", plot.guide.progress));
        panel.append(card);
      }
    } else {
      panel.append(node("p", "farm-menu-note", "集市按季节出售种子；随身已有种子仍可跨季播种，田中作物也会继续成长。生长日只在水分充足后过夜时增加。"));
      for (const crop of overview.catalog) {
        const row = node("div", "farm-market-row farming-catalog-row"), detail = node("div", "farm-market-detail"), icon = node("img", "farm-item-icon");
        icon.src = this.icons.src(crop.id); icon.alt = "";
        detail.append(node("strong", "", `${crop.name} · ${crop.seasons.map(s => SEASONS[s]).join(" / ")}季种子`),
          node("small", "", `首茬 ${crop.growDays} 生长日 · 产量 ${crop.yield} · 售价 ${crop.sellPrice} 金 / 份`),
          node("small", "", `${crop.repeatHarvest ? `收获后保留植株，再生 ${crop.regrowDays ?? crop.growDays} 生长日` : "一次收获，留下耕地可再播种"} · 随身种子 ${crop.seedCount}`));
        row.append(icon, detail); panel.append(row);
      }
    }
    panel.append(node("p", "farm-menu-status", "F / Esc 收起 · 左键选择相邻格农作 · Space 朝向用工具 · E 收获 · X 仅还原空耕地"));
    this.show(panel);
  }
}
