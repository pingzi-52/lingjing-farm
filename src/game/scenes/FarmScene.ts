import Phaser from "phaser";
import { parseFarm01 } from "../../data/maps/farm01";
import type { TileDef } from "../../data/maps/farm01.types";
import { TILE, SCENE_TITLE } from "../config";
import { Player } from "../entities/Player";
import { getGameSession } from "../systems/GameSession";
import { computeTargetTile, tileIdOf } from "../utils/targetTile";
import { getItem } from "../../data/items";
import { ItemCategory } from "../../domain/models/Item";
import type { Stage } from "../../domain/models/Crop";
import type { Season } from "../../domain/models/types";
// ── P5-A：纹理 key 解析唯一来源（与 placeholderAssets 共用，避免命名漂移）──
import { grassKey, rockKey, treeKey, waterKey } from "../systems/placeholderAssets";

const TILE_TEXTURE: Record<TileDef["key"], string> = {
  grass: "tile_grass",
  fence: "tile_fence",
  tree: "tile_tree",
  rock: "tile_rock",
  soil: "tile_soil",
  bed: "tile_bed",
  water: "tile_water",
};

const SEASON_LABEL: Record<string, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

// ── T4-3：作物阶段 → 占位纹理 key ─────────────────
const CROP_TEXTURE: Record<Stage, string> = {
  seed: "crop_seed",
  sprout: "crop_sprout",
  young: "crop_young",
  mature: "crop_mature",
};

// ── T4-3：允许开垦的地形 key ──────────────────────
const TILLABLE: ReadonlySet<TileDef["key"]> = new Set(["grass", "soil"]);

// ── T4-3：数字键 → 快捷栏槽位（0-based）────────────
const NUM_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT"] as const;

// ── P1：物品 → HUD 图标纹理（未匹配一律空槽图标，不出错图）──
function itemIcon(itemId: string | null, category?: ItemCategory): string {
  if (!itemId) return "icon_empty";
  if (itemId === "hoe") return "icon_hoe";
  if (itemId === "watering_can") return "icon_watering_can";
  // P2：种子/收获作物按 cropId 细分（cropId = 去掉 "_seed" 后缀或作物 id 本身）
  if (category === ItemCategory.Seed) {
    const cropId = itemId.endsWith("_seed") ? itemId.slice(0, -5) : "";
    return cropId ? `icon_seed_${cropId}` : "icon_seed";
  }
  if (category === ItemCategory.Crop) return `icon_crop_${itemId}`;
  return "icon_empty";
}

// ── P5-A：按 (row,col) 确定性选变体纹理 + 当季映射 ──
// 三个取模公式与 P4 **逐字符一致** → 变体/树种的归属与季节无关，换季不会"重新洗牌"。
function tileTextureFor(key: TileDef["key"], r: number, c: number, season: Season): string {
  switch (key) {
    case "grass":
      // 4 变体轮转（行列混合取模，分布自然且确定性）
      return grassKey(season, ((r * 13 + c * 7) % 4 + 4) % 4);
    case "tree":
      // 每 5 棵 1 棵变体树
      return treeKey(season, (r * 11 + c * 5) % 5 === 0 ? 1 : 0);
    case "rock":
      // 每 3 块 1 块卧石
      return rockKey(season, (r * 3 + c * 17) % 3 === 0 ? 1 : 0);
    case "water":
      // 水面基础帧（具体帧由水波定时器按当季切换）
      return waterKey(season, 0);
    default:
      return TILE_TEXTURE[key];
  }
}

/**
 * 农场主场景：
 * - 渲染 farm01 地图（实心格进静态物理组提供碰撞，软格为纯显示，均格中心对齐）
 * - 玩家 WASD / 方向键移动
 * - 摄像机跟随并限制在世界内
 * - HUD 显示季节日期、金币、操作提示
 * - 靠近床按 E 睡觉 → 日期 +1 天，触发一次存档
 * - T4-3：数字键 1-8 切换快捷栏、左键按选中物品操作、目标格高亮、作物阶段渲染
 */
export class FarmScene extends Phaser.Scene {
  private player!: Player;
  private hud!: Phaser.GameObjects.Text;
  private sleeping = false;
  private lastGold = -1;
  private lastDay = 0;

  // ── T4-3：新增字段 ────────────────────────────
  private world!: ReturnType<typeof parseFarm01>;
  private selectedSlot = 0;
  private tileHighlight!: Phaser.GameObjects.Rectangle;
  private cropSprites = new Map<string, Phaser.GameObjects.Image>();
  private tilledSprites = new Map<string, Phaser.GameObjects.Image>();
  private lastSnapshotKey = "";
  private lastTilledKey = "";
  private selectedNameText!: Phaser.GameObjects.Text;
  private selectedIcon!: Phaser.GameObjects.Image;
  private waterImages: Phaser.GameObjects.Image[] = [];
  private waterFrame = false;
  private waterTimer?: Phaser.Time.TimerEvent;

  // ── P5-A：四季外观 —— 地面图元缓存 + 当前季 ────
  // 换季只对这批图元做 setTexture：不销毁/不重建精灵、不动物理体、不碰玩家与相机。
  private groundTiles: {
    img: Phaser.GameObjects.Image;
    key: TileDef["key"];
    r: number;
    c: number;
  }[] = [];
  private season: Season = "spring";

  // ── P3：木质 HUD 面板与快捷栏选中态 ───────────
  private hotbarSlots: Phaser.GameObjects.Image[] = [];
  private hotbarIcons: Phaser.GameObjects.Image[] = [];
  private hotbarSelected!: Phaser.GameObjects.Image;
  private lastHotbarKey = "";

  constructor() {
    super("farm");
  }

  create(): void {
    const session = getGameSession();
    const world = parseFarm01();
    this.world = world;

    // T4-3：重置跨 create 保留的实例状态（Phaser 场景实例跨 start 复用）
    this.selectedSlot = 0;
    this.cropSprites.clear();
    this.tilledSprites.clear();
    this.lastSnapshotKey = "";
    this.lastTilledKey = "";
    this.waterImages = [];
    this.waterFrame = false;
    this.hotbarSlots = [];
    this.hotbarIcons = [];
    this.lastHotbarKey = "";
    // P5-A：清空地面图元缓存，并把"当前季"对齐到会话真实季节
    // （必须在建格循环之前，循环用它选纹理 → 首帧即正确，无换季闪烁）
    this.groundTiles = [];
    this.season = session.time.date.season;

    this.physics.world.setBounds(0, 0, world.width * TILE, world.height * TILE);

    // 静态图块：实心格进物理组（提供碰撞体），其余为纯显示
    const solids = this.physics.add.staticGroup();
    for (let r = 0; r < world.height; r++) {
      for (let c = 0; c < world.width; c++) {
        const tile = world.tiles[r][c];
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        // P5-A：按格 + **当季**选纹理（变体取模公式与季节无关 → 换季不重排）
        const tex = tileTextureFor(tile.key, r, c, this.season);
        let img: Phaser.GameObjects.Image;
        if (tile.solid) {
          const s = solids.create(cx, cy, tex);
          if (!s) continue;
          img = s as Phaser.GameObjects.Image;
          if (tile.key === "water") this.waterImages.push(img);
        } else {
          img = this.add.image(cx, cy, tex);
        }
        // P5-A：缓存地面图元，供换季统一 setTexture（不销毁、不重建、不动物理体）
        this.groundTiles.push({ img, key: tile.key, r, c });
      }
    }

    // T4-3：目标格高亮（单例矩形，初始隐藏；origin 左上，覆盖整格）
    this.tileHighlight = this.add
      .rectangle(0, 0, TILE, TILE, 0xfff28c, 0.15)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xfff28c, 0.9)
      .setDepth(6)
      .setVisible(false);

    // 玩家
    this.player = new Player(
      this,
      world.start.col * TILE + TILE / 2,
      world.start.row * TILE + TILE / 2,
    );
    this.physics.add.collider(this.player.sprite, solids);

    // P1：水面双帧动画（600ms 切换水波高光；只 setTexture，不重建精灵/碰撞体）
    // P5-A：回调**实时读取** this.season → 换季不必重建定时器也能自动切到当季帧对
    if (this.waterImages.length > 0) {
      this.waterTimer = this.time.addEvent({
        delay: 600,
        loop: true,
        callback: () => {
          this.waterFrame = !this.waterFrame;
          const key = waterKey(this.season, this.waterFrame ? 1 : 0);
          for (const img of this.waterImages) img.setTexture(key);
        },
      });
    }

    // 摄像机
    const cam = this.cameras.main;
    cam.setBounds(0, 0, world.width * TILE, world.height * TILE);
    cam.startFollow(this.player.sprite, true, 0.1, 0.1);
    cam.setZoom(1);

    // P3：顶部左木质背板（金币 + 季节日期），不随摄像机滚动
    this.add
      .image(0, 0, "panel_wide")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(99)
      .setPosition(8, 8);

    // HUD：金币图标 + 文本（固定在屏幕上，不随摄像机滚动）
    this.add
      .image(24, 22, "icon_gold")
      .setScrollFactor(0)
      .setDepth(100)
      .setScale(1.25);
    this.hud = this.add
      .text(46, 12, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f3ead3",
      })
      .setScrollFactor(0)
      .setDepth(100);

    // T4-3：右上角显示当前选中物品（P3：木质背板 + 图标 + 名称）
    this.add
      .image(0, 0, "panel_wide")
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(99)
      .setPosition(this.scale.width - 8, 8);
    this.selectedNameText = this.add
      .text(this.scale.width - 16, 13, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f3ead3",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    // P1：选中物品图标（16×16，随名称动态定位在文字左侧，不遮挡其它 HUD）
    this.selectedIcon = this.add
      .image(0, 14, "icon_empty")
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.refreshSelectedName();

    // P3：操作提示上移至快捷栏之上（快捷栏贴底，二者留 4px 间隙不叠压）
    this.add
      .text(12, this.scale.height - 52, "WASD/方向键 移动 · 1-8 选择 · 左键使用 · E 收获/睡觉 · T 回标题", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#cfe3c5",
        backgroundColor: "#10181299",
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    // P3：底部快捷栏（8 木质格 + 物品图标 + 选中态）
    this.buildHotbar();

    // 交互：床睡觉 / 回标题
    const k = this.input.keyboard!;
    k.on("keydown-E", () => this.onInteract());
    k.on("keydown-T", () => this.scene.start(SCENE_TITLE));

    // T4-3：数字键 1-8 → 快捷栏选择
    for (let i = 0; i < NUM_KEYS.length; i++) {
      k.on(`keydown-${NUM_KEYS[i]}`, () => this.selectSlot(i));
    }

    // T4-3：鼠标左键使用当前选中物品
    this.input.on("pointerdown", this.onPointerDown, this);

    session.saveGame();

    this.lastGold = session.economy.goldValue;
    this.lastDay = session.time.date.day;
    this.updateHud();
  }

  // ── T4-3：切换快捷栏槽位 ──────────────────────
  private selectSlot(index: number): void {
    this.selectedSlot = index;
    this.moveHotbarSelection();
    this.refreshSelectedName();
  }

  // ── P3：构建底部快捷栏（8 木质格 + 物品图标 + 选中高亮）──
  private buildHotbar(): void {
    const scale = 1.5; // 16px 纹理放大，适配 pixelArt 观感
    const slot = 16 * scale; // 每格宽 24
    const gap = 4;
    const count = NUM_KEYS.length; // 8
    const totalW = count * slot + (count - 1) * gap;
    const startX = (this.scale.width - totalW) / 2;
    const y = this.scale.height - 18; // 贴底，位于操作提示之上

    for (let i = 0; i < count; i++) {
      const x = startX + i * (slot + gap);
      const slotImg = this.add
        .image(x, y, "panel_slot")
        .setScrollFactor(0)
        .setDepth(98)
        .setScale(scale)
        .setOrigin(0.5);
      this.hotbarSlots.push(slotImg);
      const iconImg = this.add
        .image(x, y, "icon_empty")
        .setScrollFactor(0)
        .setDepth(99)
        .setScale(scale)
        .setOrigin(0.5);
      this.hotbarIcons.push(iconImg);
    }

    // 选中高亮（单例，初始在 0 号格；depth 压最上但不挡游戏区）
    this.hotbarSelected = this.add
      .image(startX, y, "panel_slot_selected")
      .setScrollFactor(0)
      .setDepth(100)
      .setScale(scale)
      .setOrigin(0.5);

    this.updateHotbar();
  }

  // ── P3：刷新快捷栏 8 格图标（按当前选中槽，随背包变化）──
  private updateHotbar(): void {
    const session = getGameSession();
    const hb = session.inventory.hotbar();
    for (let i = 0; i < this.hotbarIcons.length; i++) {
      const itemId = hb[i];
      let iconKey = "icon_empty";
      if (itemId) {
        const def = getItem(itemId);
        iconKey = itemIcon(itemId, def?.category);
      }
      this.hotbarIcons[i].setTexture(iconKey);
    }
  }

  // ── P3：把选中高亮移到当前槽 ──
  private moveHotbarSelection(): void {
    if (this.hotbarSlots.length === 0) return;
    const target = this.hotbarSlots[this.selectedSlot];
    if (target) this.hotbarSelected.setPosition(target.x, target.y);
  }

  // ── T4-3：刷新右上角选中物品文本 + P1：同步图标 ──
  private refreshSelectedName(): void {
    const session = getGameSession();
    const hb = session.inventory.hotbar();
    const itemId = hb[this.selectedSlot];
    let text = "空";
    let iconKey = "icon_empty";
    if (itemId) {
      const def = getItem(itemId);
      text = def ? def.name : itemId;
      iconKey = itemIcon(itemId, def?.category);
    }
    this.selectedNameText.setText(text);
    // 文字 origin(1,0) 右缘 = scale.width-12；图标置于文字左侧 6px
    this.selectedIcon.setTexture(iconKey);
    this.selectedIcon.setPosition(this.selectedNameText.x - this.selectedNameText.width - 6, 13);
  }

  // ── T4-3：目标格计算（含边界检查），越界返回 null ──
  private getTargetTileId():
    | { tileId: string; row: number; col: number; key: TileDef["key"] }
    | null {
    const t = computeTargetTile(this.player.x, this.player.y, this.player.facing, TILE);
    if (t.row < 0 || t.row >= this.world.height) return null;
    if (t.col < 0 || t.col >= this.world.width) return null;
    const def = this.world.tiles[t.row][t.col];
    return { tileId: tileIdOf(t.row, t.col), row: t.row, col: t.col, key: def.key };
  }

  // ── T4-3：鼠标左键 —— 按当前选中物品分发（结果如实提示，失败不伪装成功）──
  private onPointerDown(): void {
    const target = this.getTargetTileId();
    if (!target) return;

    const session = getGameSession();
    const itemId = session.inventory.hotbar()[this.selectedSlot];
    if (!itemId) return;

    const def = getItem(itemId);
    if (!def) return;

    // 按农田实际状态判定（非静态地图 key），与领域层规则一致
    const snapTile = session.farming.serialize()[target.tileId];

    if (itemId === "hoe") {
      if (!TILLABLE.has(target.key)) return; // 地形限制保持（grass | soil）
      const r = session.actions.till(target.tileId);
      if (!r.ok) this.toast(`开垦失败：${r.reason}`);
      // 成功：靠 T4-3 开垦覆盖层视觉反馈，不打扰式 toast
    } else if (itemId === "watering_can") {
      if (!snapTile) {
        this.toast("请先开垦这块地");
        return;
      }
      const r = session.actions.water(target.tileId);
      if (!r.ok) {
        this.toast(`浇水失败：${r.reason}`);
        return;
      }
      this.toast("浇水完成");
    } else if (def.category === ItemCategory.Seed) {
      if (!snapTile) {
        this.toast("请先开垦这块地");
        return;
      }
      if (snapTile.crop) {
        this.toast("这里已经有作物了");
        return;
      }
      const r = session.actions.plant(target.tileId, itemId);
      if (!r.ok) {
        this.toast(`播种失败：${r.reason}`);
        return;
      }
      this.toast("播种成功");
    }
  }

  // ── T4-3：E 键 —— 优先收获成熟作物，否则回落 trySleep ──
  private onInteract(): void {
    const target = this.getTargetTileId();
    if (target) {
      const session = getGameSession();
      const snap = session.farming.serialize();
      const tile = snap[target.tileId];
      if (tile && tile.crop) {
        const def = session.crops.getDefinition(tile.crop.cropId);
        if (def && session.crops.stageOf(tile.crop, def) === "mature") {
          const r = session.actions.harvest(target.tileId);
          if (r.ok) {
            this.toast("收获成功");
            return;
          }
        }
      }
    }
    // 未成功收获（无成熟作物 / 收获失败 / 越界）→ 保留原有睡觉逻辑
    this.trySleep(this.world);
  }

  // ── T4-3：作物阶段渲染（脏检查 + 精灵复用 + 移除孤儿）──
  private renderCropsIfChanged(): void {
    const session = getGameSession();
    const snap = session.farming.serialize();
    const key = JSON.stringify(snap);
    if (key === this.lastSnapshotKey) return;
    this.lastSnapshotKey = key;

    const next = new Set<string>();
    for (const [tileId, tile] of Object.entries(snap)) {
      if (!tile.crop) continue;
      const def = session.crops.getDefinition(tile.crop.cropId);
      if (!def) continue;

      const stage = session.crops.stageOf(tile.crop, def);
      let texKey: string;
      if (stage === "mature") {
        // P2：成熟期按 cropId 区分；未细分作物回落到通用成熟纹理
        const specific = `crop_${tile.crop.cropId}_mature`;
        texKey = this.textures.exists(specific) ? specific : "crop_mature";
      } else {
        texKey = CROP_TEXTURE[stage];
      }

      const parts = tileId.split("_");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      const x = c * TILE + TILE / 2;
      const y = r * TILE + TILE / 2;

      next.add(tileId);
      const img = this.cropSprites.get(tileId);
      if (img) {
        if (img.texture.key !== texKey) img.setTexture(texKey);
        img.setPosition(x, y);
      } else {
        const newImg = this.add.image(x, y, texKey).setDepth(5);
        this.cropSprites.set(tileId, newImg);
      }
    }

    for (const [tileId, img] of this.cropSprites) {
      if (!next.has(tileId)) {
        img.destroy();
        this.cropSprites.delete(tileId);
      }
    }
  }

  // ── T4-3：开垦视觉层（已开垦草地格叠加耕地纹理；脏检查 + 精灵复用）──
  private renderTilledIfChanged(): void {
    const session = getGameSession();
    const snap = session.farming.serialize();
    const key = JSON.stringify(snap);
    if (key === this.lastTilledKey) return;
    this.lastTilledKey = key;

    const next = new Set<string>();
    for (const tileId of Object.keys(snap)) {
      const parts = tileId.split("_");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      // 仅对草地格（静态地图 key 为 grass）生成覆盖层，soil 格本身已是耕地纹理
      const mapTile = this.world.tiles[r]?.[c];
      if (mapTile?.key !== "grass") continue;

      next.add(tileId);
      const x = c * TILE + TILE / 2;
      const y = r * TILE + TILE / 2;
      const img = this.tilledSprites.get(tileId);
      if (img) {
        img.setTexture("tile_tilled");
        img.setPosition(x, y);
      } else {
        this.tilledSprites.set(tileId, this.add.image(x, y, "tile_tilled").setDepth(4));
      }
    }

    for (const [tileId, img] of this.tilledSprites) {
      if (!next.has(tileId)) {
        img.destroy();
        this.tilledSprites.delete(tileId);
      }
    }
  }

  // ── P5-A：换季刷新 ─────────────────────────────
  // 只对地面图元调用 setTexture：
  //   · 不重建 GameSession / 不重置玩家位置 / 不动 physics.world 与 camera
  //   · 不销毁也不重建水波定时器（回调实时读 this.season）
  //   · 所有季节变体尺寸恒为 32×32 → StaticBody 无需 refreshBody()
  private applySeason(season: Season): void {
    for (const t of this.groundTiles) {
      const tex =
        t.key === "water"
          ? waterKey(season, this.waterFrame ? 1 : 0)
          : tileTextureFor(t.key, t.r, t.c, season);
      if (t.img.texture.key !== tex) t.img.setTexture(tex);
    }
    this.season = season;
  }

  private trySleep(world: ReturnType<typeof parseFarm01>): void {
    if (this.sleeping) return;
    const bedCenter = {
      x: world.bed.col * TILE + TILE / 2,
      y: world.bed.row * TILE + TILE / 2,
    };
    const p = this.player.sprite;
    const near =
      Math.abs(p.x - bedCenter.x) <= TILE * 1.5 &&
      Math.abs(p.y - bedCenter.y) <= TILE * 1.5;
    if (!near) return;

    this.sleeping = true;
    const session = getGameSession();
    const date = session.sleep();
    session.saveGame();
    this.toast(`睡着了… 现在是 ${date.day} 天 · ${SEASON_LABEL[date.season]}`);
    this.updateHud();
    this.time.delayedCall(400, () => {
      this.sleeping = false;
    });
  }

  private toast(text: string): void {
    const t = this.add
      .text(this.scale.width / 2, 70, text, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ffe9a3",
        backgroundColor: "#101812cc",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(110)
      .setScrollFactor(0);
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: t.y - 20,
      duration: 1400,
      onComplete: () => t.destroy(),
    });
  }

  private updateHud(): void {
    const session = getGameSession();
    const d = session.time.date;
    const g = session.economy.goldValue;
    this.hud.setText(`${SEASON_LABEL[d.season]} · 第 ${d.day} 天    金币 ${g}`);
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);

    const session = getGameSession();
    // 仅在领域层数值变化时刷新 HUD，避免每帧重建文本
    if (session.economy.goldValue !== this.lastGold || session.time.date.day !== this.lastDay) {
      this.lastGold = session.economy.goldValue;
      this.lastDay = session.time.date.day;
      this.updateHud();
    }

    // ── P5-A：季节脏检查（1 次字符串比较/帧；仅变化时重贴纹理）──
    const season = session.time.date.season;
    if (season !== this.season) this.applySeason(season);

    // T4-3：更新目标格高亮（越界隐藏）
    const target = this.getTargetTileId();
    if (target) {
      this.tileHighlight.setPosition(target.col * TILE, target.row * TILE);
      this.tileHighlight.setVisible(true);
    } else {
      this.tileHighlight.setVisible(false);
    }

    // T4-3：开垦视觉层 + 作物阶段渲染（均脏检查 + 精灵复用）
    this.renderTilledIfChanged();
    this.renderCropsIfChanged();

    // P3：快捷栏图标随背包变化刷新（脏检查，避免每帧 setTexture）
    this.refreshHotbarIfChanged();
  }

  // ── P3：快捷栏图标脏检查（8 格 itemId 串变化时逐格 setTexture）──
  private refreshHotbarIfChanged(): void {
    const session = getGameSession();
    const key = session.inventory.hotbar().join(",");
    if (key === this.lastHotbarKey) return;
    this.lastHotbarKey = key;
    this.updateHotbar();
  }

  // ── T4-3：场景关闭时清理新增监听与精灵缓存 ────
  shutdown(): void {
    const k = this.input.keyboard;
    if (k) {
      for (const n of NUM_KEYS) {
        k.off(`keydown-${n}`);
      }
    }
    this.input.off("pointerdown", this.onPointerDown, this);

    for (const img of this.cropSprites.values()) {
      img.destroy();
    }
    this.cropSprites.clear();
    this.lastSnapshotKey = "";
    for (const img of this.tilledSprites.values()) {
      img.destroy();
    }
    this.tilledSprites.clear();
    this.lastTilledKey = "";

    // P1：停止水波定时器并清空水面精灵缓存（防场景重进叠加）
    this.waterTimer?.destroy();
    this.waterTimer = undefined;
    this.waterImages = [];
    this.waterFrame = false;

    // P3：销毁快捷栏精灵（木质格 + 物品图标 + 选中态），清空数组与脏检查键
    for (const img of this.hotbarSlots) img.destroy();
    this.hotbarSlots = [];
    for (const img of this.hotbarIcons) img.destroy();
    this.hotbarIcons = [];
    this.hotbarSelected?.destroy();
    this.lastHotbarKey = "";

    // P5-A：清空地面图元缓存与季节状态（显示对象由场景显示列表统一回收）
    this.groundTiles = [];
    this.season = "spring";
  }
}
