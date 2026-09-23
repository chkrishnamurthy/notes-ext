/**
 * An in-memory stand-in for chrome.storage.local.
 *
 * It exists so the storage, notes, migration and backup layers can be tested
 * without a browser, and so failures that are hard to provoke in Chrome —
 * quota exhaustion, a rejected write, a concurrent writer — can be triggered
 * on demand.
 */

import type { StorageArea } from '../src/lib/storage';

export class FakeArea implements StorageArea {
  private data = new Map<string, unknown>();

  /** When set, every set() rejects with this error. */
  failNextWrites: Error | null = null;
  /** Counts acknowledged writes, for asserting that a write really happened. */
  writes = 0;

  constructor(initial: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initial)) this.data.set(key, value);
  }

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    if (keys === null || keys === undefined) {
      for (const [key, value] of this.data) out[key] = structuredClone(value);
      return out;
    }
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (this.data.has(key)) out[key] = structuredClone(this.data.get(key));
    }
    return out;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    if (this.failNextWrites) throw this.failNextWrites;
    for (const [key, value] of Object.entries(items)) {
      this.data.set(key, structuredClone(value));
    }
    this.writes += 1;
  }

  async remove(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.data.delete(key);
  }

  async getBytesInUse(): Promise<number> {
    let bytes = 0;
    for (const [key, value] of this.data) bytes += key.length + JSON.stringify(value).length;
    return bytes;
  }

  /** Write behind the store's back, simulating another window. */
  poke(key: string, value: unknown): void {
    this.data.set(key, structuredClone(value));
  }

  keys(): string[] {
    return [...this.data.keys()];
  }

  raw(key: string): unknown {
    return this.data.get(key);
  }
}

export const quotaError = () =>
  new Error('Resource::kQuotaBytes quota exceeded');
