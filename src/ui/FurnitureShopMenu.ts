import type Phaser from "phaser";
import { FURNITURE_DEFINITIONS } from "../data/furniture";
import { getGameSession } from "../game/systems/GameSession";
import { getFarmAudio } from "../game/systems/farmAudio";
import { PausePanel, node } from "./PausePanel";
import { FURNITURE_FEEDBACK, furnitureArtData } from "./furnitureUi";

export class FurnitureShopMenu extends PausePanel {
  private message = "";

  constructor(scene: Phaser.Scene) { super(scene, "阿榆家具店", ""); }

  open(): void { if (this.begin()) { this.message = ""; this.render(); } }

  private render(): void {
    const scrollTop = this.overlay?.querySelector(".farm-menu-body")?.scrollTop ?? 0;
    const session = getGameSession(), items = session.furniture.state.items;
    const panel = this.panel("阿榆家具店"), body = node("div", "farm-menu-body");
    panel.classList.add("furniture-shop");
    panel.append(node("p", "farm-menu-balance", `金币 ${session.economy.goldValue} · 家具 ${items.length}/32 件`));
    panel.append(node("p", "farm-menu-note", "每次购买一件，自动保存并放入家具收纳。回到小屋按 G 布置；家具不占随身背包。"));
    const status = node("p", "farm-menu-status", this.message || "挑选一件喜欢的家具吧。Esc 关闭 · Tab 切换按钮");
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    panel.append(status);
    for (const piece of FURNITURE_DEFINITIONS) {
      const row = node("div", "farm-market-row"), detail = node("div", "farm-market-detail");
      row.dataset.furnitureKind = piece.kind;
      const art = furnitureArtData(this.scene, piece.kind);
      if (art) {
        const icon = node("img", "farm-item-icon"); icon.src = art.src; icon.alt = "";
        row.append(icon);
      } else {
        const fallback = node("span", "farm-item-icon", "图缺");
        fallback.setAttribute("aria-label", "家具图片暂缺"); row.append(fallback);
      }
      const owned = items.filter(item => item.kind === piece.kind), stored = owned.filter(item => item.position === null).length;
      detail.append(node("strong", "", piece.name), node("small", "", `${piece.price} 金 / 件 · 拥有 ${owned.length} 件 · 收纳 ${stored} 件`));
      const full = items.length >= 32, insufficient = session.economy.goldValue < piece.price;
      const reason = full ? "家具已满32件，暂时无法购买。" : insufficient ? `金币不足，还差 ${piece.price - session.economy.goldValue} 金。` : "";
      const note = node("small", "", reason || (piece.wall ? "仅可挂在小屋北墙" : piece.kind === "rug" ? "可与其他家具叠放" : "需留出家具和通行空间"));
      note.id = `furniture-shop-note-${piece.kind}`; detail.append(note);
      const buy = this.button("购买一件", `furniture-buy-${piece.kind}`, () => {
        const result = session.buyFurniture(piece.kind);
        getFarmAudio().play(result.ok ? "confirm" : "error");
        this.message = result.ok ? `买下了1件${piece.name}，已放入家具收纳并保存。` : FURNITURE_FEEDBACK[result.reason] ?? "购买未完成，请稍后重试。";
        this.render();
      }, full || insufficient);
      buy.setAttribute("aria-label", `购买一件${piece.name}，${piece.price}金币`);
      buy.setAttribute("aria-describedby", note.id);
      if (reason) buy.title = reason;
      row.append(detail, buy); body.append(row);
    }
    panel.append(body); this.show(panel); body.scrollTop = scrollTop;
  }
}
