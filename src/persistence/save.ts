import { SAVE_KEY, SAVE_VERSION, type SaveData } from "../domain/models/types";

/** 存储后端抽象（默认 localStorage，测试可注入内存实现） */
export interface SaveStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class MemoryStorage implements SaveStorage {
  private store = new Map<string, string>();
  get(key: string): string | null {
    const v = this.store.get(key);
    return v === undefined ? null : v;
  }
  set(key: string, value: string): void {
    this.store.set(key, value);
  }
  remove(key: string): void {
    this.store.delete(key);
  }
}

/** 浏览器 localStorage 适配器（SSR/Node 环境请使用 MemoryStorage） */
export class LocalStorageSaveStorage implements SaveStorage {
  private readonly storage: Storage;
  constructor(storage: Storage = window.localStorage) {
    this.storage = storage;
  }
  get(key: string): string | null {
    return this.storage.getItem(key);
  }
  set(key: string, value: string): void {
    this.storage.setItem(key, value);
  }
  remove(key: string): void {
    this.storage.removeItem(key);
  }
}

export function createLocalSaveManager(storage: SaveStorage = new LocalStorageSaveStorage()): SaveManager {
  return new SaveManager(storage);
}

/**
 * 本地存档管理器。
 * 只负责序列化与读写，不持有游戏数值（数值属于领域层单一事实源）。
 */
export class SaveManager {
  constructor(private readonly storage: SaveStorage) {}

  save(data: Omit<SaveData, "version">): void {
    const payload: SaveData = { ...data, version: SAVE_VERSION };
    this.storage.set(SAVE_KEY, JSON.stringify(payload));
  }

  load(): SaveData | null {
    const raw = this.storage.get(SAVE_KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as SaveData;
      if (typeof data.gold !== "number" || typeof data.day !== "number") {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  clear(): void {
    this.storage.remove(SAVE_KEY);
  }
}
