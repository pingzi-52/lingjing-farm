# 小屋家具补全研究（2026-10-23）

## Reference implementations

- `src/game/entities/Player.ts` + `src/game/systems/farmerVisual.ts`：物理代理与视觉分离。`player_0/player_1` 在 `placeholderAssets.ts` 注册为 32×28；Player 没有缩小 body，因此默认碰撞矩形为中心左右 16、上下 14。原创角色显示 32×40，脚底固定为代理 y+16，POST_UPDATE 同步最终物理位置；深度为 `10 + feetY / 10000`。
- `src/game/systems/explorationDecor.ts` + `explorationDecorPlan.ts`：纯计划与 Phaser 实例分离；图片原点 `(0.5,1)`、每个纹理与帧独立校验，缺素材时回退旧图或跳过装饰。类拥有 display objects，统一 destroy。注意此处只装饰现有地图碰撞，不能直接复制其“无新碰撞”假设到室内。
- `src/game/systems/cropVisual.ts`：通过 `HasVisualFrame` 回调做纯函数选图；测试能明确覆盖 atlas 缺失和单帧缺失。`tests/exploration-decor.test.ts` 用确定性、输入不变与通道约束测试布局，`tests/farmer-visual.test.ts` 使用简短 display mock 验证同步与销毁。

## Conventions and reusable utilities

- `FarmEnvironment.objectDepth(feetY)` 可直接复用，避免家具全在 depth=0 导致玩家永远覆盖书架/桌面的现象。地毯、墙画、窗等低层装饰应固定低深度；桌、椅、柜、盆栽按落地点排序。
- `FarmVisual` / `HasVisualFrame` 是可导入的类型；新家具计划宜保持纯 TS、只读配置，渲染器负责 Phaser 对象和静态碰撞。无需新增领域或存档结构。
- 沿用 `import.meta.env.BASE_URL` 与 `textures.exists` 的幂等 preload。不需要网络或新依赖，无 IAC。
- 实体图片 `setDisplaySize` 后必须 `refreshBody()`；若只让底部占地碰撞，应显式设置 body 尺寸及位置，再检查实际 world body。不能只调整显示大小就假设 body 自动匹配。脚底原点更改后也需要 refresh。

## Existing local art

- `public/farm-assets/cainos-basic/TX Props.json` 已核实：Chest 32×31、Barrel 28×36、Pot A 21×34、Pot B 25×27、Pot C 21×32，适合储物与陶盆。Stone Bench S 56×41、W/E 27×61 是石凳，不宜伪装田园木椅；此 atlas 没有木桌、木椅、书架或地毯帧。
- `TX Plant` 可复用花草配陶盆，务必先校验帧；不要以户外整棵树充室内植株。
- `original-addons/v7/forage-v1.json` 的 `workbench`、`farm_lantern` 已由 `preloadFarmArt` 加载。两者是 trimmed atlas：workbench 的 sourceSize=492×492，实际 frame=492×359、y 偏移 66；灯 sourceSize=511×511、frame=226×511、x 偏移142。按 realWidth/realHeight 缩放可能留下明显逻辑透明边，不能把 sourceSize 当实体碰撞尺寸。
- 旧床 `home-bed` 是未裁切 PNG，通过仅注册一次的 `trimmed` 帧裁切；床和地板均有生成来源记录在 `original-addons/v2/SOURCE.md`。本轮将新增独立 `home-furniture-v1` atlas，帧为 table/chair/bookcase/sideboard/plant/lamp/rug/wall-shelf；不得引用不存在的 Cainos 帧名。

## Layout and reachability constraints

现有 world bounds `(96,80,320,272)`；默认 body 使可达中心范围为 x=112…400、y=94…338。床矩形 x=328…372,y=120…200；箱实机静态体为 x=140…180,y=98…130（40×32）。`TX Props Chest` atlas 自带 pivot，使图片实际 originY=1，不能假定默认居中原点；保留原点与原碰撞，箱底为130，深度采用 `FarmEnvironment.objectDepth(130)`，标签移至 y=88。出生 `(256,304)`。门交互 x=224…288,y≥290，向下离开要求中心 x=228…284,y≥320。

建议采用下列“中心坐标、最大显示尺寸”，再由 renderer 为柜子等选底部占地；它们是设计参考而非强制最终坐标：

| 家具 | 中心/尺寸 | 布置约束 |
|---|---|---|
| 厨房矮柜 | (272,122), 64×32 | 北墙中央；右边≤304，床左侧由南面 approach |
| 书架 | (210,114), 28×44 | 北墙、木箱右侧；不要求从它与箱之间穿过，统一从南侧接近 |
| 木桌 | (178,244), 52×32 | 右边≤204，不侵占门中轴 |
| 木椅 | (176,283), 24×24 | 与桌面间可紧凑，但不围死可进入空间 |
| 床头柜/灯 | (391,150), 24×28 | 床东侧贴墙，不占床下方路径 |
| 盆栽 | (386,260), 24×32 | 东南角，离门通道≥64 |
| 地毯 | (268,264), 72×48 | 纯低层装饰，无碰撞 |
| 挂画 | (302,97), 22×18 | 靠上墙，无碰撞；避开床与箱文字 |

- 保留中心 x=224…288、y=188…338 的通道，所有新增 solid 不侵入；至少 40 像素宽的实际净通道，避免 32 像素 body 挤不进去。
- 这里的 40 像素是实体边缘之间的宽度，膨胀后玩家中心仍有 8 像素余量；32 像素整宽只留下零余量，不作为可用通道。视觉脚底 `player.y+16` 比物理底 `player.y+14` 低 2 像素，层级应与视觉脚底比较，碰撞应仍按实际 body 计算。
- 从出生沿中轴到 `(256,190)`，再通向床左侧 `(306,190)` 和箱南侧 `(176,178)`。床交互范围 `|x-350|≤64, |y-160|≤72`；箱 `|x-160|≤56, |y-130|≤52`。上述两个站位均满足交互条件且避开旧实体。
- 用碰撞矩形向外膨胀 half-body `(16,14)` 后测试中心路径（不能只查家具 AABB 不相交）。测试出生未被包围，并验证出生能连接床 approach、箱 approach、门 exit；可用小步长栅格 flood fill 或明确路径线段检查。
- 家具显示与碰撞不应侵入 `(256,304)`；门 x=224…288,y≥290 区域保持全空。墙面图像可以覆盖上墙但不能遮 HUD(status y=63, depth99)。

## Failure / lifecycle coverage

1. 新 atlas 全缺、单帧缺、旧回退也缺：不显示 missing-texture 方块；核心床/箱功能不应依赖可选装饰素材。旧 HomeScene 箱子直接 `textures.get('TX Props')` 并只检查 Chest/Crate Small，TX Props 全缺或两个帧全缺是现有脆弱点，新增装饰不要复制它。
2. HomeScene 反复进入：不重复注册全局纹理/trimmed frame，不累积 static bodies、colliders、tweens 或 display objects。全局 textures 由 TextureManager 拥有，不应在装饰 destroy 时删除；销毁只处理本实例对象。
3. 缺 `home-bed` 保留 `tile_bed`，缺 `home-floor` 保留 tile_soil；新家具回退不能改变碰撞位置、睡觉范围、箱位置或出口条件。
4. 玩家从家具上方和下方通过时分别被遮挡/覆盖；床箱在改用落地点排序后应仍可识别。FarmerVisual 缺失时代理固定 depth=10，与 y 排序家具存在差异，必须人工检视或局部处理，避免为补家具无谓修改全局玩家行为。
5. 静态体不能因 PNG 透明边或默认 atlas pivot 放大；用浏览器实际移动验证四侧碰撞、斜角绕行与门自动离开。纯计划单测不替代 Phaser runtime 检查。

## Scope / risks

本轮优先固定布置、木质田园家具与通行体验，不引入购买/摆放/家具存档。小屋有限的 320×272 空间使大型桌椅和书架很容易形成窄缝；宁可精简独立阻挡体，也不要只为视觉填满房间。现有睡觉与储物规则保持原坐标，减少回归面。
