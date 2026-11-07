# 每日两张订单

用户确认上一轮建议：每天两张可选订单、领取/交付、隔天更新、报酬与清楚提示，保存失败不扣材料、不重复领奖。本轮不加入工具升级、NPC作息或全面经济重平衡。

## 体验和生成

O在农场、小屋、森林/镇上打开“今日订单”暂停面板；禾木/岚/阿榆对话亦可查看。两张分别领取、交付，委托人/物品/数量/报酬/背包进度清楚；从随身背包交付，木箱需先取出。当天有效，睡觉更新，未完成无惩罚，不预扣材料。

第一张为可采集材料（branch/stone/wild_mushroom）。第二张在背包、木箱或成熟田中存在当季作物时从这些作物里选一种，否则为另一种采集材料。数量1–3，作物数量不超过生成时可获得量；成熟量按现有CropService.isMature和yield计算。订单在新游戏、次日或旧档迁移时生成并持久化，当天不随新作物、售出、刷新、打开面板等操作重抽。不使用随机或真实时间。第1天默认两种采集单，避免需要等作物成长才能完成。

奖励公式：ceil(物品sellPrice × amount × 1.5) + 20，按现有物价导出，不持久化可任意篡改的reward字段。采集单约26–83金，数量按日期确定；无需改变商店/种子/家具价格。此为初始数值，长期节奏仍待真实14日试玩。

## 接口与持久化合同

`src/domain/models/DailyOrders.ts`：DailyOrderStatus=`available|active|completed`；DailyOrder={id:string,itemId:string,amount:number,status:DailyOrderStatus}；DailyOrdersState={day:number,orders:DailyOrder[]}；DailyOrderContext={inventory?:InventoryState,chest?:InventoryState,farming?:FarmTileState[]}。

`DailyOrdersService.ts` 导出 createDailyOrders(day,context?):DailyOrdersState、validateDailyOrders(value:unknown,savedDay:number):DailyOrdersState|null、dailyOrderReward(order:Pick<DailyOrder,"itemId"|"amount">):number、dailyOrderRequester(order:Pick<DailyOrder,"itemId">):string。订单id严格为`daily-${state.day}-${slot}`，slot=0/1。恰好2张，item不同，第一张采集，第二张采集或state.day所属季节作物，amount整数1–3；所有对象只接受规定键。state.day整数1..savedDay≤1000000，过期状态可被读取并在会话恢复时更新，不允许未来订单。

类DailyOrdersService：constructor(day=1,context?)；state/serialize深拷贝；newGame(day=1,context?)；beginDay(day,context?)（同日不重抽，不允许逆行）；restore(state:unknown,day?:number,context?)（默认day取state.day，严格校验，旧日则生成目标日）；accept(id:string):Result；complete(id:string):Result。complete只标记active→completed，材料/金币事务在会话；失败reason为UNKNOWN_ORDER/ORDER_ALREADY_ACCEPTED/ORDER_NOT_ACTIVE/ORDER_COMPLETED，日期或非法restore抛RangeError。

GameSession公开dailyOrders服务、acceptDailyOrder(id)、completeDailyOrder(id)。领取保存失败还原状态；交付先检查active、随身数量和MAX_GOLD，成功扣材料/加钱/标记完成并保存，任何失败完整恢复背包、金币、订单；保留引用和时钟余量。sleepAndSave快照与回滚包括订单；跨日完成作物生长/采集刷新后根据新上下文生成订单。loadGame恢复所有服务后恢复/更新订单，newGame重置订单。

SaveData V8增加必需dailyOrders。V1–V7各自原keys严格读取；已验证背包/木箱/田地后用createDailyOrders补当日内容，保留其他所有字段。显式允许6、7，exploration从6起、furniture从7起、dailyOrders从8起；未来V9+保护。save()兼容undefined缺省，显式null/非法不得默认。V8验证日订单结构与状态，未知字段/异常ID/越界数量/反季作物/未来日/少于或多于2张拒绝；奖励不作为存档字段。过期订单在GameSession.load时正常换日，不能领奖旧ID。

## UI与验证

DailyOrdersMenu复用PausePanel，构造(scene)，open()；两个卡片，领取/交付仅在合法时可用；完成态无领奖按钮；材料不足提示、金币上限与保存失败反馈；O/Esc关闭。场景纳入busy/暂停/shutdown，避免监听增长。地区手记可提示O但不改现有地图与一次性任务。

先回归测试再实现：确定性/可获得性/四季/再生/冻结/跨日/状态机，V8全字段往返与旧档迁移/未来9，事务与睡觉失败回滚、重复交付/过期ID/上限/背包失败；真实UI领取/交付/取消/刷新/睡觉更新/导入导出/暂停/重复场景与资源清理。记录准确测试数、截图与限制；所有前轮未提交工作保留，不提交推送。
