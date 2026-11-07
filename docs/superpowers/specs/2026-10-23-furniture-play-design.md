# 家具店与小屋布置

用户批准上一轮建议，当前实现第一阶段：阿榆家具店→购买→小屋预览布置→保存，后续每日订单/居民作息等不并入本轮。

## 行为

与溪桥镇阿榆交谈增加“看看家具”按钮，出售现有八种配套家具，不要求先完成一次性委托。按件购买，明确价格/持有数量/余额，成功购买自动保存；家具使用独立收纳清单，不挤占种子和工具背包。初始与旧档保留现有八件家具和原布局；购买额外同款获得新实例。最多32件，避免无限堆叠和存档膨胀。

小屋G打开暂停的布置面板：选择已有家具，在带真实家具图像的房间平面预览上点击新位置，先显示绿/红候选及原因，再确认摆放；可微调位置、收回、取消候选。关闭放弃未确认预览。床和箱固定不能移动；地毯允许家具叠放，实体脚印不能重叠。家具目前不支持旋转、出售或扩建。

所有摆放保留玩家32×28碰撞体下出生点、门口、床/木箱操作站位之间连通；保留门口和当前角色站位，家具图像不越房间，壁架仅北墙。校验使用统一纯几何规则，预览与提交一致。保存失败回滚金币/家具，面板仍可重试；预览/取消不写档。

## 数据与模块合同

`src/domain/models/Furniture.ts`：FurnitureKind八种；FurniturePosition{x,y}；FurnitureItem{id:number,kind,position:FurniturePosition|null}；FurnitureState{nextId:number,items:FurnitureItem[]}。id为唯一正整数、nextId大于全部id且≤1000000；最多32件；整数字段严格验证，不接受多余字段。收纳物position=null。

`src/data/furniture.ts`：FURNITURE_DEFINITIONS（kind,name,price,maxWidth,maxHeight,footprint?:{dx,dy,width,height},wall?:boolean），八种定义和默认八件布局；名字/价格：table木餐桌220、chair软垫木椅100、bookcase书架280、sideboard厨房矮柜320、plant盆栽80、lamp落地灯180、rug田园地毯150、wall-shelf壁架120。

`src/domain/services/FurnitureService.ts`：createInitialFurniture():FurnitureState，validateFurnitureState(unknown):FurnitureState|null，getPlacedFurniture(state):HomeFurniture[]，FurnitureService.state/serialize/restore/newGame/acquire(kind:string):Result/preview(id,x,y,player?:FurniturePosition):Result/place(id,x,y,player?):Result/store(id):Result。HomeFurniture为{kind,x,y,maxWidth,maxHeight,footprint?:{x,y,width,height}}，可移到models导出并供旧homeFurniturePlan重导出。getPlacedFurniture把相对脚印变为绝对矩形；默认旧布局保留。

GameSession公开furniture服务，buyFurniture(kind)、placeFurniture(id,x,y,player?)、storeFurniture(id)，事务失败恢复服务引用与完整快照。persist包含家具；load/newGame恢复/初始化家具。HomeDecor接收可选布局参数，默认旧布局兼容旧测试；HomeScene从服务绘制，提交后重建decor且销毁旧body/collider。

SaveData升级V7，增加必需furniture字段；V1–V6严格按各自原字段读取，迁移时生成原八件布局而不改金币/农田/背包/任务。保留原文备份、未知未来版本保护、文件导入/导出和所有旧测试意图。V7无furniture或非法/堵路布局应拒绝加载，不隐式重置。文件预览显示升级到当前SAVE_VERSION及家具随存档恢复。

## 验收

领域/迁移/事务回归；UI真实购买扣金币与加入收纳、G预览取消零写入、合法摆放/收回/非法堵路拒绝、刷新与导出导入恢复、旧V6迁移/未来版本保护/主档与备份写入失败回滚；缺图与三轮菜单/场景销毁；截图、全量test/build与进度文档。保留已有所有未提交工作，不commit/push或发布。
