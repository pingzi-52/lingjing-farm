import type { FarmTileState } from "./Crop";
import type { InventoryState } from "./Item";

export type DailyOrderStatus = "available" | "active" | "completed";

export interface DailyOrder {
  id: string;
  itemId: string;
  amount: number;
  status: DailyOrderStatus;
}

export interface DailyOrdersState {
  day: number;
  orders: DailyOrder[];
}

export interface DailyOrderContext {
  inventory?: InventoryState;
  chest?: InventoryState;
  farming?: FarmTileState[];
}
