# 农作完整度与像素美术 Implementation Plan

**Goal:** 让玩家可靠地选格、种植照料、查看进度、收获与整理田地，并统一11作物四阶段/三态土壤画面。

**Architecture:** 保留低层领域actions，新增GameSession持久化农作事务；纯farmingTarget/farmingGuide模型；独立提示和PausePanel农务手记；FarmScene只负责输入/渲染集成。

**Tech Stack:** Phaser/TypeScript/Vitest；内置imagegen与版本化atlas，无新依赖。

## Global Constraints

- 保留未提交内容；不commit/push/发布。
- V6无新字段，旧档与跨季/再生/雨天/低层显式保存合同保持。
- X仅清空耕地，活作物禁止清理，耗1体力；成功农作与持久化是一笔事务。
- 先测试再实现；UI与渲染用实机验证；PNG原字节保留，缺图回退。

## Tasks / ownership

- [x] 基线783测试、研究与同机位改前图（首个夹具包含bed非法格被严格拒绝，已改用有效格；未放宽校验）。
- [ ] 事务worker：仅GameSession.ts、FarmingService.ts、tests/farming-transactions.test.ts与reclaim领域测试。新增FarmCommand/performFarmAction；reclaim；故障/旧档/引用/时钟测试。
- [ ] 模型worker：仅farmingTarget.ts、farmingGuide.ts、CropService.ts与对应tests。精确邻近格；只读提示/概览/作物资料；公共阈值查询。
- [ ] 主Agent：v10两作物atlas与土壤atlas原图、帧表、来源、回退；实际32px检查。
- [ ] 主Agent：FarmPlotInfo、FarmingJournal、FarmScene/Player输入集成、快捷栏/UI误点保护、保存反馈与清理。
- [ ] 完整测试/构建/独立复核，实际农作流程、异常与美术矩阵验收。
- [ ] 更新证据、README/上下文/路线，保留5175预览，不推送。
