// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { emptyState, type PersistedState, type StatePort } from "@docli/sync-client";

export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const DB_NAME = "docli-sync";
const STORE = "state";
const DB_VERSION = 1;

export class IndexedDbKv implements KvStore {
  private dbp: Promise<IDBDatabase> | null = null;

  constructor(private readonly idb: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    if (this.dbp) return this.dbp;
    this.dbp = new Promise((resolve, reject) => {
      const req = this.idb.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  }

  async get(key: string): Promise<string | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export class PendingDeletesStore {
  private readonly key: string;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly kv: KvStore,
    workspaceId: string,
    clientId: string,
  ) {
    this.key = `deletes:${workspaceId}:${clientId}`;
  }

  async load(): Promise<string[]> {
    const raw = await this.kv.get(this.key);
    if (!raw) return [];
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? (v as string[]) : [];
    } catch {
      return [];
    }
  }

  save(paths: string[]): Promise<void> {
    const snapshot = JSON.stringify([...new Set(paths)]);
    this.chain = this.chain
      .then(() => this.kv.set(this.key, snapshot))
      .catch((e) => {

        console.error("docli: pending-delete store write failed", e);
      });
    return this.chain;
  }

  flush(): Promise<void> {
    return this.chain;
  }
}

export class KvStatePort implements StatePort {
  private readonly key: string;

  constructor(
    private readonly kv: KvStore,
    workspaceId: string,
    clientId: string,
  ) {

    this.key = `state:${workspaceId}:${clientId}`;
  }

  async load(): Promise<PersistedState> {
    const raw = await this.kv.get(this.key);
    if (!raw) return emptyState();
    try {
      return JSON.parse(raw) as PersistedState;
    } catch {
      return emptyState();
    }
  }

  async save(s: PersistedState): Promise<void> {
    await this.kv.set(this.key, JSON.stringify(s));
  }
}
