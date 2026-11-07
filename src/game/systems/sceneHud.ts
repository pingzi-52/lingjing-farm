import type Phaser from "phaser";
import type { ItemVisual } from "./itemVisual";

interface HudState {
  area: string;
  date: string;
  clock: string;
  energy: number;
  gold: number;
}
export const HUD_PALETTE = { paper: 0xf0e5c9, edge: 0x927652, green: 0x788f58, ink: "#3f503b", muted: "#69725a" };
const FONT = '"Microsoft YaHei", sans-serif';

/** Fixed-screen display only. Callers retain all state, input and save ownership. */
export class SceneHud {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly area: Phaser.GameObjects.Text;
  private readonly date: Phaser.GameObjects.Text;
  private readonly clock: Phaser.GameObjects.Text;
  private readonly gold: Phaser.GameObjects.Text;
  private readonly energy: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Rectangle;
  private readonly detail: Phaser.GameObjects.Text;
  private readonly detailIcon: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    const rect = (x: number, y: number, w: number, h: number, color: number, depth: number, alpha = 1) => {
      const image = scene.add.rectangle(x, y, w, h, color, alpha).setOrigin(0).setScrollFactor(0).setDepth(depth);
      this.objects.push(image); return image;
    };
    rect(10, 11, 496, 48, 0x233326, 97, 0.2);
    rect(8, 8, 496, 48, HUD_PALETTE.paper, 98).setStrokeStyle(1, HUD_PALETTE.edge);
    rect(8, 8, 3, 48, HUD_PALETTE.green, 99);
    rect(20, 43, 72, 4, 0xd2c8a8, 99);
    this.bar = rect(20, 43, 72, 4, HUD_PALETTE.green, 100);
    const text = (x: number, y: number, size: number, color = HUD_PALETTE.ink) => {
      const label = scene.add.text(x, y, "", { fontFamily: FONT, fontSize: `${size}px`, color })
        .setScrollFactor(0).setDepth(100);
      this.objects.push(label); return label;
    };
    this.area = text(20, 14, 13).setFontStyle("bold");
    this.date = text(144, 16, 11, HUD_PALETTE.muted);
    this.clock = text(306, 14, 13).setOrigin(0.5, 0);
    this.gold = text(492, 15, 12).setOrigin(1, 0);
    this.energy = text(100, 36, 10, HUD_PALETTE.muted);
    this.detail = text(492, 35, 11).setOrigin(1, 0);
    this.detailIcon = scene.add.image(0, 42, "icon_empty").setDisplaySize(16, 16)
      .setScrollFactor(0).setDepth(100).setVisible(false);
    this.objects.push(this.detailIcon);
  }

  private fit(label: Phaser.GameObjects.Text, value: string, width: number): void {
    label.setText(value).setScale(1);
    label.setScale(Math.min(1, width / Math.max(1, label.width)));
  }

  update(state: HudState): void {
    this.fit(this.area, state.area, 110);
    this.fit(this.date, state.date, 116);
    this.fit(this.clock, state.clock, 48);
    this.fit(this.gold, `${state.gold} 金`, 132);
    this.energy.setText(`体力 ${state.energy}`);
    this.bar.setDisplaySize(72 * Math.max(0, Math.min(100, state.energy)) / 100, 4)
      .setFillStyle(state.energy < 20 ? 0xc17d4d : HUD_PALETTE.green);
  }

  setDetail(value: string, visual?: ItemVisual): void {
    const withIcon = Boolean(visual && visual.texture !== "icon_empty");
    this.fit(this.detail, value, withIcon ? 304 : 326);
    this.detailIcon.setVisible(withIcon);
    if (withIcon && visual) {
      this.detailIcon.setTexture(visual.texture, visual.frame).setDisplaySize(16, 16)
        .setPosition(this.detail.x - this.detail.displayWidth - 12, 42);
    }
  }

  destroy(): void { for (const object of this.objects) object.destroy(); this.objects.length = 0; }
}
