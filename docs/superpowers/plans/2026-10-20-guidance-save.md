# 引导与存档管理 Implementation Plan

> 使用subagent-driven-development执行独立核心模块，主Agent负责界面整合及浏览器验收；已有自主授权，不逐项询问。

**Goal:** 让已有短流程有准确行动提示，并支持文件迁移个人存档。

**Architecture:** 纯展示模型共享给HUD/Q/L/居民；存档管理复用严格校验与明确备份，标题页UI负责文件选择和确认。

**Tech Stack:** TypeScript / Phaser3.90 / DOM / Vitest，新增依赖为零。

## Global Constraints

- 保留原有改动、V6存档、资源ID、任务奖励、已接受美术和道路，不提交推送发布。
- 不读取用户个人浏览器；实机只用独立测试context和合成夹具。
- 测试先失败再实现，UI通过真实浏览器验证。

### Task 1: 目标展示与居民就绪模型

- [x] 新建objectiveGuide.ts及测试；精确定义输入与输出，覆盖spec全部分支。
- [x] 观察失败，实施最小模型，相关测试通过。
- [x] 接入FarmScene/MerchantDialogue/TravelMenu与ExplorationScene；相关数据变化后提示刷新，位置和碰撞不变。
- [x] 检查HUD/Q/L与居民状态的实机一致性和监听清理。

### Task 2: 文件迁移核心

- [x] SaveManager新增预览、导出与明确导入API，使用现有validate/parse；先添加边界/回滚/冲突/旧版测试。
- [x] 实现并验证原文备份、取消零写入、最大大小、未来版本拒绝与写入失败保护。
- [x] 代码复核边界及完整测试。

### Task 3: 存档管理界面

- [x] 新增SaveManagementMenu，标题S与点击入口，避免与现有按钮叠加。
- [x] 文件大小检查、异步选择版本号防竞态、预览与明确确认、导出下载、成功回标题。
- [x] 扩充PausePanel焦点列表支持文件输入，保持现有弹窗行为。
- [x] 实机验证独立context导出→导入→继续→刷新；取消、坏文件、未来版、菜单关闭中读取及焦点循环。

### Task 4: 集成验收与记录

- [x] 完整npm test、npm run build、git diff --check；修复独立审查问题。
- [x] 保存实际截图与验证记录，更新README/PROJECT_CONTEXT/TASK_PROGRESS。
- [x] 保留本地预览并写明确下一步；不自动提交推送。
