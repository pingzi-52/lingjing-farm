import type Phaser from "phaser";
import { getGameSession } from "../game/systems/GameSession";
import { PausePanel, node } from "./PausePanel";
import type { AreaMapSnapshot } from "../game/systems/areaMap";
import { createAreaMapView } from "./AreaMapView";
import { getIntroObjective, getExplorationObjective } from "../game/systems/objectiveGuide";
export class TravelMenu extends PausePanel {
  constructor(scene: Phaser.Scene, private readonly getMap?: () => AreaMapSnapshot) { super(scene, "区域与委托", "KeyL"); }
  open(): void {
    if (!this.begin()) return;
    const s = getGameSession(), state = s.exploration.state, panel = this.panel("区域手记 · 委托");
    panel.append(node("p", "farm-menu-note", "林缘森林 ← 林缘农场 → 溪桥镇"));
    const map = this.getMap?.();
    if (map) panel.append(createAreaMapView(map));
    else panel.append(node("p", "farm-menu-note", "沿农场西侧林间路进入森林，沿东侧乡道前往小镇；顺来路可回农场。"));
    if (this.scene.sys.settings.key === "home") {
      panel.append(node("p", "farm-menu-note", "你在林缘小屋：先从下方门口出屋，再沿农场路口步行。"));
    }
    for (const area of [
      { id: "farm", name: "林缘农场", detail: "种田、禾木杂货铺、农舍与储物箱" },
      { id: "forest", name: "林缘森林", detail: `岚的采集委托 · 今日已采 ${state.picked.length}/9 处` },
      { id: "town", name: "溪桥镇", detail: "阿榆的工坊 · 修缮委托与提灯配方" },
    ] as const) {
      const row = node("div", "farm-market-row"), detail = node("div", "farm-market-detail");
      const here = this.scene.sys.settings.key === area.id;
      detail.append(node("strong", "", `${area.name}${here ? " · 你在这里" : ""}`), node("small", "", area.detail));
      row.append(detail);
      panel.append(row);
    }
    const labels = { available: "尚未接取", active: "进行中", ready: "可交付", completed: "已完成" };
    for (const guide of [getIntroObjective(s), getExplorationObjective(s, "forest"), getExplorationObjective(s, "carpenter")]) {
      const card = node("div", "merchant-quest journal-quest");
      card.append(node("strong", "", `${guide.title} · ${labels[guide.status]}`),
        node("p", "", guide.progress), node("p", "quest-guide-next", guide.next));
      if (guide.note) card.append(node("small", "", guide.note));
      panel.append(card);
    }
    panel.append(node("p", "farm-menu-status", "L / Esc 收起手记 · 居民身边 E 接取和交付 · K 制作"));
    this.show(panel);
  }
}
