/**
 * offlineStorage.ts
 * IndexedDB-backed local cache for BPW Daily Sheet.
 * Provides offline-first reads and a pending-writes queue for background sync.
 */

const DB_NAME = "bpw_offline_v1";
const DB_VERSION = 1;

// Store names
const SHEETS_STORE = "sheets";
const PRODUCT_NAMES_STORE = "productNames";
const PENDING_WRITES_STORE = "pendingWrites";

export type PendingWriteOp =
  | { id: string; type: "saveSheet"; payload: object }
  | { id: string; type: "saveProductNames"; payload: string[] };

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SHEETS_STORE)) {
        db.createObjectStore(SHEETS_STORE, { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains(PRODUCT_NAMES_STORE)) {
        db.createObjectStore(PRODUCT_NAMES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PENDING_WRITES_STORE)) {
        db.createObjectStore(PENDING_WRITES_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function txGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

function txGetAll<T>(storeName: string): Promise<T[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

function txPut(storeName: string, value: object): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const req = tx.objectStore(storeName).put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function txDelete(storeName: string, key: IDBValidKey): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

// ── Sheets ──────────────────────────────────────────────────────────────────

/** Cache a single sheet */
export async function cacheSheet(
  sheet: object & { date: string },
): Promise<void> {
  await txPut(SHEETS_STORE, sheet);
}

/** Get a single cached sheet by date */
export async function getCachedSheet<T>(date: string): Promise<T | null> {
  const result = await txGet<T>(SHEETS_STORE, date);
  return result ?? null;
}

/** Get all cached sheets */
export async function getAllCachedSheets<T>(): Promise<T[]> {
  return txGetAll<T>(SHEETS_STORE);
}

/** Cache all sheets (bulk replace) */
export async function cacheAllSheets(
  sheets: Array<object & { date: string }>,
): Promise<void> {
  for (const sheet of sheets) {
    await txPut(SHEETS_STORE, sheet);
  }
}

// ── Product Names ────────────────────────────────────────────────────────────

/** Cache product names array */
export async function cacheProductNames(names: string[]): Promise<void> {
  await txPut(PRODUCT_NAMES_STORE, { id: "productNames", names });
}

/** Get cached product names */
export async function getCachedProductNames(): Promise<string[] | null> {
  const result = await txGet<{ id: string; names: string[] }>(
    PRODUCT_NAMES_STORE,
    "productNames",
  );
  return result?.names ?? null;
}

// ── Pending Writes Queue ─────────────────────────────────────────────────────

/** Add an operation to the pending writes queue */
export async function enqueuePendingWrite(op: PendingWriteOp): Promise<void> {
  await txPut(PENDING_WRITES_STORE, op);
}

/** Remove a pending write by id (after successful flush) */
export async function dequeuePendingWrite(id: string): Promise<void> {
  await txDelete(PENDING_WRITES_STORE, id);
}

/** Get all pending writes */
export async function getAllPendingWrites(): Promise<PendingWriteOp[]> {
  return txGetAll<PendingWriteOp>(PENDING_WRITES_STORE);
}

/** Check if there are any pending writes */
export async function hasPendingWrites(): Promise<boolean> {
  const all = await getAllPendingWrites();
  return all.length > 0;
}
