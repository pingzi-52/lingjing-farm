import type Phaser from "phaser";
import { FarmEnvironment } from "./farmEnvironment";
import type { MerchantPlot } from "./merchantPlot";

export type MerchantQuestStatus = "available" | "active" | "ready" | "completed";

/** Static resident: an explicit body for the scene collider, no game-state mutation. */
export class MerchantResident {
  readonly body: Phaser.Physics.Arcade.Image;
  private readonly image: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private destroyed = false;

  constructor(scene: Phaser.Scene, private readonly plot: MerchantPlot) {
    this.body = scene.physics.add.staticImage(plot.x, plot.y, "player_0")
      .setDisplaySize(32, 28).setVisible(false);
    this.body.refreshBody();
    const art = scene.textures.exists("farm-merchant-v1") && scene.textures.get("farm-merchant-v1").has("trimmed");
    const depth = FarmEnvironment.objectDepth(plot.y + 16);
    this.image = scene.add.image(plot.x, plot.y + 16, art ? "farm-merchant-v1" : "player_0", art ? "trimmed" : undefined)
      .setOrigin(0.5, 1).setDepth(depth);
    // Preserve the source silhouette; independent width/height scaling flattened the tall original.
    if (art) this.image.setScale(44 / this.image.frame.realHeight);
    const labelY = this.image.y - this.image.displayHeight - 4;
    this.label = scene.add.text(plot.x, labelY, "禾木 · 杂货商", {
      fontFamily: "monospace", fontSize: "10px", color: "#f2dfaa", backgroundColor: "#302e1ccc",
    }).setOrigin(0.5, 1).setDepth(depth + 0.001);
    this.hint = scene.add.text(plot.x, labelY - 16, "E 对话", {
      fontFamily: "monospace", fontSize: "10px", color: "#fff2ba", backgroundColor: "#443621dd",
    }).setOrigin(0.5, 1).setDepth(depth + 0.002).setVisible(false);
  }

  near(x: number, y: number): boolean {
    return !this.destroyed && Number.isFinite(x) && Number.isFinite(y)
      && Math.hypot(x - this.plot.x, y - this.plot.y) <= 64;
  }

  update(playerX: number, playerY: number, questStatus: MerchantQuestStatus): void {
    if (this.destroyed) return;
    this.hint.setVisible(this.near(playerX, playerY));
    this.hint.setText(questStatus === "ready" ? "! E 交付任务"
      : questStatus === "available" ? "! E 对话" : "E 对话");
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.body.destroy(); this.image.destroy(); this.label.destroy(); this.hint.destroy();
  }
}
