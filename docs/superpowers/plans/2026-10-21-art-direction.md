# 地表与HUD美术统一 Implementation Plan

**Goal:** 用清爽草地、安静道路与统一双行HUD改善当前游戏画面。

**Architecture:** 纯groundVisual选帧和幂等预加载接入现有渲染入口；独立SceneHud只接收显示快照。保留世界、碰撞、季节、土壤、存档与操作合同。

**Tech Stack:** Phaser/TypeScript/Vitest；内置imagegen原图与静态atlas；无新依赖。

## Global Constraints

- 保留全部未提交内容；不提交推送发布。
- 不改domain/save/map/physics/input/camera规则；不覆盖原素材。
- 新图完整帧集优先，缺图回退；草地底图必须同步透明土壤。
- 视觉低影响调整不编写镜像测试；回退合同先观察失败再实现。

## Tasks

- [x] 保存774测试基线与同机位改前截图。
- [x] 保存v9生成图原字节、prompt、atlas与来源；检查RGBA/边界。首稿偏密，最终使用第二次简化的meadow-v2。
- [x] tests/ground-visual.test.ts观察失败后实现src/game/systems/groundVisual.ts；新资产帧合同测试。
- [x] 接入FarmEnvironment/FarmSoilSurface/Title与三处道路入口，不改拓扑/季节/土壤规则。
- [x] 新增src/game/systems/sceneHud.ts，接入Farm/Exploration/Home；统一快捷栏与标题按钮颜色。
- [x] 完整测试构建、独立复核；浏览器同机位对照、实际步行/选物/四季晴雨夜/旧田存档/缺图/大数HUD/清理验收。
- [x] 更新文档/截图/进度，保留本地可预览结果。

结果：47文件783测试、81模块构建通过；34项独立复核通过，无明确缺陷。证据与局限见docs/ART_DIRECTION.md。
