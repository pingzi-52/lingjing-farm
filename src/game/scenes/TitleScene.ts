import Phaser from "phaser";
import { SCENE_FARM } from "../config";
import { getGameSession } from "../systems/GameSession";

/**
 * 标题界面：
 * - 继续游戏（有存档时）
 * - 新游戏（重置金币/日期并清档）
 * 键盘：Enter=继续（无存档时=新游戏），N=新游戏；鼠标点击同样可触发
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  create(): void {
    const session = getGameSession();
    const hasSave = session.save.load() !== null;
    const cx = this.scale.width / 2;

    this.cameras.main.setBackgroundColor("#1c2a1a");

    this.add
      .text(cx, 90, "四季田园", {
        fontSize: "56px",
        fontFamily: "monospace",
        color: "#f3ead3",
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 150, "F O U R   S E A S O N S   F A R M", {
        fontSize: "14px",
        fontFamily: "monospace",
        color: "#8fae7c",
      })
      .setOrigin(0.5);

    const startLabel = hasSave ? "继续游戏 (Enter)" : "开始游戏 (Enter)";
    this.add
      .text(cx, 260, startLabel, {
        fontSize: "26px",
        fontFamily: "monospace",
        color: "#e7c863",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.enterFarm(!hasSave));

    this.add
      .text(cx, 310, "新游戏 (N)", {
        fontSize: "22px",
        fontFamily: "monospace",
        color: "#b9c7b1",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.enterFarm(true));

    this.add
      .text(cx, 380, "WASD / 方向键 移动 · 场景切换不重置游戏状态", {
        fontSize: "14px",
        fontFamily: "monospace",
        color: "#6f8a5f",
      })
      .setOrigin(0.5);

    this.input.keyboard!.on("keydown-ENTER", () => this.enterFarm(!hasSave));
    this.input.keyboard!.on("keydown-N", () => this.enterFarm(true));
  }

  private enterFarm(fresh: boolean): void {
    const session = getGameSession();
    if (fresh) {
      session.save.clear();
      // T4 子阶段1：清档后走 newGame（含金币/日期/背包/地块）。
      // 顺序：clear → newGame。newGame 内部不写盘，不会复活刚清掉的存档。
      session.newGame();
    } else {
      session.loadGame();
    }
    this.scene.start(SCENE_FARM);
  }
}
