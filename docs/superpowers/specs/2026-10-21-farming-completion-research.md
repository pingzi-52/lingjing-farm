# 种田完整度研究 · 2026-10-21

## 结论与本轮建议

已有完整的开垦→播种→浇水→跨日生长→收获→背包→交易链。优先补操作准确性、地块信息和农作持久化事务；不重写既有成长系统。本轮可交付：邻近鼠标精准操作、快捷栏点击和 Space 使用工具；地块状态/进度与 F 农务手记；单独的持久化农作 command；X 仅还原无作物耕地；统一四季11作物四阶段与三态连片土壤美术。

美术借鉴清晰的16bit田园风、可辨认作物轮廓、有限色板、脚底对齐和轻量动作反馈，继续使用原创命名与内容，不复制《星露谷》的原图。保留已完成v8建筑/v9草地道路和SceneHud。

本文只新增研究文件；未修改代码、素材或其他未提交工作。当前仓库未发现适用 AGENTS.md。

## 已验证功能与缺口

| 面向 | 已有实现 | 经源码确认的缺口/注意点 |
| --- | --- | --- |
| 输入 | `FarmScene.getTargetTileId` 使用 `computeTargetTile`，玩家中心所在格朝向偏一格；移动后 POST_UPDATE 同步黄框。 | `onPointerDown()` 不收 pointer，不读鼠标坐标，也不检查鼠标按钮；点任意画面仍操作朝向格。不能只改高亮而保留动作使用旧目标。 |
| 地形限制 | FarmScene 用 grass/soil 白名单、地图边界和 houseReserved 拒绝农舍/入口预留地；道路显示按旧田隐藏。 | domain 的 till 不认识地图，可接受任意字符串；低层测试甚至用0_0。因此新增持久化入口需要有效ID/原农场可耕地校验，不能依赖严格存档失败来当正常地形判定。 |
| 地块检查 | 有干湿土、四阶段显示，Q/L已展示目标作物的下一步。 | 没有独立目标地块状态、作物名字、当前成长周期进度、成熟产量或地块统计面板；不要把现有任务手记重复造一份。 |
| 成长 | CropService 纯规则；成熟封顶，缺水停长；再生作物收获后保留植株。 | 只有春季3种拥有正式四阶段atlas；其余8种大部分阶段用通用占位。再生归0会显示seed阶段，需要美术区分“植株再生”，而非误导为重新播种。 |
| 操作失败 | FarmActions 对无种子/背包满等业务失败已有预检或回滚；GameSession会扣2/2/1体力。 | FarmScene 调用actions成功后才saveCurrent；存储失败只显示提示，内存耕地/种子/产物/体力已经改变。与交易/探索既有原子事务不一致。 |
| 清理 | 普通收获只删crop，保留耕地；重复收获保留crop。 | 无铲除作物或还原耕地API。X规则需新定义，不能把现有hoe重复开垦幂等行为偷偷改成删除。 |

## 2–3 个参考模式与复用接口

1. **`src/game/utils/targetTile.ts` + `tests/target-tile.test.ts`**：纯坐标计算、`Facing`、`computeTargetTile`、`tileIdOf`、`pickFacing`。保持键盘朝向入口，增加单独的pointer邻近格解析；先通过camera得到world坐标，再交纯函数判断格/范围。现仓库无可复用的pointer世界坐标工具。
2. **`src/game/systems/GameSession.ts` + `tests/exploration-session.test.ts` / `quest-session.test.ts`**：service引用不更换，事务前快照、业务操作、保存、失败原地restore，`SAVE_FAILED`统一返回。`explorationTransaction`恢复能量差值而不调用life.restore，保护未满7秒的分数时钟。可借此建立专用农作command，不必抽象全仓库事务框架。
3. **`src/game/systems/farmSoilSurface.ts` / `cropVisual.ts` / `groundVisual.ts` 及对应测试**：纯计划或HasVisualFrame选图与Phaser渲染分层；脏检查、图元复用、缺帧回退、明确depth/锚点；`PausePanel`可复用F面板的暂停、焦点和销毁。新手记只读GameSession快照，不生成自己的成长状态。

直接复用 `FarmingService.serialize/restore`、`CropService.getDefinition/stageOf/isMature`、`InventoryService.count/hasSpace/serialize/restore`、`DailyLifeService.canSpend/spend/recover`、`CROPS`、`ITEMS`、`getCropVisual/getSoilVisual`、`planSoilSurface/soilQuarterFrames`、`SceneHud`、`getFarmAudio`与`Player.playAction`。

## 必须保持的规则合同

- `CropState={cropId,growthDay,harvestedCount}`；阶段由规则计算，不落盘。11种作物参数来自 `src/data/crops.ts`，首熟天数/产量/售价不因界面完整化而更改。
- starberry 首次8个生长日；首次收获后growthDay=0、harvestedCount+1，再生周期3日。其他作物收获删除crop。背包满时成熟作物留地；零体力仍允许收获，现有 `daily-session.test.ts` 已明确。
- 当前开垦/浇水/播种消耗2/2/1；重复开垦和重复浇水免费。`ItemDefinition.energyCost`的历史字段不能代替GameSession真实成本（hoe数据写5但现行规则为2）。
- 季节只过滤商店种子上架，`FarmActions.plant`与`FarmingService.tickDay`不做适季限制、不自动枯萎。`tests/objective-guide.test.ts`已明确允许跨季播种自有种子，目标作物也不会换季改ID。手记写清这项温和规则；本轮不引入枯死/季节扣种。
- `GameSession.sleep`先保留离开当天weather再tickDay；次日恢复体力、刷新每日采集，再applyRain。雨天新开垦地自动湿润，不额外收费；loadGame仅补当前雨天湿润，不多长一天。无水壶容量/肥料/品质/工具等级系统，不能在本轮顺带扩展。
- `actions`低层合同仍为显式保存：`tests/daily-session.test.ts`验证actions后save.load可为空。`sellItem`又复用`actions.sell`，不能把所有actions统一自动save而造成交易双写或错误时序。

## 建议的改动面与自然拆分

### A. 持久化农作 command 与安全空地还原

扩展GameSession的独立command入口（名称由实现定），覆盖till/water/plant/harvest/restore-empty；委托现有actions完成既有规则，新增空地还原由FarmingService负责地块删除。快照farming、inventory和energy，任何失败恢复原引用内的原值；只有保存成功才报告成功、播放成功反馈。不要用loadGame回滚：它会读旧盘、applyRain并重置分数时钟。

command校验规范ID及原FARM01可保存的 `. / S / H` 格；运行时houseReserved与操作距离继续由场景限制。不要将opened边界草地误认为可保存耕地；原篱笆/树/岩/池塘仍不可种。

X 只还原无作物的已耕地，消耗1体力；活作物（包括成熟/再生）明确拒绝，不退款、不掉落。不对树木/岩石做“清理空地”，那需要持久化世界障碍状态，超出V6范围。空白未开垦格应无副作用，重复按键不得扣体力。

删除记录无需加存档字段：动态开垦草地会露回草；原预制H田删除记录后只回到raw预备土，不会变草。`planSoilSurface`始终保留基础预备田，界面文案应称“还原未耕状态”，不要承诺全地图铲平还草。

### B. 精准操作、地块状态与 F 手记

FarmScene接收pointer，忽略非左键、HUD与快捷栏占用区、场景暂停/过图，以及地图外/不可耕/超距格。快捷栏点击先选物，不向世界穿透；Space沿现有朝向使用工具。E维持成熟收获→居民→小屋优先级，避免无关交互回归。

邻近范围须在设计定稿为单一合同（建议当前格及四个正交邻格，或明确的一格范围），hover高亮、鼠标动作与检查面板共用解析结果。鼠标超距时应显示不可达/不执行，不能悄悄回落到朝向的另一块地。相机跟随/缩放由Phaser换算世界坐标；不要用屏幕像素直接除32。

新增纯地块描述：未开垦/空耕地、干湿/雨水、作物名、阶段、growthDay/本周期阈值、可收获/需浇水/等睡觉、一次性/再生、产量。不要把“剩余生长日”当成保证的日历天数，干旱会暂停成长。F手记从同一快照汇总耕地/待浇水/成熟数量与CROPS11种资料，并解释跨季规则，无新任务系统。

成熟阈值在CropService私有thresholdOf、FarmActions.maturityThreshold和objectiveGuide中已有重复公式。若新增地块进度需要更多调用，宜提供一个明确的只读公共阈值/进度接口来复用，保留isMature/stageOf权威，不再复制第四份公式。

### C. 四季作物与连片土壤原创补件

新atlas保留全部11作物稳定ID和seed/sprout/young/mature四阶段合同；采用清晰块面、轮廓可辨、成熟果实有色彩对比，最终32px内识别。生成原图保留字节/提示词/来源，静态帧表独立；缺新图仍回落现有春季atlas→旧具体成熟图→通用占位，不覆盖旧资源。

土壤仍为raw/dry/wet三态与四分块邻接，不重写地图。v4当前使用soil-patches-v2.png配soil-patches-v3.json，若换新图必须成套替换选图/完整性校验，不能只换PNG。v9草底与FarmSoilSurface底图公式继续同步。

作物脚底origin(0.5,1)、单格32px，土壤depth4、作物5、目标框6、人物脚底10+、大气90/91、HUD98+。若再生需要保留枝叶，可用harvestedCount派生展示分支，不增加存档字段、不改变再生成熟天数；未实现前不要在文档声称再生有独立动画。

## V6与旧档限制

`src/persistence/save.ts`严格拒绝未知字段、未知物品/作物、非法/重复tile ID；仅接受原FARM01 `. / S / H`且tilled=true。growthDay不得超过当前首次/再生阈值；非再生harvestedCount必须0。清空crop或删除空耕记录都是现有合法结构，无需V7。

不要为了新清理/状态展示放宽校验，不迁移删除旧田，不重排背包。房舍/商人候选避让旧田、跨区路口reserved和cultivated隐藏必须继续生效。保持现有导入前before-import副本与backup/rejected合同，种田command不直接操作这些键。

## 测试与实机验证

- 基础：继续使用Vitest node；actions/farming/crop/daily-session/target-tile/objective-guide/soil-surface/save-v2/v6已有大量合同。新增小型纯解析与描述模型测试，不模拟整个Phaser来验证算术。
- 输入：不同camera scroll/地图边界、当前格/正交/对角/超距、HUD/快捷栏/非左键、键盘Space与E路径、光标高亮和真正修改tile一致；鼠标不动玩家移动后目标依然正确。
- 原子性：有效业务失败、备份写失败/主档写失败/未来版本主档拒写，均核对耕地、种子槽位、收获物、体力和旧主档原文；引用不更换且6秒分数时钟不丢失。成功动作写一次，场景不再重复saveCurrent。
- 清理：干/湿空耕地可还原且扣1，未耕无副作用，活作物/再生植株/保留区域/非法ID拒绝，失败不扣体力；保存重载和原预制田raw底图正确。
- 状态：11作物四阶段、首次/再生进度、雨/晴、成熟不再需水、混合田统计、跨季持有种子/作物、旧档无crop字段；纯模型不写数据。
- 素材：PNG/JSON边界、完整帧集/缺帧回退、三态连片土、草土接缝、脚底与选择框；先看最终32px，再做晴雨夜截图。
- 浏览器：独立档真实鼠标种植、Space工具、E收获、X空地还原、F打开/暂停/焦点/Esc恢复、背包满收获保留、雨天/再生第二次收获、刷新与跨区保留，记录实际结果。无需采集个人档。

以上为源码研究与建议，没有执行新功能或宣称其验证通过。用户要求更完整种田与田园像素美术，本轮无需扩展钓鱼、建筑、节庆、自动化农机或长期经济系统。
