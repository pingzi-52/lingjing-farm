import type Phaser from "phaser";
import { FURNITURE_DEFINITIONS } from "../data/furniture";
import { getHomeFurnitureArt } from "../game/systems/homeFurniturePlan";

export const FURNITURE_FEEDBACK: Record<string, string> = {
  UNKNOWN_FURNITURE: "找不到这件家具，请重新选择。",
  FURNITURE_LIMIT: "家具最多拥有32件，当前无法继续购买。",
  INVALID_POSITION: "请选择房间内的有效位置。",
  OUT_OF_BOUNDS: "家具超出了房间边界，请向室内移动。",
  WALL_ONLY: "壁架只能放在北墙，请移到房间上方。",
  FURNITURE_OVERLAP: "这里与其他家具重叠，请换个位置。",
  PROTECTED_SPACE: "请留出床、木箱、门口和回屋落脚的空间。",
  PATH_BLOCKED: "这里会挡住通往床、木箱或门口的路，请换个位置。",
  PLAYER_BLOCKED: "这里会挡住角色，请先移开角色再布置。",
  SAVE_FAILED: "保存失败，本次操作已撤回，请检查浏览器存储空间后重试。",
  NOT_ENOUGH_GOLD: "金币不足，攒够金币后再来购买吧。",
};

/** Match HomeDecor's proportional display size; never substitute Phaser's missing frame. */
export function furnitureArtData(scene: Phaser.Scene, kind: string): { src: string; width: number; height: number } | null {
  const definition = FURNITURE_DEFINITIONS.find(piece => piece.kind === kind);
  if (!definition) return null;
  const art = getHomeFurnitureArt(definition.kind, (key, frame) => frame !== undefined && scene.textures.exists(key) && scene.textures.get(key).has(frame));
  if (!art) return null;
  const frame = scene.textures.getFrame(art.texture, art.frame);
  if (!frame || frame.realWidth <= 0 || frame.realHeight <= 0) return null;
  const scale = Math.min(definition.maxWidth / frame.realWidth, definition.maxHeight / frame.realHeight);
  try {
    const src = scene.textures.getBase64(art.texture, art.frame);
    if (!src || src === "data:,") return null;
    return { src, width: frame.realWidth * scale, height: frame.realHeight * scale };
  } catch {
    return null;
  }
}
