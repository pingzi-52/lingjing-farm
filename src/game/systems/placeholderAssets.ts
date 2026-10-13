import type Phaser from "phaser";
import { TILE } from "../config";

/**
 * 程序化像素占位素材（⚠️ 占位标记）
 * 所有纹理在运行时用 Canvas2D 绘制生成，无外部资源。
 * P0 美术统一：共享色板 + 1px 描边 + 柔和投影 + 三阶明暗 + 像素密度规范。
 * 后续替换为正式美术时，删除本模块并改用图集加载即可。
 */

// ── P0：统一暖色像素色板 ─────────────────────────
const P = {
  grassLight: "#7fae4f",
  grassMid: "#6d9c43",
  grassDark: "#557f34",
  grassEdge: "#446a27",
  dirtLight: "#ab8258",
  dirtMid: "#8f6741",
  dirtDark: "#6f4f2d",
  dirtEdge: "#553c22",
  woodLight: "#a97145",
  woodMid: "#8b5a33",
  woodDark: "#6a4123",
  leafLight: "#7fb854",
  leafMid: "#5d9a3f",
  leafDark: "#46782e",
  leafEdge: "#345c22",
  rockLight: "#b8bfc4",
  rockMid: "#98a0a7",
  rockDark: "#767e86",
  rockEdge: "#565d64",
  waterLight: "#63a8d8",
  waterMid: "#4a8fc0",
  waterDark: "#3a74a4",
  waterEdge: "#2d5c84",
  skin: "#f0c8a0",
  skinEdge: "#c79a6e",
  cream: "#e8d3b0",
  // P3：HUD 木质面板（比围栏木色更深，16-bit 暖像素风）
  panelDark: "#4a3018",
  panelMid: "#5c3d22",
  panelLight: "#7a5230",
  panelEdge: "#3a2a1a",
  panelGold: "#d9a441",
  gold: "#f5c542",
  goldLight: "#ffdf7e",
  goldDark: "#c79a26",
  white: "#f3f7f9",
  whiteShade: "#dde5ea",
  blanket: "#d98f6a",
  blanketLight: "#e8ab88",
  shadow: "rgba(20, 30, 15, 0.25)",
  outline: "#3a2a1a",
} as const;

function reg(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  const cnv = document.createElement("canvas");
  cnv.width = w;
  cnv.height = h;
  const ctx = cnv.getContext("2d");
  if (!ctx) throw new Error(`无法创建画布上下文: ${key}`);
  draw(ctx);
  const tex = scene.textures.addCanvas(key, cnv);
  if (!tex) throw new Error(`注册画布纹理失败: ${key}`);
  tex.refresh();
}

/** 定式辅助：填色（确定性手工排布，不用随机散布，避免满屏噪点） */
function fill(ctx: CanvasRenderingContext2D, color: string, rects: number[][]): void {
  ctx.fillStyle = color;
  for (const r of rects) ctx.fillRect(r[0], r[1], r[2], r[3]);
}

function shadow(ctx: CanvasRenderingContext2D, rects: number[][]): void {
  fill(ctx, P.shadow, rects);
}

// ── 抛光：确定性小工具 ────────────────────────────

/** 草簇（2 亮叶 + 1 暗根），位置刻意错开以降低 864 格机械重复感 */
function grassTuft(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  fill(ctx, P.grassLight, [[x, y, 1, 2], [x + 1, y + 1, 1, 1]]);
  fill(ctx, P.grassDark, [[x + 1, y + 2, 1, 1]]);
}

/**
 * 木质 bevel（给定内缩边界的矩形）：左上受光 1px / 右下暗边 1px，
 * 让木牌/木格读作凸起实体而非纯色块。
 */
function woodBevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  fill(ctx, P.panelLight, [[x, y, w, 1], [x, y, 1, h]]);
  fill(ctx, P.panelDark, [[x, y + h - 1, w, 1], [x + w - 1, y, 1, h]]);
}

// ── P2：11 种作物特征主色/高光（种子袋与收获图标共用一张表；显式色值避免 11 果撞色）──
const CROP_FEATURE: ReadonlyArray<{ id: string; main: string; hi: string }> = [
  { id: "dew_radish", main: "#f3f7f9", hi: "#dde5ea" }, // 青白萝卜
  { id: "morning_bean", main: "#7fb854", hi: "#5d9a3f" }, // 晨光豆荚
  { id: "starberry", main: "#d9534f", hi: "#f08a83" }, // 星芽莓（红）
  { id: "ember_tomato", main: "#c0392b", hi: "#e86a5c" }, // 火绒番茄（深红）
  { id: "blue_melon", main: "#4a8fc0", hi: "#63a8d8" }, // 蓝湾瓜（水蓝）
  { id: "gold_corn", main: "#f5c542", hi: "#ffdf7e" }, // 金穗玉米（金）
  { id: "amber_pumpkin", main: "#e8843c", hi: "#f2a866" }, // 琥珀南瓜（橙）
  { id: "leaf_cabbage", main: "#6d9c43", hi: "#7fae4f" }, // 丰叶白菜（叶绿）
  { id: "moon_grape", main: "#7a5a8a", hi: "#b295c4" }, // 月纹葡萄（暖紫）
  { id: "snow_flower", main: "#f3f7f9", hi: "#9fc4e0" }, // 雪晶花（白+冰蓝高光）
  { id: "ice_grass", main: "#63a8d8", hi: "#f3f7f9" }, // 冰露草（水蓝+白霜）
];

/** P2：种子袋图标（牛皮纸袋 + 三粒特征色种子，1px 高光） */
function seedBag(ctx: CanvasRenderingContext2D, main: string, hi: string): void {
  fill(ctx, P.woodDark, [[3, 5, 10, 9]]);
  fill(ctx, P.woodMid, [[4, 6, 8, 7]]);
  fill(ctx, P.woodLight, [[4, 5, 8, 2]]);
  fill(ctx, P.woodDark, [[4, 7, 8, 1]]);
  const slots: number[][] = [[5, 9], [8, 9], [11, 10]];
  for (let i = 0; i < 3; i++) {
    const s = slots[i];
    fill(ctx, main, [[s[0], s[1], 2, 3]]);
    fill(ctx, hi, [[s[0], s[1], 1, 2]]);
  }
}

/** P2：收获作物小图标（深描边 + 特征果 + 顶光 + 1px 蒂叶 + 可收获闪光） */
function cropIcon(ctx: CanvasRenderingContext2D, main: string, hi: string): void {
  fill(ctx, P.outline, [[4, 4, 8, 9]]);
  fill(ctx, main, [[5, 5, 6, 7]]);
  fill(ctx, hi, [[5, 5, 6, 1], [5, 6, 1, 5]]);
  fill(ctx, P.leafMid, [[11, 3, 2, 2]]);
  fill(ctx, P.white, [[12, 2, 1, 1]]);
}

// ── 地图块基底 ───────────────────────────────────

/** 一朵小野花（花瓣 + 金/白花心 + 1px 茎） */
function flower(ctx: CanvasRenderingContext2D, x: number, y: number, petal: string): void {
  fill(ctx, P.grassEdge, [[x, y + 1, 1, 2]]);
  fill(ctx, petal, [[x, y, 1, 1]]);
  fill(ctx, P.goldLight, [[x, y, 1, 1]]);
}

/**
 * 草地基底（P4：4 个确定性变体，草簇/野花/碎石布局各不相同，
 * FarmScene 按 (row,col) 选择，消除 864 格机械重复感）
 */
function drawGrass(ctx: CanvasRenderingContext2D, v: number): void {
  ctx.fillStyle = P.grassMid;
  ctx.fillRect(0, 0, TILE, TILE);
  switch (v) {
    case 0:
      grassTuft(ctx, 3, 5);
      grassTuft(ctx, 12, 8);
      grassTuft(ctx, 21, 3);
      grassTuft(ctx, 27, 13);
      grassTuft(ctx, 7, 18);
      grassTuft(ctx, 16, 23);
      grassTuft(ctx, 24, 27);
      flower(ctx, 6, 13, P.white);
      flower(ctx, 25, 19, P.goldLight);
      break;
    case 1:
      // 角落成簇 + 单花 + 碎石
      grassTuft(ctx, 4, 4);
      grassTuft(ctx, 7, 6);
      grassTuft(ctx, 6, 9);
      grassTuft(ctx, 22, 22);
      grassTuft(ctx, 25, 24);
      flower(ctx, 20, 8, P.white);
      fill(ctx, P.rockLight, [[14, 14, 2, 1]]);
      break;
    case 2:
      // 疏 + 三叶草
      grassTuft(ctx, 10, 10);
      grassTuft(ctx, 22, 16);
      grassTuft(ctx, 6, 24);
      // 三叶草（3 个绿点 + 中心）
      fill(ctx, P.leafMid, [[15, 7, 2, 2], [17, 9, 2, 2], [14, 9, 2, 2]]);
      fill(ctx, P.leafLight, [[16, 8, 1, 1]]);
      flower(ctx, 26, 25, P.white);
      break;
    default:
      // 底部偏密
      grassTuft(ctx, 3, 12);
      grassTuft(ctx, 8, 20);
      grassTuft(ctx, 14, 24);
      grassTuft(ctx, 20, 18);
      grassTuft(ctx, 25, 22);
      grassTuft(ctx, 28, 8);
      flower(ctx, 16, 8, P.goldLight);
      fill(ctx, P.rockLight, [[4, 4, 2, 1]]);
      break;
  }
}

/** 兼容旧调用：草地基底（变体 0） */
function grassBase(ctx: CanvasRenderingContext2D): void {
  drawGrass(ctx, 0);
}

/** 耕地基底（P0 精修：四层清晰垄沟——受光浅条 + 暗沟 + 零星碎石，去随机噪点） */
function soilBase(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = P.dirtMid;
  ctx.fillRect(0, 0, TILE, TILE);
  // 四条垄：每条「暗沟 1px（上）+ 受光浅条 1px（垄脊）」，层次清楚
  const furrows = [6, 12, 18, 24];
  for (const fy of furrows) {
    fill(ctx, P.dirtEdge, [[0, fy, TILE, 1]]);
    fill(ctx, P.dirtLight, [[0, fy + 2, TILE, 1]]);
  }
  // 零星小石块（手工 2 粒，位置确定，不铺满）
  fill(ctx, P.rockLight, [[10, 4, 2, 1], [22, 26, 2, 1]]);
  // 顶部受光 1px / 底部暗边 1px
  ctx.fillStyle = P.dirtLight;
  ctx.fillRect(0, 0, TILE, 1);
  ctx.fillStyle = P.dirtEdge;
  ctx.fillRect(0, TILE - 1, TILE, 1);
}

// ── 水面（P4：深度分层 + 固定荷叶 + 双帧水波 + 岸线 dither；动画仅水波高光变）──
function waterBody(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = P.waterMid;
  ctx.fillRect(0, 0, TILE, TILE);
  // 纵向深度分层：顶部受光浅 / 底部深水暗
  fill(ctx, P.waterLight, [[0, 2, TILE, 3]]);
  fill(ctx, P.waterDark, [[0, 28, TILE, 3]]);
  // 固定深水斑 2 处（有序分布，非噪点）
  fill(ctx, P.waterDark, [[18, 12, 8, 4], [6, 18, 6, 4]]);
}

function lilyPads(ctx: CanvasRenderingContext2D): void {
  // 荷叶 2 片（外描边 + 主绿 + 受光；固定不随水波帧动，盖在水波之上）
  fill(ctx, P.leafEdge, [[8, 9, 6, 5]]);
  fill(ctx, P.leafMid, [[9, 10, 4, 3]]);
  fill(ctx, P.leafLight, [[9, 10, 3, 1]]);
  fill(ctx, P.leafEdge, [[20, 20, 5, 4]]);
  fill(ctx, P.leafMid, [[21, 21, 3, 2]]);
  fill(ctx, P.leafLight, [[21, 21, 2, 1]]);
}

function waterShore(ctx: CanvasRenderingContext2D): void {
  // 四边 dither 岸线（棋盘 1px，与周围草地质感衔接）
  ctx.fillStyle = P.waterEdge;
  for (let x = 0; x < TILE; x += 2) {
    ctx.fillRect(x, 0, 1, 1);
    ctx.fillRect(x + 1, TILE - 1, 1, 1);
  }
  for (let y = 0; y < TILE; y += 2) {
    ctx.fillRect(0, y, 1, 1);
    ctx.fillRect(TILE - 1, y + 1, 1, 1);
  }
}

const WATER_RIPPLES: number[][][] = [
  [[4, 8, 6, 1], [14, 8, 4, 1], [24, 8, 5, 1], [9, 20, 5, 1], [19, 20, 6, 1], [12, 14, 2, 1], [26, 26, 2, 1]],
  [[7, 6, 4, 1], [17, 6, 5, 1], [3, 14, 6, 1], [13, 14, 4, 1], [23, 24, 5, 1], [20, 10, 2, 1], [6, 26, 2, 1]],
];

function drawWaterFrame(ctx: CanvasRenderingContext2D, variant: number): void {
  waterBody(ctx);
  fill(ctx, P.waterLight, WATER_RIPPLES[variant]); // 水波高光（两帧不同，制造轻动画）
  lilyPads(ctx); // 荷叶固定，盖在水波之上
  waterShore(ctx); // 岸线最后
}

// ── 玩家两帧（32×28，key 与尺寸约定不变）────────────
function drawPlayerFrame(ctx: CanvasRenderingContext2D, frame: number): void {
  ctx.clearRect(0, 0, TILE, 28);

  // 地面柔和投影
  shadow(ctx, [[9, 25, 14, 2]]);

  // 腿（深棕裤 + 深鞋；两帧摆腿幅度不同）
  const legs = frame === 0 ? [[11, 20, 4, 5], [17, 20, 4, 5]] : [[10, 20, 4, 5], [18, 20, 4, 5]];
  const shoes = frame === 0 ? [[10, 25, 6, 2], [17, 25, 6, 2]] : [[9, 25, 6, 2], [18, 25, 6, 2]];
  fill(ctx, P.woodMid, legs);
  fill(ctx, P.outline, shoes);

  // 身体：米色衬衫 + 暖棕围裙（1px 深描边）
  fill(ctx, P.outline, [[8, 12, 16, 9]]);
  fill(ctx, P.cream, [[9, 13, 14, 7]]);
  fill(ctx, P.woodLight, [[11, 14, 10, 6]]);
  fill(ctx, P.woodDark, [[11, 19, 10, 1]]);

  // 手（肤色，随帧摆动）
  const hands = frame === 0 ? [[7, 14, 2, 5], [23, 14, 2, 5]] : [[6, 12, 2, 5], [24, 16, 2, 5]];
  fill(ctx, P.skin, hands);

  // 头（1px 深描边 + 肤色 + 眼睛）
  fill(ctx, P.outline, [[10, 5, 12, 8]]);
  fill(ctx, P.skin, [[11, 6, 10, 6]]);
  fill(ctx, P.outline, [[13, 9, 1, 1], [18, 9, 1, 1]]);

  // 草帽（帽檐 + 帽冠 + 深色帽带）
  fill(ctx, P.outline, [[8, 2, 16, 5]]);
  fill(ctx, P.gold, [[9, 3, 14, 4]]);
  fill(ctx, P.goldLight, [[9, 3, 14, 1]]);
  fill(ctx, P.woodDark, [[11, 6, 10, 1]]);
}

/** 生成全部占位纹理（幂等：已存在则跳过；P0 无新增 key，短路机制不变） */
export function ensurePlaceholderTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists("tile_grass")) return;

  // ── 地图块（32×32）─────────────────────────────

  reg(scene, "tile_grass", TILE, TILE, grassBase);

  // P4：草地变体 b/c/d（不同草簇/花/碎石布局，FarmScene 按格确定性选用，消除平铺机械感）
  reg(scene, "tile_grass_b", TILE, TILE, (ctx) => drawGrass(ctx, 1));
  reg(scene, "tile_grass_c", TILE, TILE, (ctx) => drawGrass(ctx, 2));
  reg(scene, "tile_grass_d", TILE, TILE, (ctx) => drawGrass(ctx, 3));

  reg(scene, "tile_soil", TILE, TILE, soilBase);

  // P4：树（体积感）——双层树冠 + 根桩 + 顶光斑；b 变体为粉花树（暖粉，同套色板）
  reg(scene, "tile_tree", TILE, TILE, (ctx) => {
    drawGrass(ctx, 0);
    shadow(ctx, [[8, 25, 16, 2]]);
    // 根桩（左右各 1px 深色，落地感）
    fill(ctx, P.woodDark, [[11, 25, 2, 1], [21, 25, 2, 1]]);
    // 树干（3 阶 + 1px 深描边 + 节疤；左上受光）
    fill(ctx, P.woodDark, [[13, 17, 6, 9]]);
    fill(ctx, P.woodMid, [[14, 18, 4, 8]]);
    fill(ctx, P.woodLight, [[14, 18, 1, 8]]);
    fill(ctx, P.woodDark, [[17, 21, 2, 1], [16, 24, 2, 1]]);
    // 树冠：外层深描边（收角圆润）→ 中层绿 → 底层暗部 → 顶层受光斑（左上）
    fill(ctx, P.leafEdge, [
      [5, 4, 22, 14],
      [4, 7, 24, 8],
      [7, 3, 18, 16],
    ]);
    fill(ctx, P.leafMid, [
      [6, 4, 20, 14],
      [5, 7, 22, 8],
      [8, 3, 16, 16],
    ]);
    fill(ctx, P.leafDark, [[6, 14, 20, 6], [8, 17, 16, 4]]);
    // 受光斑（左上偏多，制造体积）
    fill(ctx, P.leafLight, [[8, 5, 10, 6], [11, 7, 4, 2], [7, 4, 4, 2]]);
  });

  reg(scene, "tile_tree_b", TILE, TILE, (ctx) => {
    drawGrass(ctx, 1);
    shadow(ctx, [[8, 25, 16, 2]]);
    fill(ctx, P.woodDark, [[11, 25, 2, 1], [21, 25, 2, 1]]);
    fill(ctx, P.woodDark, [[13, 17, 6, 9]]);
    fill(ctx, P.woodMid, [[14, 18, 4, 8]]);
    fill(ctx, P.woodLight, [[14, 18, 1, 8]]);
    // 粉花树冠（暖粉 3 阶：外描边 + 主粉 + 花点 + 顶光）
    fill(ctx, P.outline, [[5, 4, 22, 14], [4, 7, 24, 8], [7, 3, 18, 16]]);
    fill(ctx, "#e8a4b8", [[6, 4, 20, 14], [5, 7, 22, 8], [8, 3, 16, 16]]);
    fill(ctx, "#c77d95", [[6, 14, 20, 6], [8, 17, 16, 4]]);
    // 粉花点（2×2 花簇 + 1px 花心）
    fill(ctx, "#f3d1dc", [[8, 6, 3, 3], [15, 5, 3, 3], [12, 10, 3, 3], [20, 8, 3, 3]]);
    fill(ctx, P.goldLight, [[9, 7, 1, 1], [16, 6, 1, 1], [13, 11, 1, 1], [21, 9, 1, 1]]);
  });

  // P4：岩石（堆叠体积感）——一块大石 + 一块小石，统一左上受光 / 右下暗部
  reg(scene, "tile_rock", TILE, TILE, (ctx) => {
    drawGrass(ctx, 2);
    shadow(ctx, [[6, 24, 20, 2]]);
    // 大石块（收角圆润 + 1px 深描边 + 三阶明暗 + 裂纹）
    fill(ctx, P.rockEdge, [[6, 9, 18, 14], [5, 11, 20, 11], [8, 8, 14, 15]]);
    fill(ctx, P.rockMid, [[7, 10, 16, 12], [6, 12, 18, 9], [9, 9, 12, 13]]);
    fill(ctx, P.rockLight, [[8, 11, 6, 4], [11, 13, 3, 2]]);
    fill(ctx, P.rockDark, [[8, 19, 14, 4], [16, 14, 1, 5]]);
    // 小石块（叠在右下，制造堆叠层次）
    fill(ctx, P.rockEdge, [[18, 17, 8, 7], [17, 18, 10, 5]]);
    fill(ctx, P.rockMid, [[19, 18, 6, 5]]);
    fill(ctx, P.rockLight, [[19, 18, 3, 2]]);
  });

  reg(scene, "tile_rock_b", TILE, TILE, (ctx) => {
    drawGrass(ctx, 3);
    shadow(ctx, [[7, 23, 18, 2]]);
    // 横向卧石（更扁，区别于 tile_rock）
    fill(ctx, P.rockEdge, [[5, 13, 22, 9], [4, 14, 24, 7], [8, 12, 16, 11]]);
    fill(ctx, P.rockMid, [[6, 14, 20, 7], [5, 15, 22, 5], [9, 13, 14, 9]]);
    fill(ctx, P.rockLight, [[8, 14, 8, 3], [18, 15, 4, 2]]);
    fill(ctx, P.rockDark, [[8, 19, 16, 3], [22, 16, 1, 4]]);
  });

  // P4：篱笆（体积感）——立柱 + 柱帽 + 双横栏 + 金属钉；统一左上受光
  reg(scene, "tile_fence", TILE, TILE, (ctx) => {
    soilBase(ctx);
    shadow(ctx, [[2, 25, 28, 2]]);
    // 两道横栏（顶/中双阶木色 + 木纹 + 钉眼）
    fill(ctx, P.woodDark, [[0, 11, TILE, 4], [0, 19, TILE, 4]]);
    fill(ctx, P.woodMid, [[0, 12, TILE, 2], [0, 20, TILE, 2]]);
    fill(ctx, P.woodLight, [[0, 12, TILE, 1], [0, 20, TILE, 1]]);
    // 两根立柱压栏（柱帽 + 三阶木色 + 受光 + 铆钉）
    fill(ctx, P.woodDark, [[4, 7, 6, 18], [22, 7, 6, 18]]);
    fill(ctx, P.woodMid, [[5, 8, 4, 16], [23, 8, 4, 16]]);
    fill(ctx, P.woodLight, [[5, 8, 1, 16], [23, 8, 1, 16]]);
    // 柱帽（顶部 1px 受光 + 帽沿）
    fill(ctx, P.woodLight, [[4, 7, 6, 1], [22, 7, 6, 1]]);
    fill(ctx, P.woodMid, [[4, 7, 6, 2], [22, 7, 6, 2]]);
    // 金属铆钉（每柱 2 处）
    fill(ctx, P.gold, [[6, 12, 1, 1], [24, 12, 1, 1], [6, 20, 1, 1], [24, 20, 1, 1]]);
    fill(ctx, P.goldLight, [[6, 12, 1, 1], [24, 12, 1, 1]]);
  });

  // P4：床（体积感）——床腿 + 床框 + 枕头 + 垫被层次，统一左上受光
  reg(scene, "tile_bed", TILE, TILE, (ctx) => {
    soilBase(ctx);
    shadow(ctx, [[3, 25, 26, 2]]);
    // 床腿（4 处，落地感）
    fill(ctx, P.woodDark, [[4, 24, 3, 2], [25, 24, 3, 2], [4, 9, 2, 2], [26, 9, 2, 2]]);
    // 木床框（1px 深框 + 三阶木色 + 顶部受光）
    fill(ctx, P.woodDark, [[4, 8, 24, 17]]);
    fill(ctx, P.woodMid, [[5, 9, 22, 15]]);
    fill(ctx, P.woodLight, [[5, 9, 22, 1]]);
    // 枕头（白 + 折痕 + 1px 阴影）
    fill(ctx, P.whiteShade, [[7, 16, 8, 1]]);
    fill(ctx, P.white, [[7, 11, 8, 5]]);
    fill(ctx, P.whiteShade, [[7, 14, 8, 2]]);
    // 暖色被褥（顶部受光 + 褶线 + 左侧高光）
    fill(ctx, P.blanket, [[15, 11, 11, 13]]);
    fill(ctx, P.blanketLight, [[15, 11, 11, 2], [15, 11, 1, 13]]);
    fill(ctx, P.woodDark, [[15, 17, 11, 1]]);
  });

  reg(scene, "tile_water", TILE, TILE, (ctx) => drawWaterFrame(ctx, 0));

  // ── P1：水面双帧（仅水波高光不同，底色/岸线同源）与开垦新翻土纹理 ──
  reg(scene, "tile_water_a", TILE, TILE, (ctx) => drawWaterFrame(ctx, 0));
  reg(scene, "tile_water_b", TILE, TILE, (ctx) => drawWaterFrame(ctx, 1));

  // 新翻土：比原生耕地更深，横向垄线更密更清晰 + 有序翻土块（去随机噪点）
  reg(scene, "tile_tilled", TILE, TILE, (ctx) => {
    ctx.fillStyle = P.dirtDark;
    ctx.fillRect(0, 0, TILE, TILE);
    // 五道垄：每道「暗沟 1px（上）+ 受光浅条 1px（垄脊）」，层次整齐
    for (const fy of [5, 11, 17, 23, 29]) {
      fill(ctx, P.dirtEdge, [[0, fy, TILE, 1]]);
      fill(ctx, P.dirtMid, [[0, fy + 1, TILE, 1]]);
    }
    // 翻土块（浅 1px 顶光 + 深 1px 底影，手工 6 块有序排布，不铺满）
    fill(ctx, P.dirtLight, [[4, 7, 4, 3], [15, 7, 3, 3], [25, 7, 3, 3], [8, 19, 3, 3], [19, 19, 4, 3], [28, 19, 2, 3]]);
    fill(ctx, P.dirtEdge, [[4, 10, 4, 1], [15, 10, 3, 1], [25, 10, 3, 1], [8, 22, 3, 1], [19, 22, 4, 1], [28, 22, 2, 1]]);
  });

  // ── P1：物品图标（16×16；锄头/水壶/种子通用/空槽）──
  reg(scene, "icon_hoe", 16, 16, (ctx) => {
    // 斜置锄头：木柄（对角）+ 深色锄刃
    fill(ctx, P.woodDark, [[5, 2, 7, 1]]);
    fill(ctx, P.woodMid, [[4, 3, 8, 1], [3, 4, 8, 1], [2, 5, 7, 1], [1, 6, 5, 1]]);
    fill(ctx, P.woodLight, [[5, 2, 2, 1]]);
    fill(ctx, P.rockEdge, [[0, 8, 2, 5]]);
    fill(ctx, P.rockMid, [[1, 9, 1, 4], [3, 7, 4, 6], [4, 8, 6, 4], [8, 10, 4, 3], [9, 12, 3, 1]]);
    fill(ctx, P.rockLight, [[4, 8, 2, 2]]);
  });

  reg(scene, "icon_watering_can", 16, 16, (ctx) => {
    // 水壶：罐体（三阶水蓝）+ 提手 + 壶嘴 + 出水珠
    fill(ctx, P.waterEdge, [[4, 4, 8, 9]]);
    fill(ctx, P.waterDark, [[5, 5, 6, 7]]);
    fill(ctx, P.waterMid, [[5, 6, 6, 4]]);
    fill(ctx, P.waterLight, [[5, 5, 6, 1]]);
    // 提手
    fill(ctx, P.waterEdge, [[5, 1, 6, 2]]);
    fill(ctx, P.waterMid, [[6, 2, 4, 1]]);
    // 壶嘴
    fill(ctx, P.waterEdge, [[12, 5, 3, 2]]);
    fill(ctx, P.waterMid, [[13, 6, 2, 1]]);
    // 出水珠
    fill(ctx, P.waterLight, [[14, 8, 1, 1], [15, 10, 1, 1], [14, 12, 1, 1]]);
  });

  reg(scene, "icon_seed", 16, 16, (ctx) => {
    // 种子袋（牛皮纸）+ 三粒彩色种子（暖色系内三色区分，不引入外色）
    fill(ctx, P.woodDark, [[3, 5, 10, 9]]);
    fill(ctx, P.woodMid, [[4, 6, 8, 7]]);
    fill(ctx, P.woodLight, [[4, 5, 8, 2]]);
    fill(ctx, P.woodDark, [[4, 7, 8, 1]]);
    // 种子 ×3（金/叶/土 三色，1px 高光）
    fill(ctx, P.goldDark, [[5, 9, 2, 3], [8, 9, 2, 3], [11, 10, 2, 3]]);
    fill(ctx, P.gold, [[5, 9, 1, 2]]);
    fill(ctx, P.leafDark, [[8, 9, 1, 2]]);
    fill(ctx, P.leafLight, [[8, 9, 1, 1]]);
    fill(ctx, P.dirtLight, [[11, 10, 1, 2]]);
    fill(ctx, P.dirtMid, [[11, 11, 1, 1]]);
  });

  reg(scene, "icon_empty", 16, 16, (ctx) => {
    // 空槽：深底 + 1px 内阴影 + 浅灰叉号
    fill(ctx, P.outline, [[0, 0, 16, 16]]);
    fill(ctx, P.dirtEdge, [[1, 1, 14, 14]]);
    fill(ctx, "rgba(0, 0, 0, 0.25)", [[2, 2, 12, 1]]);
    fill(ctx, P.rockDark, [[5, 5, 6, 6]]);
    fill(ctx, P.rockMid, [[6, 6, 4, 4]]);
    fill(ctx, P.rockLight, [[6, 6, 2, 1]]);
  });

  // ── 玩家（32×28，key 不变）─────────────────────
  reg(scene, "player_0", TILE, 28, (ctx) => drawPlayerFrame(ctx, 0));
  reg(scene, "player_1", TILE, 28, (ctx) => drawPlayerFrame(ctx, 1));

  // ── HUD 金币图标（16×16：金币堆 + 闪光）────────
  reg(scene, "icon_gold", 16, 16, (ctx) => {
    // 垫底两枚暗金
    fill(ctx, P.goldDark, [[2, 9, 8, 5], [9, 10, 6, 4]]);
    // 主币（深描边 + 三阶 + 币沿）
    fill(ctx, P.outline, [[4, 2, 9, 8]]);
    fill(ctx, P.gold, [[5, 3, 7, 6]]);
    fill(ctx, P.goldLight, [[5, 3, 7, 1], [5, 4, 1, 4]]);
    fill(ctx, P.goldDark, [[5, 8, 7, 1], [11, 4, 1, 4]]);
    // 闪光
    fill(ctx, P.white, [[12, 1, 1, 1], [2, 5, 1, 1]]);
  });

  // ── 作物四阶段（32×32 透明底，叠在耕地层之上）──

  // 种子期：土堆 + 三粒种子（微高光）
  reg(scene, "crop_seed", TILE, TILE, (ctx) => {
    shadow(ctx, [[11, 24, 10, 2]]);
    fill(ctx, P.dirtDark, [[13, 22, 6, 2]]);
    fill(ctx, P.outline, [[12, 19, 2, 2], [15, 18, 2, 2], [18, 19, 2, 2]]);
    fill(ctx, P.dirtMid, [[12, 19, 2, 1], [15, 18, 2, 1], [18, 19, 2, 1]]);
    fill(ctx, P.grassEdge, [[9, 24, 2, 1], [22, 24, 2, 1]]);
  });

  // 幼苗期：短茎 + 左右两片叶（亮叶 / 中叶）+ 顶芽
  reg(scene, "crop_sprout", TILE, TILE, (ctx) => {
    shadow(ctx, [[13, 24, 6, 2]]);
    fill(ctx, P.leafEdge, [[14, 15, 4, 9]]);
    fill(ctx, P.leafDark, [[15, 16, 2, 8]]);
    fill(ctx, P.leafLight, [[15, 15, 2, 1]]);
    fill(ctx, P.leafMid, [[8, 17, 6, 3]]);
    fill(ctx, P.leafEdge, [[8, 19, 6, 1]]);
    fill(ctx, P.leafLight, [[18, 15, 6, 3]]);
    fill(ctx, P.leafEdge, [[18, 17, 6, 1]]);
  });

  // 生长期：高茎 + 四片叶 + 顶部嫩芽
  reg(scene, "crop_young", TILE, TILE, (ctx) => {
    shadow(ctx, [[11, 25, 10, 2]]);
    fill(ctx, P.leafEdge, [[14, 9, 4, 16]]);
    fill(ctx, P.leafDark, [[15, 10, 2, 15]]);
    fill(ctx, P.leafMid, [[7, 13, 7, 3]]);
    fill(ctx, P.leafEdge, [[7, 15, 7, 1]]);
    fill(ctx, P.leafLight, [[18, 13, 7, 3]]);
    fill(ctx, P.leafEdge, [[18, 15, 7, 1]]);
    fill(ctx, P.leafLight, [[7, 18, 7, 3]]);
    fill(ctx, P.leafEdge, [[7, 20, 7, 1]]);
    fill(ctx, P.leafMid, [[18, 18, 7, 3]]);
    fill(ctx, P.leafEdge, [[18, 20, 7, 1]]);
    fill(ctx, P.leafLight, [[13, 8, 6, 3]]);
    fill(ctx, P.leafEdge, [[13, 10, 6, 1]]);
  });

  // 成熟期：圆润株丛 + 三颗果实（金 + 高光）+ 白色闪光（可收获提示）
  reg(scene, "crop_mature", TILE, TILE, (ctx) => {
    shadow(ctx, [[9, 25, 14, 2]]);
    // 株丛（收角 + 1px 深描边 + 顶光 / 底暗）
    fill(ctx, P.leafEdge, [[8, 9, 16, 12], [7, 11, 18, 8], [10, 8, 12, 14]]);
    fill(ctx, P.leafMid, [[9, 10, 14, 10], [8, 12, 16, 6], [11, 9, 10, 12]]);
    fill(ctx, P.leafLight, [[10, 10, 6, 4]]);
    fill(ctx, P.leafDark, [[9, 17, 14, 3]]);
    // 果实 ×3
    fill(ctx, P.goldDark, [[11, 13, 4, 4], [17, 15, 4, 4], [14, 18, 4, 4]]);
    fill(ctx, P.gold, [[11, 13, 3, 3], [17, 15, 3, 3], [14, 18, 3, 3]]);
    fill(ctx, P.goldLight, [[11, 13, 2, 1], [17, 15, 2, 1], [14, 18, 2, 1]]);
    // 可收获闪光
    fill(ctx, P.white, [[8, 7, 1, 1], [23, 9, 1, 1], [21, 6, 1, 1]]);
  });

  // ── P2：按 cropId 区分的成熟期纹理（种子/幼苗/生长共用通用阶段，仅成熟期分化）──
  // 果实三连（每颗 1px 深描边 + 主色 + 顶光，小尺寸下与株丛可分）
  const drawFruits = (ctx: CanvasRenderingContext2D, main: string, hi: string) => {
    const fruit: number[][] = [[11, 13], [17, 15], [14, 18]];
    for (const f of fruit) {
      fill(ctx, P.outline, [[f[0] - 1, f[1], 1, 5], [f[0] + 4, f[1], 1, 5], [f[0], f[1] - 1, 5, 1], [f[0], f[1] + 4, 5, 1]]);
      fill(ctx, main, [[f[0], f[1], 4, 4]]);
      fill(ctx, hi, [[f[0], f[1], 3, 1]]);
    }
  };

  const fruitBush = (ctx: CanvasRenderingContext2D, main: string, hi: string) => {
    shadow(ctx, [[9, 25, 14, 2]]);
    // 株丛（收角 + 1px 深描边 + 顶光 / 底暗）
    fill(ctx, P.leafEdge, [[8, 9, 16, 12], [7, 11, 18, 8], [10, 8, 12, 14]]);
    fill(ctx, P.leafMid, [[9, 10, 14, 10], [8, 12, 16, 6], [11, 9, 10, 12]]);
    fill(ctx, P.leafLight, [[10, 10, 6, 4]]);
    fill(ctx, P.leafDark, [[9, 17, 14, 3]]);
    // 特征果实 ×3（带深描边）
    drawFruits(ctx, main, hi);
    // 可收获闪光
    fill(ctx, P.white, [[8, 7, 1, 1], [23, 9, 1, 1], [21, 6, 1, 1]]);
  };

  for (const f of CROP_FEATURE) {
    reg(scene, `crop_${f.id}_mature`, TILE, TILE, (ctx) => fruitBush(ctx, f.main, f.hi));
    reg(scene, `icon_seed_${f.id}`, 16, 16, (ctx) => seedBag(ctx, f.main, f.hi));
    reg(scene, `icon_crop_${f.id}`, 16, 16, (ctx) => cropIcon(ctx, f.main, f.hi));
  }

  // ── P3：HUD 木质面板（真实木纹：外投影 + bevel 凸起 + 四角金属件 + 横向纹理 + 内侧高光）──
  // 用 2px 外投影边距，画布 154×34；FarmScene 定位时需含投影（origin 不变，尺寸 +4）
  reg(scene, "panel_wide", 154, 34, (ctx) => {
    const bx = 2; // 投影边距
    const by = 2;
    const W = 150;
    const H = 30;
    // 落影（右下偏移，柔和 2 阶）
    fill(ctx, "rgba(0, 0, 0, 0.28)", [[bx + 1, by + 1, W, H]]);
    fill(ctx, "rgba(0, 0, 0, 0.18)", [[bx, by, W, H]]);
    // 木面基底
    ctx.fillStyle = P.panelMid;
    ctx.fillRect(bx, by, W, H);
    // bevel（左上受光 / 右下暗边，读作凸起实体）
    woodBevel(ctx, bx, by, W, H);
    // 横向木纹（确定性 3 道 + 1 处节疤，节制不密）
    fill(ctx, P.panelDark, [[bx + 2, by + 9, W - 4, 1], [bx + 2, by + 19, W - 4, 1], [bx + 2, by + 24, W - 4, 1]]);
    fill(ctx, P.panelLight, [[bx + 2, by + 4, W - 4, 1]]);
    // 节疤（1px 小环）
    fill(ctx, P.panelDark, [[bx + 120, by + 13, 3, 3]]);
    fill(ctx, P.panelMid, [[bx + 121, by + 14, 1, 1]]);
    // 内侧金边（沿 bevel 内侧一圈）
    fill(ctx, P.panelGold, [
      [bx + 1, by + 1, W - 2, 1],
      [bx + 1, by + H - 1, W - 2, 1],
      [bx + 1, by + 1, 1, H - 2],
      [bx + W - 2, by + 1, 1, H - 2],
    ]);
    // 四角金属件（2×2 铆钉 + 高光点）
    const corners: number[][] = [
      [bx, by],
      [bx + W - 2, by],
      [bx, by + H - 2],
      [bx + W - 2, by + H - 2],
    ];
    for (const c of corners) {
      fill(ctx, P.panelEdge, [[c[0], c[1], 3, 3]]);
      fill(ctx, P.panelGold, [[c[0] + 1, c[1] + 1, 1, 1]]);
    }
  });

  // ── P3：快捷栏格（凹进木槽：外深描边 + 顶左暗/底右亮的内凹 bevel）与选中态（凸起金框 + 底影）──
  reg(scene, "panel_slot", 16, 16, (ctx) => {
    // 底影（1px，让木格浮于底栏）
    fill(ctx, "rgba(0, 0, 0, 0.30)", [[1, 15, 15, 1]]);
    // 外描边（深）
    ctx.fillStyle = P.panelEdge;
    ctx.fillRect(0, 0, 16, 16);
    // 木面（中棕）
    ctx.fillStyle = P.panelMid;
    ctx.fillRect(1, 1, 14, 14);
    // 内凹 bevel：顶/左暗（陷进去的阴影），底/右亮（受光边缘）→ 读作凹槽
    fill(ctx, P.panelDark, [[1, 1, 14, 1], [1, 1, 1, 14]]);
    fill(ctx, P.panelLight, [[1, 14, 14, 1], [14, 1, 1, 14]]);
    // 槽底再暗 1px（物品放进去的空间感）
    fill(ctx, P.panelDark, [[3, 3, 10, 10]]);
  });

  reg(scene, "panel_slot_selected", 16, 16, (ctx) => {
    // 凸起金框 + 底影（压在选中格上，读作被点亮的突出状态）
    fill(ctx, "rgba(0, 0, 0, 0.30)", [[1, 15, 15, 1]]);
    // 金框（四边 1px 金 + 角 2px 高光）
    fill(ctx, P.gold, [[0, 0, 16, 1], [0, 15, 16, 1], [0, 0, 1, 16], [15, 0, 1, 16]]);
    fill(ctx, P.goldLight, [[0, 0, 2, 2], [14, 0, 2, 2], [0, 14, 2, 2], [14, 14, 2, 2]]);
    // 亮木底（比常规格更亮，制造“被点亮”感）
    ctx.fillStyle = P.panelLight;
    ctx.fillRect(2, 2, 12, 12);
    fill(ctx, P.panelMid, [[3, 13, 10, 1]]);
  });
}
