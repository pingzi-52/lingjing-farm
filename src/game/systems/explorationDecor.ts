import Phaser from "phaser";
import type { ExplorationKind, ExplorationMap, MapCell } from "../../data/maps/explorationMaps";
import { FarmEnvironment } from "./farmEnvironment";
import { getTownBuildingArt, planExplorationDecor } from "./explorationDecorPlan";

const TILE = 32;
const TEXT = { fontFamily: "monospace", fontSize: "10px", color: "#f2e1b9", backgroundColor: "#403522dd", padding: { x: 4, y: 2 } };
const BUILDINGS = [["town-workshop-v1", "workshop-v1"], ["town-hall-v1", "town-hall-v1"]] as const;

/** Scene-owned display objects only; the map remains the source of all collisions. */
export class ExplorationDecor {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly focus: Phaser.GameObjects.Ellipse;

  static preload(scene: Phaser.Scene, kind: ExplorationKind): void {
    if (kind !== "town") return;
    for (const [key, file] of BUILDINGS) if (!scene.textures.exists(key)) {
      const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/v8/${file}`;
      scene.load.atlas(key, `${base}.png`, `${base}.json`);
    }
  }

  constructor(private readonly scene: Phaser.Scene, world: ExplorationMap) {
    const plan = planExplorationDecor(world);
    for (const p of plan.details) {
      const frame = p.kind === "flowers" ? "TX Plant - Flower 01" : "TX Plant - Grass 07";
      for (const [dx, dy] of [[9, 16], [23, 29]]) this.image(p.col * TILE + dx, p.row * TILE + dy, "TX Plant", frame, 12, 2);
    }
    for (const prop of world.props) {
      const override = plan.propOverrides.find(p => p.row === prop.row && p.col === prop.col);
      const chosen = override && this.hasFrame(override.texture, override.frame) ? override : { texture: "TX Props", frame: prop.frame, maxSize: 42 };
      this.image((prop.col + 0.5) * TILE, (prop.row + 1) * TILE, chosen.texture, chosen.frame, chosen.maxSize,
        FarmEnvironment.objectDepth((prop.row + 1) * TILE));
    }
    if (scene.textures.exists("farmhouse-main") && !scene.textures.get("farmhouse-main").has("trimmed")) {
      scene.textures.get("farmhouse-main").add("trimmed", 0, 44, 164, 1117, 1033);
    }
    for (const b of world.buildings) {
      const art = getTownBuildingArt(b.label, (key, frame) => this.hasFrame(key, frame));
      if (art) {
        const image = scene.add.image((b.col + b.width / 2) * TILE, (b.row + b.height) * TILE, art.texture, art.frame).setOrigin(0.5, 1);
        image.setScale(b.width * TILE / image.frame.realWidth).setDepth(FarmEnvironment.objectDepth(image.y));
        this.objects.push(image);
      }
      // Keep the name beside the approach so it cannot cover a player's face at the door.
      this.label(b.col * TILE + 30, (b.row + b.height) * TILE + 13, b.label);
    }
    for (const p of plan.labels) this.label((p.col + 0.5) * TILE, (p.row + 1) * TILE + 6, p.text);
    this.focus = scene.add.ellipse(0, 0, 28, 10, 0xe6c67a, 0.18).setStrokeStyle(1, 0xf3d58c, 0.9).setDepth(2.9).setVisible(false);
    this.objects.push(this.focus);
  }

  private hasFrame(key: string, frame?: string): boolean {
    return this.scene.textures.exists(key) && (frame === undefined || this.scene.textures.get(key).has(frame));
  }

  private image(x: number, y: number, key: string, frame: string, maxSize: number, depth: number): void {
    if (!this.hasFrame(key, frame)) return;
    const image = this.scene.add.image(x, y, key, frame).setOrigin(0.5, 1);
    image.setScale(Math.min(1, maxSize / image.frame.realWidth, maxSize / image.frame.realHeight)).setDepth(depth);
    this.objects.push(image);
  }

  private label(x: number, y: number, text: string): void {
    this.objects.push(this.scene.add.text(x, y, text, TEXT).setOrigin(0.5).setDepth(12));
  }

  focusResource(node?: MapCell): void {
    this.focus.setVisible(Boolean(node));
    if (node) this.focus.setPosition((node.col + 0.5) * TILE, (node.row + 1) * TILE - 3);
  }

  destroy(): void { for (const object of this.objects) object.destroy(); this.objects.length = 0; }
}
