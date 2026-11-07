# 阿榆家具店与小屋布置：实现前研究

范围：购买家具、回家预览与摆放、移动、收回、布局存档，以及床、木箱、门口的通行保护。仅检查本地代码，没有网络请求。本文记录实现前 V6 基线，供 UI/会话与领域/存档并行实现使用。

## Reference Implementations

1. `src/game/systems/GameSession.ts`：`buyItem`、`explorationTransaction`、`performFarmAction` 均使用“序列化快照 → 领域变更 → saveGame → 失败原位 restore”。领域服务实例不替换，避免 actions/场景持有旧引用。`sleepAndSave` 示范完整次日状态保存成功后再提交晨间状态。
2. `src/persistence/save.ts` 与 `tests/save-v6.test.ts`：单一完整文档验证器供 load/save/import/export/backup 共用；精确 required/optional keys，不进行字符串转数字等宽松转换；旧版本读入迁移不写原始字节，下次成功保存时保留旧字节备份。
3. `src/ui/CraftingMenu.ts`、`src/ui/ResidentDialogue.ts` 复用 `PausePanel`：DOM 弹窗、暂停物理/游戏输入、Tab 焦点循环、Esc 关闭、按 data-action 保留重绘焦点。居民对话切制作页已经采用 `this.close(); this.openCraft();`，家具商店可沿用同一切换方式。

## Conventions Discovered

- 类型和构造：领域服务采用导出具体 class；会话导出 interface，工厂集中装配；状态接口在 `domain/models/types.ts`，数据表在 `data/`。新家具服务不应引入 Phaser/DOM。
- 错误：正常业务失败返回判别联合 `Result` 的字符串 reason，存储异常由 SaveManager 转为 false/Result，UI 通过 FEEDBACK 映射中文。失败后需显示可操作反馈。
- 配置：本地导入的数据表与显式常量；不依赖环境变量。现有研究范围没有日志基础设施和 IAC。
- 测试：Vitest 的 describe/it/it.each/expect；MemoryStorage 与抛异常的 storage.set 注入失败；对序列化状态、服务引用及原始 SAVE_KEY 字节作断言。
- 事务：家具购买应同时快照金币和家具状态；摆放、移动、收回应快照全部家具状态。成功只在 saveGame 成功后返回；SAVE_FAILED 原位恢复。预览只能读取候选布局，不能提前扣库存或移动正式实例。
- 时钟：不要为家具回滚调用 life.restore，否则可能丢掉小数时钟累计；家具事务本身无需改动 daily/时间/体力。

## Reusable Utilities

- `PausePanel` 的 node/button/panel/show 与 FEEDBACK 可直接引用，避免复制暂停和焦点逻辑。begin 会拒绝已存在的 `.farm-menu-overlay`，故必须先关闭对话再打开商店。
- `SaveManager` 的 keys/integer/bounded 是文件内 helper，可在同文件验证家具字段时复用；领域应另行导出纯布局校验供持久化调用，避免 UI 与存档各写一份几何规则。
- `farmhousePlot.ts` 的 chooseFarmhousePlot 使用四方向 BFS 检验门前可达；可借鉴算法，外部农舍占地规则不适用于室内家具，不能直接复用其坐标或地图。
- `GameSession` 的 loadGame/newGame/persist 是必须同时接入家具状态的三个入口；只更新 saveGame 会导致新游戏残留家具或读档丢布局。
- `HomeScene` 当前房间边界是 x=96..416、y=80..352，玩家出生 (256,304)，床中心 (350,160)、尺寸 44×80，木箱中心 (160,130)、尺寸 40×32，门阈值约 (256,339)。床/箱交互使用独立邻近矩形，因此保护目标需要包含可站立的交互位置。

## V7 Migration Boundaries

1. 当前版本判定是显式 2/3/4/5/当前版本白名单。提升 SAVE_VERSION 到 7 时必须显式保留 **6**。当前 `hasExploration = data.version === SAVE_VERSION` 必须改为 `>= 6`；家具只对 `>= 7` 必填。否则 V6 会拒载，或探索进度被默认值替换。
2. 原始 V1..V6 严格按各自 keys 校验，再补默认空家具状态；不能给旧版本添加 optional 家具字段，否则旧版伪造新字段会被静默接纳。V7 缺字段、null、数组代替对象、未知根字段应拒绝。save() 兼容调用只对 undefined 缺省，显式非法家具状态不得回退默认。
3. V6 → V7 必须保留金币、日期、耕地、背包、木箱、daily、introQuest 与全部探索字段；迁移 load/preview 不改原字节，首次保存 backup 必须保留 V6 原字节。对 V1..V6 参数化验收，各版默认字段仍遵循原契约。
4. V7 家具内部也应严格 keys：合法稳定家具 ID、整数有界数量/坐标、唯一实例 ID、总摆放数不超过拥有量、无越界/重叠/保护区占用、合法朝向（如提供）。拥有与摆放必须一并校验，禁止保存超买、负库存、未知物品或伪造实例。数组应有合理上限；整个文档仍受 256 KiB UTF-8 限制。
5. V8+ 保持拒绝加载/覆盖并保留原字节；import 对未来版本应报 UNSUPPORTED_VERSION。坏 V7 也不能被普通保存覆盖。备份恢复与导入确认须通过同一完整校验器。
6. 既有 `save-v6.test.ts` 和 `exploration-session.test.ts` 有“当前为6”和“未来7”的硬编码断言；升级后需改为当前版本/8，并将 V6 fixtures 保留为真实迁移测试。还需检查旧 transfer/UI/export fixtures 对当前版本的断言。

## Layout Collision Acceptance Boundaries

- 网格或矩形布局必须只有一个权威几何契约，供领域预览/提交、存档校验与 HomeScene 真实碰撞体共享。贴边是否允许、家具尺寸、玩家半宽与通道宽度应明确；只校验家具中心不够。
- 越界：四边、角落、负数、小数、NaN/Infinity（领域直接调用）、很大整数、未知 ID。宽高跨边界但原点在室内仍要失败；多格家具每格均受约束。
- 重叠：已有两件不同家具、同类多实例；移动时忽略自身旧占地而不忽略其他实例；移动到原位可安全成功；预览与失败不能残留占地或改变库存。
- 保护：床和箱实体占地、至少一个可站立交互点、门阈值与出生点；加入家具后仍存在门/出生 → 床交互点和箱交互点的可通行路径。不能仅保护三个点：允许围一圈会使交互不可达。可采用覆盖足够宽的固定保留走廊，或按玩家碰撞体膨胀障碍后 BFS。
- 通道：单格/狭缝、对角相邻家具、两件分别合法但组合封路，以及横跨入口的大件。通路验证使用四方向邻接，不能借对角穿墙误判可达。
- 玩家：人在候选位置时避免提交后困于家具内；可拒绝重叠或安全重定位至保留出生点。布局更新后刷新实际静态碰撞体并移除旧 collider，避免家具移动后“看得见旧位置空气墙”。
- 生命周期：预览取消/Esc/面板关闭无状态与存档变化；摆放后离开小屋再进、读档、导入和备份恢复均重建相同布局；收回只还家具可用量，不增加总拥有量或金币；新游戏清空布局。
- 持久化失败：购买、摆放、移动、收回分别注入 primary 写失败及 backup 写失败，断言金币/拥有量/布局/原 SAVE_KEY 一致，预览 UI 不显示成功，场景同步回正式状态。

## UI Integration Risks / Checks

- HomeScene/ExplorationScene 的 busy()、update 时钟暂停条件与 SHUTDOWN 销毁要包括新面板；关闭时恢复输入、resetKeys、物理和旧焦点，关闭重开不能触发残留移动键。
- PausePanel 现有焦点选择器只包含 button/input。布局网格若用 button 可直接复用；若加 select/textarea/其他 tabindex 元素，需要同步扩展键盘与焦点契约。
- PausePanel.close 当前不直接恢复音频；场景更新已有音频暂停联动。新增切换应沿用场景联动，验证离开弹窗后环境音恢复及切换面板时保持暂停。
- 居民商店入口不应取代既有阿榆委托/制作入口；零金币、恰好够买、多次购买、已买未摆、全部摆完应有清晰数量与反馈。家具可用量建议独立于普通背包，避免不可售家具混入 ShopService 的作物/材料交易规则。
- 推荐验证：家具领域边界与 V7 校验/迁移测试、会话回滚测试，再运行 npm run typecheck、npm test、npm run build；浏览器验收阿榆购买 → 回家预览 → 摆放 → 移动 → 收回 → 读档，并验收键盘 Tab/Shift-Tab/Esc。
