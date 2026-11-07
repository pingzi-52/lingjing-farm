import type Phaser from "phaser";
import type { FurnitureItem, FurniturePosition } from "../domain/models/Furniture";
import { FURNITURE_DEFINITIONS } from "../data/furniture";
import { getGameSession } from "../game/systems/GameSession";
import { getFarmAudio } from "../game/systems/farmAudio";
import { PausePanel, node } from "./PausePanel";
import { furnitureArtData, FURNITURE_FEEDBACK } from "./furnitureUi";

const SVG = "http://www.w3.org/2000/svg";
function shape<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

/** Candidate positions exist only in this panel until the player explicitly confirms. */
export class FurnitureLayoutMenu extends PausePanel {
  private selectedId: number | null = null;
  private draft: FurniturePosition | null = null;
  private message = "";

  constructor(scene: Phaser.Scene, private readonly player: () => FurniturePosition, private readonly changed: () => void) {
    super(scene, "布置小屋", "KeyG");
  }

  open(): void {
    if (!this.begin()) return;
    this.selectedId = null; this.draft = null; this.message = ""; this.render();
  }

  override close(): void {
    this.selectedId = null; this.draft = null; super.close();
  }

  private select(item: FurnitureItem): void {
    this.selectedId = item.id; this.draft = item.position ? { ...item.position } : { x: 256, y: 240 };
    this.message = ""; this.render();
  }

  private commit(store = false): void {
    if (this.selectedId === null || (!store && !this.draft)) return;
    const s = getGameSession();
    const result = store ? s.storeFurniture(this.selectedId)
      : s.placeFurniture(this.selectedId, this.draft!.x, this.draft!.y, this.player());
    getFarmAudio().play(result.ok ? "confirm" : "error");
    if (result.ok) {
      this.changed(); this.draft = null;
      this.message = store ? "已收回家具收纳，随时可以重新摆放。已保存。" : "已摆放并保存。";
    } else this.message = FURNITURE_FEEDBACK[result.reason] ?? "布置未完成，请换一个位置后重试。";
    this.render();
  }

  private drawItem(svg: SVGSVGElement, item: FurnitureItem, position: FurniturePosition, selected = false, valid = true): void {
    const definition = FURNITURE_DEFINITIONS.find(d => d.kind === item.kind)!;
    const art = furnitureArtData(this.scene, item.kind);
    const width = art?.width ?? definition.maxWidth, height = art?.height ?? definition.maxHeight;
    if (art) svg.append(shape("image", { href: art.src, x: position.x - width / 2, y: position.y - height, width, height,
      opacity: selected ? 0.75 : 1, "pointer-events": "none" }));
    else svg.append(shape("rect", { x: position.x - width / 2, y: position.y - height, width, height, fill: "#aa916c", "pointer-events": "none" }));
    if (selected) svg.append(shape("rect", { x: position.x - width / 2 - 2, y: position.y - height - 2,
      width: width + 4, height: height + 4, fill: "none", stroke: valid ? "#44703b" : "#b03f34", "stroke-width": 2,
      "stroke-dasharray": "4 2", "pointer-events": "none" }));
  }

  private room(items: FurnitureItem[], valid: boolean): SVGSVGElement {
    const svg = shape("svg", { viewBox: "96 80 320 272", role: "img", "aria-label": "小屋摆放预览，点击地板选择候选位置", "data-action": "furniture-room" });
    svg.append(shape("rect", { x: 96, y: 80, width: 320, height: 272, fill: "#c19b65" }));
    if (this.scene.textures.exists("home-floor")) svg.append(shape("image", {
      href: this.scene.textures.getBase64("home-floor"), x: 96, y: 80, width: 320, height: 272, preserveAspectRatio: "none" }));
    const draw = items.map(item => item.id === this.selectedId && this.draft ? { ...item, position: this.draft } : item).filter(item => item.position);
    const layers: { depth: number; draw: () => void }[] = draw.map(item => ({
      depth: item.kind === "rug" || item.kind === "wall-shelf" ? 1 : 10 + item.position!.y / 10000,
      draw: () => this.drawItem(svg, item, item.position!, item.id === this.selectedId && !!this.draft, valid),
    }));
    // Core fixtures stay visibly fixed and cannot be selected as movable furniture.
    for (const r of [{ x: 328, y: 120, w: 44, h: 80, name: "床", texture: "home-bed", frame: "trimmed" },
      { x: 140, y: 98, w: 40, h: 32, name: "木箱", texture: "TX Props", frame: "TX Props Chest" }]) {
      layers.push({ depth: 10 + (r.y + r.h) / 10000, draw: () => {
        svg.append(shape("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: 2, fill: "#e9dfbf", stroke: "#766449", "stroke-width": 2 }));
        if (this.scene.textures.exists(r.texture) && this.scene.textures.get(r.texture).has(r.frame)) svg.append(shape("image", {
          href: this.scene.textures.getBase64(r.texture, r.frame), x: r.x, y: r.y, width: r.w, height: r.h }));
        const text = shape("text", { x: r.x + r.w / 2, y: r.y - 4, "text-anchor": "middle", "font-size": 10, fill: "#fff0c8", stroke: "#62533d", "stroke-width": 0.3 });
        text.textContent = r.name; svg.append(text);
      } });
    }
    // Match the scene's stable ground/feet sorting, including multiple rugs.
    layers.sort((a, b) => a.depth - b.depth).forEach(layer => layer.draw());
    svg.append(shape("rect", { x: 224, y: 318, width: 64, height: 34, fill: "#e8d4a2", opacity: 0.65 }));
    const door = shape("text", { x: 256, y: 345, "text-anchor": "middle", "font-size": 11, fill: "#554b36" }); door.textContent = "门口留空"; svg.append(door);
    const player = this.player(); svg.append(shape("circle", { cx: player.x, cy: player.y + 12, r: 5, fill: "#f6df8c", stroke: "#596b43", "stroke-width": 2 }));
    const selected = items.find(item => item.id === this.selectedId);
    svg.addEventListener("click", event => {
      if (!selected) return;
      const matrix = svg.getScreenCTM(); if (!matrix) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      this.draft = { x: Math.round(point.x / 2) * 2, y: Math.round(point.y / 2) * 2 };
      this.message = ""; this.render();
    });
    return svg;
  }

  private render(): void {
    if (!this.isOpen) return;
    const scrollTop = this.overlay?.querySelector(".furniture-owned-list")?.scrollTop ?? 0;
    const s = getGameSession(), items = s.furniture.state.items, selected = items.find(item => item.id === this.selectedId);
    const result = selected && this.draft ? s.furniture.preview(selected.id, this.draft.x, this.draft.y, this.player()) : null;
    const panel = this.panel("布置小屋"); panel.classList.add("furniture-layout-panel");
    panel.append(node("p", "farm-menu-note", "选家具 → 点击房间预览 → 确认摆放。床和木箱固定；未确认就关闭不会改变布局。"));
    const body = node("div", "furniture-layout-body"), list = node("div", "furniture-owned-list");
    for (const item of items) {
      const definition = FURNITURE_DEFINITIONS.find(d => d.kind === item.kind)!;
      const button = this.button(`${definition.name} · ${item.position ? "屋内" : "收纳"}`, `furniture-select-${item.id}`, () => this.select(item));
      button.setAttribute("aria-pressed", String(item.id === this.selectedId)); list.append(button);
    }
    body.append(list, this.room(items, result?.ok ?? false)); panel.append(body);
    const actions = node("div", "merchant-actions furniture-layout-actions");
    for (const [label, dx, dy] of [["←", -8, 0], ["→", 8, 0], ["↑", 0, -8], ["↓", 0, 8]] as const) {
      const button = this.button(label, `furniture-nudge-${dx}-${dy}`, () => {
        if (!this.draft) return;
        this.draft = { x: this.draft.x + dx, y: this.draft.y + dy }; this.message = ""; this.render();
      }, !this.draft);
      button.setAttribute("aria-label", `向${label === "←" ? "左" : label === "→" ? "右" : label === "↑" ? "上" : "下"}微调`); actions.append(button);
    }
    actions.append(this.button("确认摆放", "furniture-place", () => this.commit(), !result?.ok),
      this.button("收回", "furniture-store", () => this.commit(true), !selected?.position),
      this.button("取消预览", "furniture-cancel", () => { this.draft = null; this.message = "已取消预览，布局未改动。"; this.render(); }, !this.draft));
    panel.append(actions);
    const feedback = this.message || (result ? result.ok ? "绿色候选可摆放，确认后才保存。" : FURNITURE_FEEDBACK[result.reason] ?? "这个位置无法摆放。" : "家具单独收纳，不占背包。金色圆点是你的位置，G / Esc 关闭。");
    const status = node("p", "farm-menu-status", feedback); status.setAttribute("role", "status"); panel.append(status); this.show(panel); list.scrollTop = scrollTop;
  }
}
