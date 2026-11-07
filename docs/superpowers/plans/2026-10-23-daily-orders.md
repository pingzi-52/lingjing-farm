# 每日订单实施计划

> **For agentic workers:** Apply subagent-driven-development with independent domain, persistence and menu ownership; primary agent owns GameSession/scene integration, review and browser acceptance. No commit/push.

**Goal:** 每天两张可选且冻结的订单，把采集/收成接进家具购买目标。

**Architecture:** 纯DailyOrdersService生成和验证；GameSession扣物/奖钱/存储事务；完整V8文档迁移；PausePanel订单卡片通过O及居民对话访问。

**Tech Stack:** Existing Phaser/TypeScript/Vitest/Vite and original item icons. No new dependencies/assets.

## 约束与共享接口

按 `../specs/2026-10-23-daily-orders-design.md` 完整模型/函数签名实现。当天有效，次日无罚替换；初期两采集，当季已有/成熟作物才可入第二单；奖励公式固定，数量1–3；每天只生成一次。V8新增dailyOrders，V1–V7兼容，V9+保护。金币/背包/订单事务与睡觉失败回滚，保留全部既有家具/任务和未提交工作。

## Task 1：领域（worker）

Files: `src/domain/models/DailyOrders.ts`、`src/domain/services/DailyOrdersService.ts`、`tests/daily-orders.test.ts`。

- [ ] 研究既有CropService成熟阈值、ITEMS/CROPS价格、ExplorationService状态机，先写失败测试。
- [ ] 实现确定性生成、上下文库存/木箱/成熟产量筛选、严格验证、深拷贝和冻结状态机。
- [ ] 覆盖1/14/15/29/43/1000000日、已成熟/再生/未熟/反季、状态跃迁、逆行/过期、未知/异常输入、无别名与奖励导出。
- [ ] 跑定向测试和自查，报告接口与reason；primary按规范审阅。

## Task 2：V8存档（worker）

Files: `src/domain/models/types.ts`、`src/persistence/save.ts`、`tests/save*.test.*`。

- [ ] 先新增V8测试，真实V7保留家具/进度→补当日订单，源字节不被读取改写。
- [ ] 在既有完整验证器接入create/validate；旧日允许读取，未来订单拒绝；save兼容undefined。
- [ ] 调整当前/未来版本断言与typedfixtures，保留真实旧版和坏数据意图，不通过删断言绕过。
- [ ] 存档定向测试与typecheck，报告所有权外的版本测试修改需求。

## Task 3：菜单（worker）

Files: `src/ui/DailyOrdersMenu.ts`，如需要仅新增相应css类；不修改场景/会话。

- [ ] 构造(scene)，open()，两卡片显示姓名、图标、数量/背包与木箱进度、奖励/状态；使用ItemIconCache。
- [ ] 领取与交付调用会话接口，完成后不可重复领奖；不足材料/上限/失败给清楚提示，未提交无需提示保存。
- [ ] 保持PausePanel焦点/暂停/关闭合同和512×384下可读布局，O/Esc关闭；覆盖缺图片fallback。

## Task 4：会话与场景（primary）

Files: `GameSession.ts`、Farm/Home/ExplorationScene、Merchant/ResidentDialogue、TravelMenu、`tests/daily-orders-session.test.ts`、少量旧版本测试期望。

- [ ] 先补领取/交付/失败回滚/重复与过期/上限、睡觉回滚、刷新冻结的失败测试。
- [ ] 注入服务与context，persist/load/newGame/跨日全部接入，睡觉失败还原旧订单。
- [ ] 三类可玩场景O打开，居民对话可转入，busy/时钟暂停/销毁接线。操作提示限宽，不挤压原快捷栏。
- [ ] 独立只读复核关键生成/事务/迁移/UI，修复确认发现。

## Task 5：验收与交接

- [ ] 全量test、typecheck/build、diff检查。
- [ ] 隔离浏览器真实领取/材料不足/交付/重复领奖保护、保存失败重试、刷新冻结、次日替换无罚、跨季、文件导入导出恢复、7秒菜单暂停与重复场景清理。
- [ ] 保留截图/结构化结果；写功能说明和README O键，更新当前V8与进度；停止本轮临时测试服务。
