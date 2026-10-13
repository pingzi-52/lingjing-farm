# 四季田园 · Four Seasons Farm

原创 2D 浏览器农场模拟经营游戏（第一阶段：工程骨架 + 基础角色移动）。

- 精致现代像素风，Phaser 3 + TypeScript + Vite
- 目标平台：桌面浏览器（Chrome / Edge 优先），单人游玩
- 本地存档：localStorage，无后端、无账号系统

> ⚠️ 当前所有像素素材均为**程序化占位素材**（运行时生成），非正式美术。

## 安装

```bash
npm install
```

## 开发运行

```bash
npm run dev
```

打开终端提示的地址（默认 http://localhost:5173 ）。

## 操作

| 按键 | 功能 |
|---|---|
| W / A / S / D 或 方向键 | 移动角色 |
| E | 靠近床时睡觉，进入下一天并自动存档 |
| T | 回到标题界面 |
| Enter | 标题界面继续/开始游戏 |
| N | 标题界面新游戏 |

## 测试

```bash
npm test          # 单次执行（Vitest）
npm run test:watch
```

覆盖领域层：时间（季节/天数）、经济（金币）、存档（序列化/损坏数据）、地图（尺寸/边界/通行性）、会话（跨场景状态一致性）。

## 生产构建

```bash
npm run build     # tsc 类型检查 + vite build，产物在 dist/
npm run preview   # 本地预览 dist/
```

## 目录结构

```
src/
├─ main.ts               入口：挂载 Phaser 游戏
├─ game/
│  ├─ config.ts          全局常量（TILE、场景键、视野）
│  ├─ createGame.ts      Phaser 实例创建 + 场景注册
│  ├─ scenes/            Boot / Title / Farm 场景
│  ├─ entities/          Player（角色）
│  └─ systems/
│     ├─ GameSession.ts  跨场景共享状态（单一事实源）
│     └─ placeholderAssets.ts  程序化占位像素素材
├─ domain/
│  ├─ models/            数据模型类型（日期/季节/存档）
│  └─ services/          TimeService / EconomyService（纯逻辑）
├─ data/maps/farm01.ts   原创「青禾农庄」地图（36×24）
├─ persistence/save.ts   localStorage 存档管理器
├─ ui/                   UI 层预留接口
└─ styles/               全局样式
tests/                   Vitest 单元测试
```

## 架构约定

- 游戏规则在 `domain/services`（纯逻辑可单测），**不写在 UI 事件回调里**
- 金币 / 日期等状态只存在于 `GameSession`（模块级单例），场景切换不重置
- 场景只读取会话状态做表现，不持有权威数值

## 下一阶段预留接口

| 模块 | 建议接口 |
|---|---|
| 农业种植 | `CropService`（种子/生长/收获），挂入 `GameSession` |
| 背包 | `InventoryService`（物品槽 + 容量），`add/remove/has` |
| 经济扩展 | 在 `EconomyService` 上加 `buyItem(id)` / 物品价格表 `src/data/pricing.ts` |
| 存档 v2 | `SaveData` 增加 `crops/inventory` 字段 + 版本迁移函数 |
| 季节效果 | 基于 `TimeService.date.season` 的门控（作物适种/天气） |
