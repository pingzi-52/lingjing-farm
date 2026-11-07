# 家具购买与布置实施计划

> **For agentic workers:** Use subagent-driven-development with separate domain and persistence ownership. Primary agent owns UI/session integration and browser acceptance. Do not commit or push.

**Goal:** 阿榆出售八种家具，小屋G预览/确认摆放与收回，布局随存档可靠恢复。

**Architecture:** 家具定义和纯几何服务为领域唯一规则；GameSession包装金币/家具/保存事务；PausePanel负责商店与布置预览；HomeDecor仅绘制已提交布局。

**Tech Stack:** Phaser3.90.0、TypeScript、Vitest、Vite、现有v11家具atlas。

## 共同约束

遵循 `../specs/2026-10-23-furniture-play-design.md` 的完整类型/接口合同。最多32件、旧布局八件免费保留、购买先入收纳。保存V7新增必需furniture，V1–V6迁移保持全部进度，未来版本拒绝。所有坐标整数；默认坐标不改成粗网格。预览无写入，提交保存失败完整回滚。床/箱/门/角色通行不能被堵住。保留所有前轮未提交工作，不新增依赖/素材，不提交推送。

## Task 1: 领域与几何（worker domain）

Files: `src/domain/models/Furniture.ts`、`src/data/furniture.ts`、`src/domain/services/FurnitureService.ts`、`src/game/systems/homeFurniturePlan.ts`、`tests/furniture-service.test.ts`。

- [x] 先写购入/收纳/预览/提交/边界与连通回归，观察失败。
- [x] 把旧布局移到data层供初始存档复用，HomeFurniture旧导出保持兼容。
- [x] 实现严格状态验证、单件ID、32件容量、全部几何检查和玩家中心32×28连通判定。验证restore与preview无外部别名/副作用。
- [x] 定向测试通过并报告真实接口、失败reason、验证结果。主Agent逐项审阅设计与代码。

## Task 2: V7存档（worker persistence）

Files: `src/domain/models/types.ts`、`src/persistence/save.ts`、`tests/save*.test.*`。

- [x] 先新增V6→V7迁移/家具往返/损坏与堵路/未来版本回归。
- [x] SaveData版本7与furniture字段，V6显式接受且探索字段从6起保留；V7验证领域家具状态，旧版本初始化八件布局。
- [x] save()支持furniture（缺省仍照顾旧调用方），导出/导入/恢复保持原文及备份合同。保留旧版本测试的原意，不能删除失败断言绕过问题。
- [x] 迁移既有SaveData类型夹具与当前/未来版本断言，定向测试并报告。不要修改GameSession/UI或其他测试。

## Task 3: 会话与显示（primary）

Files: `src/game/systems/GameSession.ts`、`HomeDecor.ts`、`src/game/scenes/HomeScene.ts`、`tests/furniture-transactions.test.ts`。

- [x] 注入FurnitureService，persist/load/newGame包括家具，新增buy/place/store三种事务与主档/备份失败回滚测试。
- [x] HomeDecor可接当前布局，HomeScene重建时释放旧图/静态体/collider，不重建角色或其他状态。
- [x] 小屋G菜单纳入busy/暂停/关闭/销毁，阻止角色脚下摆放。保留sleepAndSave。

## Task 4: 家具商店与预览面板（primary）

Files: `src/ui/FurnitureShopMenu.ts`、`FurnitureLayoutMenu.ts`、`furnitureUi.ts`、`ResidentDialogue.ts`、`SaveManagementMenu.ts`、`src/game/scenes/ExplorationScene.ts`、`src/styles/main.css`。

- [x] 工坊对话close后打开商店；售价/拥有数/余额/容量/失败提示清楚，购买后留在菜单。
- [x] 使用现有v11帧图像绘制房间预览，选择实例→点击平面预览→微调→确认/取消/收回。绿色合法/红色非法边框和文字原因；床箱固定标注；收纳列表可滚动。
- [x] 点击未确认不改会话，关闭放弃候选；成功提交刷新实际家具；保存失败保留候选方便重试。
- [x] 文件导入提示用SAVE_VERSION，不再写死V6；显示家具也随存档恢复。

## Task 5: 独立复核与验收

- [x] 独立审阅领域/持久化/事务/UI核心路径，修复确认的问题后重跑针对性测试。
- [x] 全量 `npm test`、`npm run build`、`git diff --check`。
- [x] 隔离浏览器真实阿榆对话购买、小屋G选物/预览/非法通道/确认/收回/取消，存储写入失败、刷新与导入导出、旧档迁移、重复菜单/场景清理，截图与结构化记录。
- [x] 保存素材/功能说明、README按键与交接进度；停止本轮临时测试进程。最终只报告已验证内容及限制。
