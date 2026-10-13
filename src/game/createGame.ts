import Phaser from "phaser";
import { VIEW } from "./config";
import { BootScene } from "./scenes/BootScene";
import { TitleScene } from "./scenes/TitleScene";
import { FarmScene } from "./scenes/FarmScene";
import { initGameSession } from "./systems/GameSession";
import { createLocalSaveManager } from "../persistence/save";

/**
 * 创建 Phaser 游戏实例。
 * 先初始化全局会话（领域层单一事实源），再构建 Phaser。
 * 场景统一在此注册，避免分散 new。
 */
export function createGame(): Phaser.Game {
  initGameSession(createLocalSaveManager());

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: "game-root",
    width: VIEW.width,
    height: VIEW.height,
    pixelArt: true,
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
      },
    },
    scene: [BootScene, TitleScene, FarmScene],
  };

  return new Phaser.Game(config);
}
