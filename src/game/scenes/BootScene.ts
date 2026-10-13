import Phaser from "phaser";
import { SCENE_TITLE } from "../config";
import { ensurePlaceholderTextures } from "../systems/placeholderAssets";

/**
 * Boot 场景：生成程序化占位纹理（无外部资源），随后进入标题场景。
 * 本阶段所有资源均为运行时生成，不依赖真实文件。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    ensurePlaceholderTextures(this);
    this.scene.start(SCENE_TITLE);
  }
}
