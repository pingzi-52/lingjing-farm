# 地表与 HUD 美术方向研究 · 2026-10-21

## 结论与最小切口

建议先改善草地/道路材质与 HUD 的视觉层次，保持地图、碰撞、种植、任务、输入与存档合同不变。最小可行切口是新增一个只读地表选图工具，同时接入 FarmEnvironment 与 FarmSoilSurface；道路在现有三处绘制入口选择同一套新图。HUD 先共享颜色、字级、面板边框与深度常量，继续由原场景更新数据，不重建 HUD 状态系统。

不能只替换 FarmEnvironment 的草地：预制土壤透明边缘使用 FarmSoilSurface 自己创建的底图，会露出旧草色；标题背景也直接引用 Cainos 图集。不能直接覆盖全局 TX Tileset Grass 纹理键：它还包含展示页使用的 pavement/flower 帧，且目前多处具有不同的生命周期与回退路径。

这份研究只新增本文档。未修改代码、素材或其他未提交内容，未提交推送。

## 已核实的现状与假设

- 草地基础图是 Cainos `TX Tileset Grass 0/1/2`，均为原生 32×32；FarmEnvironment 的变化公式是 `(row * 13 + col * 7) % 3`。逻辑地图中的 `grass/tree/rock/fence` 都先铺同种草地图，再叠加物件。
- FarmEnvironment 的四季 tint 为春 `ffffff`、夏 `f5efcc`、秋 `e5b781`、冬 `c8d6df`，并统一作用于它拥有的地面、树、石、围栏和草花。春季 tint 是白色，不能把春季橄榄黄全部归因于季节着色。
- 道路仍用 v1 的高分辨率 PNG 裁切帧，帧宽约 277–309、高约 263–307，最终压缩到 32×32。实际使用九帧 `nw/n/ne/w/center/e/sw/s/se`；额外 center-a/b/c 未被当前道路入口使用。高频细节缩到 32px 是噪点的合理来源，但“视觉改善程度”仍需同机位对照判断。
- FarmAtmosphere 在世界之上叠加早晚暖色、夜间蓝色与天气阴影，深度为 90/91；HUD 在 98 以上，所以 HUD 当前不会随夜色被染暗。草地调色必须分别观察中午晴天、早晚、雨天、夜间，不能只用带暖光的清晨截图决定原图色相。
- 游戏启用 `pixelArt: true`（`src/game/createGame.ts`），户外相机实际 zoom=1。生成素材即使原图较大，也必须在最终 32px 格与 512×384 游戏画面检查，不能仅凭大图精细程度验收。
- 农场采用左上木纹面板、右上物品面板与下方快捷栏；室内和探索场景采用横向纯色面板，颜色、文字密度、文字缩放上限分别定义。这里确认的是实现不一致；玩家是否觉得信息拥挤或阅读吃力尚未量测。

## 参考实现与可复用工具

1. `src/game/systems/cropVisual.ts` / `tests/crop-visual.test.ts`：纯 `HasVisualFrame` 回调检查纹理/帧，返回 texture/frame/尺寸/锚点；新原创 → 具体旧图 → 通用占位的明确回退。适合作为地表选图工具的模式，避免把 Phaser 引入纯测试。
2. `src/game/systems/farmSoilSurface.ts` / `tests/farm-soil-surface.test.ts`：纯布局计划与 Phaser 显示对象同文件分层；完整帧集合通过才启用；不读写地图或存档；季节仅更新底图，销毁时清理自有图元。该实现决定草地必须同步接入的边界。
3. `src/game/systems/explorationDecorPlan.ts` → `explorationDecor.ts` / `tests/exploration-decor.test.ts` / `exploration-art.test.js`：只读计划、独立帧缺失回退、预加载与渲染分离、模块显式 destroy；素材 JSON 与实际 PNG 尺寸对应。适合新地表资产与局部 HUD 视图的资源管理。

可直接复用：`TILE=32`、`HasVisualFrame`、`grassKey(season, variant)` 占位草地、`FarmEnvironment.objectDepth`、`passagePathCells` 的道路格选择、`planSoilSurface`/`soilQuarterFrames` 的土壤边界规则、现有节点/采集提示、`lightingForMinute`、现有 `getItemVisual` 图标。未发现已有通用 HUD 组件；`src/ui/index.ts` 仅有未实际接入的 HudSnapshot 类型，不能当作可用实现。

## 全部入口清单

以下是 `rg` 在当前 src 内的完整直接引用及主要调用关系；文档/截图不是运行入口。

| 资源/模块 | 文件入口 | 职责与本轮关系 |
| --- | --- | --- |
| TX Tileset Grass | `src/game/systems/farmEnvironment.ts` | preload 全图集；render 创建每格草底；applySeason 统一 tint。主切口。 |
| TX Tileset Grass | `src/game/systems/farmSoilSurface.ts` | 构造时创建预制田地草底 depth0.5；applySeason 同步 tint。必须一起改。 |
| TX Tileset Grass | `src/game/scenes/TitleScene.ts` | preload FarmEnvironment；create 中直接铺三变体背景，另 new FarmEnvironment 创建组合树帧。若主视觉统一，标题草地也需使用同一选择工具。 |
| TX Tileset Grass | `src/showcase/CainosScene.ts` | 独立素材展示页，直接绘草地、pavement、flower，自己预加载 Cainos。保留原样，避免替换全局旧 atlas。 |
| farm-home-path | `src/game/scenes/FarmScene.ts` | preload v1 atlas；create 农舍门前两列道路，选 w/e。接入新道路选图但保留坐标与尺寸。 |
| farm-home-path | `src/game/scenes/ExplorationScene.ts` | preload v1 atlas；renderPaths 从 worldMap.paths 邻接选九帧。保持邻接算法与道路格集合。 |
| farm-home-path | `src/game/systems/areaPassage.ts` | renderPaths 画跨区路口道路，含 reserved 与旧田隐藏规则；拥有图元并 destroy。保持 passagePathCells、syncCultivated 与过图逻辑。 |
| FarmEnvironment | `src/game/scenes/FarmScene.ts` | preload、实例、render、renderDetails、setCultivated、applySeason；同时使用 objectDepth 放农舍/提灯/玩家。 |
| FarmEnvironment | `src/game/scenes/ExplorationScene.ts` | preload、实例、逐格 render、一次 applySeason；objectDepth 放居民。森林/小镇共用同一场景实现。 |
| FarmEnvironment | `src/game/scenes/TitleScene.ts` | preload 与构造；背景草地不经 render。 |
| FarmEnvironment | `src/game/scenes/HomeScene.ts` | 仅 preload，复用 Cainos 家具；室内地板是 home-floor，不应误改成户外草地。 |
| FarmEnvironment | `src/game/systems/merchantResident.ts` | 仅 objectDepth，保持行为。 |
| FarmEnvironment | `src/game/systems/explorationDecor.ts` | 仅 objectDepth，保持最新建筑/地标成果。 |
| FarmEnvironment | `src/game/systems/areaPassage.ts` | 仅 objectDepth 放路牌。 |
| HUD | `src/game/scenes/FarmScene.ts` | create 约333–418行；buildHotbar 约479行；updateHud 约812行；update 的 guide/context；保存失败提示/浮动反馈。 |
| HUD | `src/game/scenes/ExplorationScene.ts` | create 上方44px面板+日期/材料两行；refreshState 更新；底部上下文/控制说明。 |
| HUD | `src/game/scenes/HomeScene.ts` | create 约125行横向面板、状态和底部控制；refreshHud 更新日期/体力/金币。 |
| HUD 纹理 | `src/game/systems/placeholderAssets.ts` | 生成 panel_wide、快捷栏格/选中态等木质资产；改共享纹理会影响其全部使用者，宜新增样式而非覆盖旧键。 |
| HUD 图标 | `src/game/systems/itemVisual.ts` | gold/选中物品/快捷栏图标映射；保持现有 atlas 与缓存。 |
| UI 样式 | `src/styles/main.css`、`src/styles/audio-settings.css` | DOM暂停菜单，不影响 Phaser HUD 文本；若只改canvas HUD，不需顺带重做所有菜单。 |
| HUD 预留类型 | `src/ui/index.ts` | 仅 HudSnapshot，无现成渲染器或状态桥。 |

## 建议的地表接口与接入次序

新建 display-only 工具（名称可为 `groundVisual.ts`），提供幂等 preload 与纯选图；返回值沿用 texture/frame/32×32尺寸/锚点合同。纹理使用新键，旧 Cainos 与 v1 道路不删除、不改写。

草地建议有少量低对比变体，色相偏更清晰的草绿，避免棋盘亮暗或每格中央高亮。优先生成可平铺低频原图/变体，记录原字节和来源，在静态 atlas 中明确裁切。按最终32px检查横纵接缝；不要依赖“生成提示里写了无缝”来宣称无缝。选变体公式必须在 FarmEnvironment 与 FarmSoilSurface 完全相同，且不随天气/季节改变位置。

道路优先保持现有九帧合同，以低噪点的暖土色主体、清晰但轻的草土边界替换图像。相邻边需要一致颜色与alpha结构；角帧/边帧/中心必须一起验证。场景仍由现有邻接算法决定帧，不在本轮重写道路拓扑。农场门前只用w/e，需特别核对其竖向拼接。

推荐先完整检查新 atlas 全部必需帧，完整则启用，否则整套回退旧图。允许每帧回退虽然简单，但同一条路中混合新旧色板更容易产生接缝；不应让半套损坏新图压过完整旧图。草地回退顺序可为新三变体→完整Cainos三变体→已注册的 grassKey 季节占位；原图缺帧时也必须检查，不能只测 textures.exists。

预加载可以放在现有 FarmEnvironment.preload，确保 farm/forest/town/title 在首次使用前都排入加载；道路预加载可归同一工具，由 FarmScene/ExplorationScene 现有 preload 调用。不要假设先访问 farm 才能使用新图。BootScene 继续负责既有原创人物/图标和占位纹理，无需改启动/存档流程。

## 土壤、季节、光照与选框兼容边界

- 保留土壤 atlas、四分块邻接、raw/dry/wet区分。预制土壤 depth0.5 的草底必须来自同一新草地图；动态开垦草地已由环境草底提供，不应重复造一层不一致的旧底图。
- 深度继续为：环境草0、预制土壤草底0.5、水约0.6/1.2、道路/原始田1、草花2、采集焦点2.9、资源3、耕地4、作物5、目标选框6、脚底排序物件10+、大气90/91、HUD98+。不通过抬高草/道路深度遮住耕地或选框。
- 土壤与道路的透明边缘应露出同一草底；缺新图回退必须在首次创建与四季 applySeason 中一致，不能构造选新图、换季又回旧图。
- 第一版可沿用现有四季 tint，避免同时重做所有树/草/地表季节规则；若新草图偏绿后秋冬效果不足，再单独比较草地与树木 tint，不能靠调全世界tint解决一个地面问题。
- 现有道路没有独立四季更新。新增四季道路若需要热切换，会增加三入口对象缓存/更新职责，不是本轮最小切口；建议首版保留季节中性道路，交由同一大气层融入时段。
- 保留黄色选框的TILE-2尺寸、位置、输入判断及depth6；在新草、新干湿土、道路上分别检查描边可见性，不把降低道路噪点与更改交互目标格混在一起。

## HUD 方向与边界

建议使用统一的深棕底、细浅边、米白主文字、低对比次文字与有限金色强调，减少木纹细节与多层厚边的竞争。日期/时间/体力属于主信息，目标与场景上下文属于次级；保存失败仍保留高优先级可见性。只改视觉表现与有限布局，不删信息、不新增玩法。

可新增一个小型 HUD 视觉辅助模块，提供文字样式、面板样式、深度与色板，纯配置与 Phaser 构造方法分开。不要为三个场景引入 React、事件总线或新的 GameSession 缓存。FarmScene 保留其8格快捷栏、当前物品/选中态和既有更新键；HomeScene/ExplorationScene保留现有状态刷新与暂停条件。

现有窄左上信息区用 `setScale` 把长金币/日期压进154px；探索横向文本则按480px缩放，室内456px。视觉重排需用高金币、长作物名、跨季目标、多行引导与保存失败文本验收。不要只检查新档500金币的短文案。保持所有HUD固定屏幕，尺寸约512×384，避免覆盖中央行动区或把任务面板扩展到道路与资源上。

## 生命周期与缺件回退

- 纹理由 Phaser 全局 TextureManager 缓存；检查 exists/has 后再注册，重复切区不得移除仍被别的场景使用的纹理。
- FarmEnvironment 当前图元由场景DisplayList清理，不自行destroy；FarmSoilSurface、AreaPassage、ExplorationDecor则显式destroy。新辅助工具宜无长期图元持有；若新增renderer，必须接入现有shutdown且destroy可安全重复。
- HUD 常量/构造辅助不应新增键盘监听器、定时器或存储。保留场景SHUTDOWN、菜单pause/focus、visibilitychange与音频合同。
- 新图缺失/加载失败不是白屏条件。农场逻辑地面/占位纹理继续存在；选图失败不可隐藏基础格后留下空白。特别检查 FarmEnvironment 当前ready把全部Cainos组件捆绑的规则：本轮新增草图不应成为使原树/围栏整包失效的新硬依赖。

## 测试与验收建议

测试环境是 Vitest node，无DOM测试依赖。沿用 `describe/it/expect` 与表驱动枚举；纯工具通过模拟HasVisualFrame验证完整新图、缺单帧、完整旧图、占位图、四季与稳定变体。不要写只断言实现常量的测试来代替实际回退合同。

- 选图：所有三草变体/九道路帧存在时采用新图；缺任意必需帧正确回退；不会返回已知缺失texture/frame；相同坐标在不同创建入口一致。
- 地图/状态：继续运行soil-surface、farm-details、area-connections、area-map、forest-clearings与exploration-decor，确保道路保留旧田避让、土壤邻接不变、地图输入不变。
- 素材：沿用 `tests/exploration-art.test.js` / `art-atlas.test.js` 的PNG头读取与JSON frame bounds；必要的接缝/透明边缘用实际像素分析，记录结果，不仅检查PNG声明有alpha通道。
- HUD：主要用正式构建浏览器截图检验文本完整性、对比、遮挡与小尺寸。覆盖农场/森林/镇/屋内，晴日中午、清晨、雨天、夜晚，干湿地、成熟作物与选框；最大金币/最长物品名和目标说明。
- 回归：真实移动、选物/用工具、四向过图、进屋、睡觉、重复切区、打开I/Q/L/K/M与Esc恢复；保存失败提示保持可读。无需因美术改动新增领域规则测试，但完整既有测试与build仍要通过。

当前研究没有测量性能、读取或修改个人存档，也没有声称新纹理已经改善效果。下一步应以同机位基线与一版新图小尺寸对照确认色板，再接入上述最小切口。
