import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { HomeDecor } from "../src/game/systems/HomeDecor";
import { HOME_FURNITURE_TEXTURE } from "../src/game/systems/homeFurniturePlan";

vi.mock("phaser", () => ({ default: {} }));

class Display {
  name = ""; scaleX = 1; scaleY = 1; depth = 0;
  frame = { realWidth: 100, realHeight: 150 };
  get displayHeight() { return this.frame.realHeight * this.scaleY; }
  setOrigin() { return this; }
  setScale(value: number) { this.scaleX = value; this.scaleY = value; return this; }
  setDepth(value: number) { this.depth = value; return this; }
  setName(value: string) { this.name = value; return this; }
  setVisible() { return this; }
  destroy = vi.fn();
}
function setup(available = true, missing?: string) {
  const displays: Display[] = [], colliders: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const make = () => { const display = new Display(); displays.push(display); return display; };
  const raw = {
    textures: { exists: () => available, get: () => ({ has: (frame: string) => frame !== missing }), remove: vi.fn() },
    load: { atlas: vi.fn() },
    add: { image: make, rectangle: make, ellipse: make },
    physics: { add: { existing: vi.fn(), collider: vi.fn(() => {
      const collider = { destroy: vi.fn() }; colliders.push(collider); return collider;
    }) } },
  };
  return { raw, displays, colliders, scene: raw as unknown as Phaser.Scene };
}
const player = {} as Phaser.Physics.Arcade.Sprite;

describe("scene-owned cottage decoration", () => {
  it("loads through BASE_URL only while the atlas is absent", () => {
    const present = setup(); HomeDecor.preload(present.scene);
    expect(present.raw.load.atlas).not.toHaveBeenCalled();
    const absent = setup(false); HomeDecor.preload(absent.scene);
    expect(absent.raw.load.atlas).toHaveBeenCalledWith(HOME_FURNITURE_TEXTURE,
      expect.stringContaining("farm-assets/original-addons/v11/home-furniture-v1.png"),
      expect.stringContaining("farm-assets/original-addons/v11/home-furniture-v1.json"));
  });

  it("creates six static footprints and keeps rug below the player with equal-axis scaling", () => {
    const { scene, displays, raw, colliders } = setup(); const decor = new HomeDecor(scene, player);
    const images = displays.filter(d => d.name.startsWith("home-furniture:"));
    expect(images).toHaveLength(8); expect(colliders).toHaveLength(6);
    expect(raw.physics.add.existing).toHaveBeenCalledTimes(6);
    for (const call of raw.physics.add.existing.mock.calls) expect(call[1]).toBe(true);
    for (const image of images) expect(image.scaleX).toBe(image.scaleY);
    expect(images.find(d => d.name === "home-furniture:rug")?.depth).toBeLessThan(10);
    expect(images.find(d => d.name === "home-furniture:table")?.depth).toBe(10.025);
    decor.destroy();
  });

  it("does not leave an invisible lamp blocker or light when its frame is absent", () => {
    const { scene, displays, colliders } = setup(true, "lamp"); const decor = new HomeDecor(scene, player);
    expect(displays.some(d => d.name.includes("lamp"))).toBe(false);
    expect(displays.filter(d => d.name.startsWith("home-furniture:"))).toHaveLength(7);
    expect(colliders).toHaveLength(5); decor.destroy();
  });

  it("leaves the legacy room completely clear of new objects when loading fails", () => {
    const { scene, displays, colliders } = setup(false); const decor = new HomeDecor(scene, player);
    expect(displays).toHaveLength(0); expect(colliders).toHaveLength(0); decor.destroy();
  });

  it("releases all owned collision links and objects exactly once without removing shared textures", () => {
    const { scene, displays, colliders, raw } = setup(); const decor = new HomeDecor(scene, player);
    expect(displays.length).toBeGreaterThan(0); decor.destroy(); decor.destroy();
    for (const display of displays) expect(display.destroy).toHaveBeenCalledOnce();
    for (const collider of colliders) expect(collider.destroy).toHaveBeenCalledOnce();
    expect(raw.textures.remove).not.toHaveBeenCalled();
  });
});
