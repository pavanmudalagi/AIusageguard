import type { StorageAdapter } from "./types";

export class MemoryStorageAdapter implements StorageAdapter {
  private values = new Map<string, unknown>();

  async getItem<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

declare const chrome: {
  storage?: {
    local?: {
      get(keys: string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    };
  };
};

export class ChromeStorageAdapter implements StorageAdapter {
  async getItem<T>(key: string): Promise<T | null> {
    const result = await chrome.storage?.local?.get([key]);
    return (result?.[key] as T | undefined) ?? null;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    await chrome.storage?.local?.set({ [key]: value });
  }

  async removeItem(key: string): Promise<void> {
    await chrome.storage?.local?.remove(key);
  }
}
