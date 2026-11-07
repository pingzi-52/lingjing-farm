import type Phaser from "phaser";
import { FarmEnvironment } from "./farmEnvironment";
import { groundFrames } from "./groundVisual";
import { HOME_FURNITURE, HOME_FURNITURE_TEXTURE, getHomeFurnitureArt, type HomeFurniture } from "./homeFurniturePlan";

/** Owns optional cottage images and their matching footprint bodies and colliders. */
export class HomeDecor {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly colliders: Phaser.Physics.Arcade.Collider[] = [];

  static preload(scene: Phaser.Scene): void {
    if (scene.textures.exists(HOME_FURNITURE_TEXTURE)) return;
    const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/v11/home-furniture-v1`;
    scene.load.atlas(HOME_FURNITURE_TEXTURE, `${base}.png`, `${base}.json`);
  }

  constructor(scene: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite, layout: readonly HomeFurniture[] = HOME_FURNITURE) {
    const has = groundFrames(scene);
    for (const piece of layout) {
      const art = getHomeFurnitureArt(piece.kind, has);
      if (!art) continue;
      const image = scene.add.image(piece.x, piece.y, art.texture, art.frame).setOrigin(0.5, 1);
      image.setScale(Math.min(piece.maxWidth / image.frame.realWidth, piece.maxHeight / image.frame.realHeight))
        .setDepth(piece.footprint ? FarmEnvironment.objectDepth(piece.y) : 1)
        .setName(`home-furniture:${piece.kind}`);
      this.objects.push(image);
      if (piece.footprint) {
        const r = piece.footprint;
        const blocker = scene.add.rectangle(r.x + r.width / 2, r.y + r.height / 2, r.width, r.height)
          .setVisible(false).setName(`home-footprint:${piece.kind}`);
        scene.physics.add.existing(blocker, true);
        this.objects.push(blocker);
        this.colliders.push(scene.physics.add.collider(player, blocker));
      }
      if (piece.kind === "lamp") {
        this.objects.push(scene.add.ellipse(piece.x, piece.y - image.displayHeight + 14, 38, 28, 0xffda8f, 0.12)
          .setDepth(2).setName("home-lamp-glow"));
      }
    }
  }

  destroy(): void {
    for (const collider of this.colliders) collider.destroy();
    this.colliders.length = 0;
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
  }
}
