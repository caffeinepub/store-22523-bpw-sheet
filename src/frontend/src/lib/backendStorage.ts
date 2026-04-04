/**
 * Backend storage helpers — offline-first.
 * All reads return from IndexedDB cache immediately.
 * Writes go to IndexedDB first, then attempt canister sync.
 * Failed canister writes are queued and retried when online.
 */

import type {
  ProductNameEntry,
  SheetEntry,
  backendInterface,
} from "../backend";

// Full backup payload type (mirrors FullBackup in backend.d.ts)
interface FullBackup {
  sheets: SheetEntry[];
  productNames: ProductNameEntry[];
}

// Extended interface that includes backup methods (present in backend but not in generated bindings)
interface BackendWithBackup extends backendInterface {
  exportAllData(): Promise<FullBackup>;
  importAllData(backup: FullBackup): Promise<void>;
}

import type {
  DailySheet as BackendDailySheet,
  NegativeEntry as BackendNegativeEntry,
  ProductRow as BackendProductRow,
  ReportRow as BackendReportRow,
} from "../backend";
import {
  cacheAllSheets,
  cacheProductNames,
  cacheSheet,
  dequeuePendingWrite,
  enqueuePendingWrite,
  getAllCachedSheets,
  getAllPendingWrites,
  getCachedProductNames,
  getCachedSheet,
} from "./offlineStorage";
import {
  DEFAULT_PRODUCTS,
  calcTotalBA,
  calcTotalCounter,
  emptyRow,
  migrateRow,
} from "./sheetStorage";
import type {
  DailySheet,
  FinalizedReportRow,
  NegativeEntry,
  ProductRow,
} from "./sheetStorage";

// ── Type conversion: Frontend → Backend ──────────────────────────────────────────

function toBackendNegativeEntry(e: NegativeEntry): BackendNegativeEntry {
  return {
    entryType: e.type,
    productIndex: BigInt(e.productIdx),
    cellIndex: BigInt(e.cellIdx),
    quantity: e.qty,
    reason: e.reason,
  };
}

function toBackendReportRow(r: FinalizedReportRow): BackendReportRow {
  return {
    reportLabel: r.label,
    variance: r.variance,
    status: r.status,
  };
}

function toBackendProductRow(r: ProductRow): BackendProductRow {
  return {
    productName: r.productName,
    opening: r.opening,
    delivery: r.delivery,
    deliveryCells: [r.deliveryCells[0], r.deliveryCells[1], r.deliveryCells[2]],
    transfer: r.transfer,
    transferCells: [r.transferCells[0], r.transferCells[1], r.transferCells[2]],
    openCounter: r.openCounter,
    physical: r.physical,
    additional: r.additional,
    posCount: r.posCount,
  };
}

function toBackendSheet(sheet: DailySheet): BackendDailySheet {
  const negativeReasonsTuples: Array<[string, string]> = sheet.negativeReasons
    ? Object.entries(sheet.negativeReasons)
    : [];

  return {
    date: sheet.date,
    rows: sheet.rows.map(toBackendProductRow),
    locked: sheet.locked,
    negativeReasons: negativeReasonsTuples,
    negativeEntries: (sheet.negativeEntries ?? []).map(toBackendNegativeEntry),
    finalizedReport: sheet.finalizedReport
      ? sheet.finalizedReport.map(toBackendReportRow)
      : undefined,
  };
}

// ── Type conversion: Backend → Frontend ──────────────────────────────────────────

function fromBackendNegativeEntry(e: BackendNegativeEntry): NegativeEntry {
  return {
    type: e.entryType as "delivery" | "transfer",
    productIdx: Number(e.productIndex),
    cellIdx: Number(e.cellIndex),
    qty: e.quantity,
    reason: e.reason,
  };
}

function fromBackendReportRow(r: BackendReportRow): FinalizedReportRow {
  return {
    label: r.reportLabel,
    variance: r.variance,
    status: r.status as "Excess" | "Short" | "Tally",
  };
}

function fromBackendProductRow(r: BackendProductRow): ProductRow {
  const deliveryCells: [number, number, number] = [
    r.deliveryCells[0] ?? 0,
    r.deliveryCells[1] ?? 0,
    r.deliveryCells[2] ?? 0,
  ];
  const transferCells: [number, number, number] = [
    r.transferCells[0] ?? 0,
    r.transferCells[1] ?? 0,
    r.transferCells[2] ?? 0,
  ];
  return migrateRow({
    productName: r.productName,
    opening: r.opening,
    delivery: r.delivery,
    deliveryCells,
    transfer: r.transfer,
    transferCells,
    openCounter: r.openCounter,
    physical: r.physical,
    additional: r.additional,
    posCount: r.posCount,
  });
}

export function convertBackendSheet(bs: BackendDailySheet): DailySheet {
  const negativeReasons: Record<string, string> = {};
  for (const [k, v] of bs.negativeReasons) {
    negativeReasons[k] = v;
  }

  return {
    date: bs.date,
    rows: bs.rows.map(fromBackendProductRow),
    locked: bs.locked,
    negativeReasons,
    negativeEntries: bs.negativeEntries.map(fromBackendNegativeEntry),
    finalizedReport: bs.finalizedReport
      ? bs.finalizedReport.map(fromBackendReportRow)
      : undefined,
  };
}

// ── Offline-first Backend Storage API ──────────────────────────────────────────────

/**
 * Save a single sheet.
 * Writes to IndexedDB immediately (optimistic), then syncs to canister.
 * If canister is unreachable, queues for later retry.
 */
export async function saveSheetToBackend(
  actor: backendInterface,
  sheet: DailySheet,
): Promise<void> {
  // 1. Write to local cache immediately
  await cacheSheet(sheet);

  // 2. Try canister write
  try {
    await actor.saveSheet(toBackendSheet(sheet));
    // Remove any existing pending write for this date (now synced)
    const pending = await getAllPendingWrites();
    for (const op of pending) {
      if (
        op.type === "saveSheet" &&
        (op.payload as DailySheet).date === sheet.date
      ) {
        await dequeuePendingWrite(op.id);
      }
    }
  } catch {
    // Queue for background sync
    const existing = (await getAllPendingWrites()).find(
      (op) =>
        op.type === "saveSheet" &&
        (op.payload as DailySheet).date === sheet.date,
    );
    if (existing) {
      // Update existing pending write with latest data
      await dequeuePendingWrite(existing.id);
    }
    await enqueuePendingWrite({
      id: `saveSheet_${sheet.date}`,
      type: "saveSheet",
      payload: sheet,
    });
    // Don't throw — offline save succeeded
  }
}

/**
 * Load a single sheet.
 * Returns cached version immediately, refreshes from canister in background.
 */
export async function loadSheetFromBackend(
  actor: backendInterface,
  date: string,
): Promise<DailySheet | null> {
  // Return cached version
  const cached = await getCachedSheet<DailySheet>(date);

  // Refresh from canister in background (fire and forget)
  actor
    .loadSheet(date)
    .then(async (result) => {
      if (result != null) {
        const sheet = convertBackendSheet(result);
        await cacheSheet(sheet);
      }
    })
    .catch(() => {
      /* ignore, use cache */
    });

  return cached;
}

/**
 * Load all sheets.
 * Returns from IndexedDB cache immediately; syncs from canister in background.
 */
export async function loadAllSheetsFromBackend(
  actor: backendInterface,
): Promise<DailySheet[]> {
  const cached = await getAllCachedSheets<DailySheet>();

  // Background refresh
  actor
    .loadAllSheets()
    .then(async (entries) => {
      const sheets = entries.map((e) => convertBackendSheet(e.value.sheet));
      await cacheAllSheets(sheets);
    })
    .catch(() => {
      /* ignore, use cache */
    });

  return cached;
}

/**
 * Save product names.
 * Writes to IndexedDB immediately, then syncs to canister.
 */
export async function saveProductNamesToBackend(
  actor: backendInterface,
  names: string[],
): Promise<void> {
  await cacheProductNames(names);

  try {
    await actor.saveProductNames(names);
    // Remove pending write if any
    const pending = await getAllPendingWrites();
    for (const op of pending) {
      if (op.type === "saveProductNames") {
        await dequeuePendingWrite(op.id);
      }
    }
  } catch {
    const existing = (await getAllPendingWrites()).find(
      (op) => op.type === "saveProductNames",
    );
    if (existing) await dequeuePendingWrite(existing.id);
    await enqueuePendingWrite({
      id: "saveProductNames",
      type: "saveProductNames",
      payload: names,
    });
  }
}

/**
 * Load product names.
 * Returns from IndexedDB cache; refreshes from canister in background.
 */
export async function loadProductNamesFromBackend(
  actor: backendInterface,
): Promise<string[]> {
  const cached = await getCachedProductNames();

  // Background refresh from canister
  actor
    .loadProductNames()
    .then(async (entries) => {
      if (entries && entries.length > 0) {
        const names = entries
          .sort((a, b) => Number(a.key.index - b.key.index))
          .map((e) => e.value.name);
        await cacheProductNames(names);
      } else {
        // First-time setup: push defaults to canister
        await actor.saveProductNames(DEFAULT_PRODUCTS);
        await cacheProductNames(DEFAULT_PRODUCTS);
      }
    })
    .catch(() => {
      /* ignore, use cache */
    });

  if (cached && cached.length > 0) return cached;

  // No cache, try canister synchronously as fallback
  try {
    const entries = await actor.loadProductNames();
    if (!entries || entries.length === 0) {
      await actor.saveProductNames(DEFAULT_PRODUCTS);
      await cacheProductNames(DEFAULT_PRODUCTS);
      return [...DEFAULT_PRODUCTS];
    }
    const names = entries
      .sort((a, b) => Number(a.key.index - b.key.index))
      .map((e) => e.value.name);
    await cacheProductNames(names);
    return names;
  } catch {
    await cacheProductNames(DEFAULT_PRODUCTS);
    return [...DEFAULT_PRODUCTS];
  }
}

/** Get the most recent locked sheet before a given date */
export async function getMostRecentLockedSheetFromBackend(
  actor: backendInterface,
  beforeDate: string,
): Promise<DailySheet | null> {
  const all = await loadAllSheetsFromBackend(actor);
  const locked = all
    .filter((s) => s.locked && s.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  return locked[0] ?? null;
}

/**
 * Get or create a sheet for a date.
 * If no sheet exists locally, try canister, then carry forward from prev locked sheet.
 */
export async function getOrCreateSheetFromBackend(
  actor: backendInterface,
  date: string,
  productNames: string[],
): Promise<DailySheet> {
  // Check local cache first
  const cached = await getCachedSheet<DailySheet>(date);
  if (cached) {
    // Background refresh from canister
    actor
      .loadSheet(date)
      .then(async (result) => {
        if (result != null) {
          const sheet = convertBackendSheet(result);
          await cacheSheet(sheet);
        }
      })
      .catch(() => {});
    return cached;
  }

  // Try canister
  try {
    const result = await actor.loadSheet(date);
    if (result != null) {
      const sheet = convertBackendSheet(result);
      await cacheSheet(sheet);
      return sheet;
    }
  } catch {
    // Canister unreachable — fall through to create from prev locked sheet
  }

  // Create new sheet from previous locked sheet (from cache)
  const prev = await getMostRecentLockedSheetFromBackend(actor, date);

  const rows = productNames.map((name, idx) => {
    if (prev) {
      const prevRow = prev.rows[idx];
      if (prevRow) {
        const prevTotalBA = calcTotalBA(prevRow);
        const prevTotalCounter = calcTotalCounter(prevRow);
        return emptyRow(name, prevTotalBA, prevTotalCounter);
      }
    }
    return emptyRow(name, 0, 0);
  });

  const sheet: DailySheet = { date, rows, locked: false };
  // Save to both cache and canister
  await cacheSheet(sheet);
  actor.saveSheet(toBackendSheet(sheet)).catch(async () => {
    await enqueuePendingWrite({
      id: `saveSheet_${sheet.date}`,
      type: "saveSheet",
      payload: sheet,
    });
  });
  return sheet;
}

/**
 * Flush all pending writes to canister.
 * Called when coming online or on mount.
 * Returns number of successfully flushed writes.
 */
export async function flushPendingWrites(
  actor: backendInterface,
): Promise<number> {
  const pending = await getAllPendingWrites();
  let flushed = 0;
  for (const op of pending) {
    try {
      if (op.type === "saveSheet") {
        await actor.saveSheet(toBackendSheet(op.payload as DailySheet));
      } else if (op.type === "saveProductNames") {
        await actor.saveProductNames(op.payload as string[]);
      }
      await dequeuePendingWrite(op.id);
      flushed++;
    } catch {
      // Still offline — leave in queue
      break;
    }
  }
  return flushed;
}

/**
 * Full data sync: load all sheets and product names from canister
 * and update the local cache. Returns the refreshed data.
 */
export async function syncFromCanister(actor: backendInterface): Promise<{
  productNames: string[];
  sheets: DailySheet[];
}> {
  const [entries, allSheets] = await Promise.all([
    actor.loadProductNames(),
    actor.loadAllSheets(),
  ]);

  const sheets = allSheets.map((e) => convertBackendSheet(e.value.sheet));
  await cacheAllSheets(sheets);

  let names: string[];
  if (!entries || entries.length === 0) {
    await actor.saveProductNames(DEFAULT_PRODUCTS);
    names = [...DEFAULT_PRODUCTS];
  } else {
    names = entries
      .sort((a, b) => Number(a.key.index - b.key.index))
      .map((e) => e.value.name);
  }
  await cacheProductNames(names);

  return { productNames: names, sheets };
}

// ── Backup / Restore ──────────────────────────────────────────────────────────────────

/** Download all data as a JSON backup file */
export async function downloadBackup(actor: backendInterface): Promise<void> {
  const backupActor = actor as BackendWithBackup;
  const backup = await backupActor.exportAllData();
  const json = JSON.stringify(
    backup,
    (_, v) => (typeof v === "bigint" ? Number(v) : v),
    2,
  );
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `bpw-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Restore data from a JSON backup file — overwrites all existing data */
export async function restoreBackup(
  actor: backendInterface,
  file: File,
): Promise<void> {
  const text = await file.text();
  const raw = JSON.parse(text);

  // Deep-convert: productIndex and cellIndex inside negativeEntries must be BigInt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convertNegativeEntry = (e: any) => ({
    ...e,
    productIndex: BigInt(e.productIndex ?? 0),
    cellIndex: BigInt(e.cellIndex ?? 0),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convertSheet = (sheet: any) => ({
    ...sheet,
    negativeEntries: (sheet.negativeEntries ?? []).map(convertNegativeEntry),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convertSheetEntry = (entry: any) => ({
    ...entry,
    value: { ...entry.value, sheet: convertSheet(entry.value.sheet) },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convertProductNameEntry = (entry: any) => ({
    ...entry,
    key: { ...entry.key, index: BigInt(entry.key.index ?? 0) },
  });

  const backup = {
    sheets: (raw.sheets ?? []).map(convertSheetEntry),
    productNames: (raw.productNames ?? []).map(convertProductNameEntry),
  };

  const backupActor = actor as BackendWithBackup;
  await backupActor.importAllData(backup);
}
