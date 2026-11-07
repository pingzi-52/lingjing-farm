# 每日订单接入研究（2026-10-23）

范围：只读检查现有实现；本文为 V8 dailyOrders 实现提供接缝与陷阱，不修改运行代码。已批准产品行为：每天两张可选订单，适配季节与可获得资源；先领取再交付；当天有效，次日免费换新，未完成无罚；保存失败不扣材料、不发奖励、不保留领取状态。

## 1. 日期与会话接缝

- `src/game/systems/GameSession.ts` 的局部 `advanceDay()` 被 `sleep()`、`sleepAndSave()` 共用。当前顺序是读取离开日天气 → 日期+1 → `farming.tickDay()` → `exploration.beginDay()` → `applyRain()`。新订单应在作物推进完成后、用新日期季节和新一天资源生成。两条睡眠路径都需更新订单，不能只接床铺 UI。
- `sleep()` 仅改内存，且到 1,000,000 日直接返回；`sleepAndSave()` 保存完整次日早晨后才 `life.resetMorning()`。失败当前恢复 day/farming/exploration；必须加入 dailyOrders 快照恢复，确保失败后仍是旧日原订单与领奖状态。继续保留现有服务实例，勿重建整个 session。
- `persist()` 是所有交易和定时保存的统一字段集合，必须包含 dailyOrders；漏接会在任意购买/采集/存时钟时丢失订单。
- `loadGame()` 先调用 SaveManager 完整校验，再恢复所有服务；新服务只恢复已保存订单，不能按当前背包重生成。`newGame()` 在工具背包等全部初始化后建立第 1 天订单，并保持目前“不写盘”的契约。
- `TimeService` 的 day 是跨年的绝对日数，每季 14 天；春夏边界为 14→15。不要拿季内天数或真实时间作订单 ID/刷新依据。

## 2. 作物与资源可达性

- 成熟判定复用 `src/domain/services/CropService.ts:isMature(crop, def)`；它处理 `repeatHarvest && harvestedCount > 0` 的 `regrowDays` 阈值，不能写成 `growthDay >= growDays`。`growthDaysFor()` 可用于展示。
- `FarmingService.serialize()` 返回以 tileId 为键的深拷贝字典；`SaveData.farming` 是数组。成熟候选遍历 `Object.values(session.farming.serialize())`，存在 `crop` 才检查。
- `src/game/systems/objectiveGuide.ts:getIntroObjective()` 已有成熟田块、背包、箱子、天气提示模式，可参考；不要更改一次性入门委托的期限或目标规则。
- `src/data/crops.ts` 提供 `seasons`、`yield`、`sellPrice`。当前作物换季不会自动枯萎，因此田中成熟不代表符合当前季节，订单候选还需 `def.seasons.includes(date.season)`。
- `src/data/exploration.ts:FORAGE_NODES` 每天各有枯枝/溪石/野蘑菇 3 个节点；`exploration.state.picked` 标识当天已用节点。若首次生成发生在日中，应结合现有材料与未采节点判断采集单是否可完成。不要要求单种材料超过当日可获数量而又假定库存必然存在。
- 初期两张采集单；第二张可由“当前已有或已成熟的当季作物”替换。建议候选能力统计为随身数量 + 箱中数量 + 成熟地块产量；交付依旧只扣随身背包，并明确提示箱中物品需取出。若把箱中资源排除，也需在实现说明中保持一致。
- 种子和未成熟植株不能作为当天可收成证据。成熟一株可能产出多份（`yield`），数量不能按株数估算。
- 当日生成后冻结目标、数量、报酬、状态；打开面板、刷新、移动背包、存取箱子、收获后都只重算展示进度。不要用随机数在 render/getter/load 时重新挑单；按日期稳定选择候选也应保存最终结果。

## 3. V7→V8 存档与导入

- `src/domain/models/types.ts` 当前 `SaveData.version: 7`、`SAVE_VERSION = 7`；`src/persistence/save.ts:validate()` 对版本和字段都是严格白名单。
- 升级到 8 时，现有“2/3/4/5/6 或 SAVE_VERSION”的分支要显式继续接受 7。增加 `hasDailyOrders = version >= 8`，仅 V8 要求 dailyOrders；V1..V7 不得携带该额外字段，也不得因新增字段要求而失效。
- V1 分支会提前返回，须单独补迁移默认。普通 save 的兼容入口 `{gold,day}` 及省略新字段的旧调用也需建立有效默认，但完整 session 保存必须显式传入当前订单。
- 迁移发生在纯校验读取边界，不能偷偷写盘或改 session。依赖当前资源生成时应使用已校验的 inventory/chest/farming 以及文档日期，而非全局 session。生成应确定性，保证反复 load/preview 同一旧存档结果一致；首次正常保存时才落盘新结构。
- `previewImport()`、`importSave()`、export、恢复备份与 normal load 共用同一校验。导入确认会重新校验字节并比较 `previousRaw`，不要绕开这个通路。`TitleScene` 导入成功回调 `loadGame()` 后重启标题，应完整替换订单服务状态，勿保留上一个游戏的缓存。
- V8 校验应检查日期关系、恰好两张、唯一 ID/槽位、已知 itemId、有限正整数数量/报酬、状态白名单、严格字段、深拷贝。数量/报酬按允许目录约束，不接受任意巨额奖励。已完成态不能被“库存不足”校验拒绝；冻结作物候选也不能在加载时要求当前仍有库存/成熟地块，否则合法交付或卖出后无法读取。
- 对过期订单须定义一个统一策略：规范要求当天订单时可严格要求订单日等于存档日；若兼容过期状态，则仅日变更时重建，绝不能重置同一天的 completed。未来日期和不一致 ID 应拒绝，不能静默保留。
- 现有 `tests/save-v5.test.ts`、`save-v6.test.ts`、`save-v7.test.ts` 硬断言版本 7；若干 session/transaction 测试把 `version: 8` 当未来版本，升级后应改为 `SAVE_VERSION + 1`，否则原来的未来版本保护用例会测试错误对象。

## 4. 领取、交付与回滚

- 可参照 `GameSession.completeExplorationQuest()` 或 `completeIntroQuest()`：先验证 active、材料、`MAX_GOLD` 与安全整数，再快照库存/金币/订单状态，扣材料、发金、标记完成，`saveGame()` 成功才返回成功。保存失败完整还原三者，返回 `SAVE_FAILED`。
- 现有 `explorationTransaction()` 只覆盖 inventory/exploration/energy/gold，不自动覆盖 dailyOrders；直接套用会漏回滚订单，应扩充或建立订单专用事务。
- 领取也必须保存且失败回滚。操作应由 session 完成；UI 不直接写 gold/inventory/state。read-only 的详情展示不应自动领取。
- ID 应包含绝对日与固定槽位。每次调用都重新检查当前订单日、ID 和状态，不能只信按钮禁用或旧闭包。连续点击、重新打开、加载后第二次交付都应拒绝 completed；旧日按钮不得在次日误领奖同槽新单。
- 订单不发实体物品奖励时无额外背包容量风险；金上限失败应在扣材料前返回。已有 `InventoryService.remove()` 会跨堆叠扣减，可直接复用。
- SaveManager 写入顺序为备份旧有效字节，再写主存档；备份写失败或主写失败均返回 false，事务都需回滚。不要在保存失败后仅重新 load：新游戏尚无旧存档时会丢内存，且时钟小数进度会被重置。

## 5. 弹窗、入口、图标

- 优先复用 `src/ui/PausePanel.ts`：`begin()` 阻止重复 overlay，暂停 physics、禁用并 reset Phaser keyboard、暂停音频，提供 dialog/aria-modal、Escape、Tab 焦点循环；`show()` 按 `data-action` 保持焦点；`destroy()` 关闭并移除 capture keydown listener。
- 暂停 physics 不会暂停 session 时钟。新面板必须分别加入 `FarmScene.busy()`、`HomeScene.busy()`、`ExplorationScene.busy()`，并在 create 构造、shutdown destroy；这三处 update 已在 busy/hidden 时停音频、速度归零且丢弃恢复首帧时间。漏 busy 会导致弹窗中时间继续走。
- `PausePanel.close()` 自己不恢复音频，依赖下一个非 busy 的 scene update；使用已有生命周期即可。跨面板按钮应 `this.close(); openNext()`，否则 `begin()` 会因旧 overlay 拒绝。不要依赖在 overlay 打开后仍可触发 Phaser 热键。
- `MerchantDialogue` 为旧式独立弹窗（未继承 PausePanel），农场 create 传入打开市场回调；可依此加“今日订单”按钮回调，必须先 close。它的 `mayAct` 与距离/无商人便笺逻辑仅属于一次性首份收成，不应无意限制全局订单板入口。
- `ResidentDialogue extends PausePanel`，构造器已有制作/家具回调；扩展参数保持现有调用兼容，再在森林/镇对话加先关闭后打开订单板的按钮。居民任务仍仅完成一次，与每日订单独立。
- `ItemIconCache(scene).src(itemId)`（`src/game/systems/itemVisual.ts`）是统一 DOM 图标入口，支持 farm-forage-v1 与作物图集、缺资源透明降级。使用 `.farm-item-icon`，旁边保留物品中文名和数量；无需新增贴图或直接拼资产路径。

## 6. 最小验证重点

覆盖：新游戏两采集单；成熟当季作物替换第二张与再生阈值；背包变化/开关面板/读档不换单；领取与交付保存失败完全回滚；材料不足、金币上限、重复点击/重复加载不发奖；睡眠成功换单、失败保留旧日与完成状态；14→15 季节边界；V1..V7 迁移及纯预览；V8 缺字段/重复ID/未知物品/伪造奖励/未来版本拒绝；导入替换旧会话；三场景暂停时钟与关闭恢复、切场景销毁 overlay/listener、商人和居民按钮接线。
