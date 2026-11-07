import type Phaser from "phaser";
import type { PlotGuide } from "./farmingGuide";
import { HUD_PALETTE } from "./sceneHud";

type Display = Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text;

/** Selected-field information. Owns display objects and no farm state or input. */
export class FarmPlotInfo {
  private readonly objects: Display[] = [];
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly progress: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private lastKey = "";
  private visible = false;

  constructor(scene: Phaser.Scene) {
    this.background = scene.add.rectangle(336, 72, 168, 110, HUD_PALETTE.paper, 0.97)
      .setOrigin(0).setStrokeStyle(1, HUD_PALETTE.edge).setScrollFactor(0).setDepth(104);
    this.objects.push(this.background);
    const text = (y: number, size: number, color = HUD_PALETTE.ink) => {
      const label = scene.add.text(346, y, "", { fontFamily: '"Microsoft YaHei", sans-serif', fontSize: `${size}px`, color,
        wordWrap: { width: 148 }, lineSpacing: 2 }).setScrollFactor(0).setDepth(105);
      this.objects.push(label); return label;
    };
    this.title = text(79, 12).setFontStyle("bold");
    this.status = text(98, 10, HUD_PALETTE.muted);
    this.progress = text(115, 10);
    this.hint = text(148, 10, HUD_PALETTE.muted);
    this.update(null);
  }

  update(guide: PlotGuide | null): void {
    this.visible = guide !== null;
    for (const object of this.objects) object.setVisible(this.visible);
    const key = JSON.stringify(guide);
    if (!guide || key === this.lastKey) return;
    this.lastKey = key;
    this.title.setText(guide.title);
    this.status.setText(guide.status).setScale(1);
    this.status.setScale(Math.min(1, 148 / Math.max(1, this.status.width)));
    this.progress.setText(guide.progress);
    this.hint.setText(`${guide.mature ? "E 收获" : guide.canReclaim ? "X 还原空耕地" : "左键 / Space 农作"}\nF 查看农务手记`);
  }

  contains(x: number, y: number): boolean { return this.background.getBounds().contains(x, y); }
  destroy(): void { for (const object of this.objects) object.destroy(); this.objects.length = 0; }
}
