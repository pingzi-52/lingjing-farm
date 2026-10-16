import Phaser from "phaser";
import type { TileDef } from "../../data/maps/farm01.types";
import type { Season } from "../../domain/models/types";
import { TILE } from "../config";
import type { ParsedMap } from "../../data/maps/farm01.types";
import { planFarmDetails } from "./farmDetails";

// Only this module knows the current environment pack. Gameplay keeps its tile keys.
const PACK = "farm-assets/cainos-basic/";
const SHEETS = ["TX Plant", "TX Props", "TX Tileset Grass"] as const;
const FENCE = "farm-wood-fence";
const REPLACED = new Set<TileDef["key"]>(["grass", "tree", "rock", "fence"]);
const TINT: Record<Season, number> = {
  spring: 0xffffff, summer: 0xf5efcc, autumn: 0xe5b781, winter: 0xc8d6df,
};

export class FarmEnvironment {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly ready: boolean;
  private readonly details = new Map<string, Phaser.GameObjects.Image[]>();

  static preload(scene: Phaser.Scene): void {
    const base = import.meta.env.BASE_URL;
    for (const sheet of SHEETS) {
      if (!scene.textures.exists(sheet)) {
        scene.load.atlas(sheet, `${base}${PACK}${sheet}.png`, `${base}${PACK}${sheet}.json`);
      }
    }
    if (!scene.textures.exists(FENCE)) {
      const path = `${base}farm-assets/original-addons/v1/wood-fence-v1`;
      scene.load.atlas(FENCE, `${path}.png`, `${path}.json`);
    }
  }

  constructor(private readonly scene: Phaser.Scene) {
    this.ready = [...SHEETS, FENCE].every(key => scene.textures.exists(key));
    if (!this.ready) return; // Original art and collision remain intact on load failure.
    const plants = scene.textures.get("TX Plant");
    for (const type of ["T1", "T2", "T3"]) {
      const name = `farm-tree-${type}`;
      if (plants.has(name)) continue;
      const upper = plants.get(`TX Tree ${type} Upper`);
      const lower = plants.get(`TX Tree ${type} Lower`);
      plants.add(name, 0, upper.cutX, upper.cutY, upper.cutWidth,
        lower.cutY + lower.cutHeight - upper.cutY);
    }
  }

  render(tile: TileDef, row: number, col: number, verticalFence: boolean): boolean {
    if (!this.ready || !REPLACED.has(tile.key)) return false;
    const x = col * TILE, y = row * TILE;
    const grass = this.scene.add.image(x, y, "TX Tileset Grass",
      `TX Tileset Grass ${(row * 13 + col * 7) % 3}`).setOrigin(0).setDepth(0);
    this.images.push(grass);
    if (tile.key === "tree") {
      const type = ["T1", "T2", "T3"][(row + col) % 3];
      this.images.push(this.scene.add.image(x + TILE / 2, y + TILE, "TX Plant",
        `farm-tree-${type}`).setOrigin(0.5, 1).setScale(0.65)
        .setDepth(FarmEnvironment.objectDepth(y + TILE)));
    } else if (tile.key === "rock") {
      this.images.push(this.scene.add.image(x + TILE / 2, y + TILE, "TX Props",
        "TX Props - Stone 06").setOrigin(0.5, 1).setDisplaySize(32, 30)
        .setDepth(FarmEnvironment.objectDepth(y + TILE)));
    } else if (tile.key === "fence") {
      this.images.push(this.scene.add.image(x + TILE / 2, y + TILE, FENCE,
        verticalFence ? "vertical" : "horizontal").setOrigin(0.5, 1)
        .setDisplaySize(verticalFence ? 10 : 32, verticalFence ? 32 : 22)
        .setDepth(FarmEnvironment.objectDepth(y + TILE)));
    }
    return true;
  }

  static objectDepth(feetY: number): number { return 10 + feetY / 10000; }

  renderDetails(world: ParsedMap): void {
    if (!this.ready) return;
    for (const detail of planFarmDetails(world)) {
      const x = detail.col * TILE, y = detail.row * TILE;
      const sprites: Phaser.GameObjects.Image[] = [];
      const add = (dx: number, dy: number, frame: string) => {
        const seed = detail.row * 17 + detail.col * 13 + sprites.length * 7;
        const bounds = this.scene.textures.getFrame("TX Plant", frame);
        const px = Math.max(bounds.width / 2, Math.min(TILE - bounds.width / 2, dx + seed % 5 - 2));
        const py = Math.max(bounds.height, Math.min(TILE, dy + (seed * 3) % 5 - 2));
        const image = this.scene.add.image(x + px, y + py, "TX Plant", frame)
          .setOrigin(0.5, 1).setDepth(2);
        sprites.push(image);
        this.images.push(image);
      };
      if (detail.kind === "flowers") {
        const spots = [[8, 12], [20, 10], [14, 19], [25, 23], [7, 27]];
        const offset = (detail.row + detail.col) % spots.length;
        for (let i = 0; i < 3 + (detail.row * 3 + detail.col) % 3; i++) {
          const [dx, dy] = spots[(i + offset) % spots.length];
          add(dx, dy, "TX Plant - Flower 01");
        }
        add(17, 30, "TX Plant - Grass 07");
      } else {
        const type = String((detail.row * 7 + detail.col * 3) % 6 + 1).padStart(2, "0");
        add(10, 16, `TX Plant - Grass ${type}`);
        add(23, 29, "TX Plant - Grass 10");
      }
      this.details.set(`${detail.row}_${detail.col}`, sprites);
    }
  }

  setCultivated(tileIds: readonly string[]): void {
    const cultivated = new Set(tileIds);
    for (const [id, sprites] of this.details) {
      for (const sprite of sprites) sprite.setVisible(!cultivated.has(id));
    }
  }

  applySeason(season: Season): void {
    for (const image of this.images) image.setTint(TINT[season]);
  }
}
