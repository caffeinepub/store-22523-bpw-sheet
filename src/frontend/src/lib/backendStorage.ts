/**
 * Backend storage helpers — direct-to-canister.
 * Every read and write goes directly to the ICP canister.
 * No IndexedDB, no local cache, no pending writes queue.
 * If a canister call fails, the error propagates immediately to the caller.
 */

import type { backendInterface } from "../backend";

import type {
  DailySheet as BackendDailySheet,
  NegativeEntry as BackendNegativeEntry,
  ProductRow as BackendProductRow,
  ReportRow as BackendReportRow,
} from "../backend";
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

// ── Direct-to-Canister Backend Storage API ────────────────────────────────────────

/**
 * Save a single sheet directly to the canister.
 * Throws if the canister call fails — caller must handle the error.
 */
export async function saveSheetToBackend(
  actor: backendInterface,
  sheet: DailySheet,
): Promise<void> {
  await actor.saveSheet(toBackendSheet(sheet));
}

/**
 * Load a single sheet directly from the canister.
 * Returns null if no sheet exists for the given date.
 * Throws if the canister call fails.
 */
export async function loadSheetFromBackend(
  actor: backendInterface,
  date: string,
): Promise<DailySheet | null> {
  const result = await actor.loadSheet(date);
  if (!result) return null;
  return convertBackendSheet(result);
}

/**
 * Load all sheets directly from the canister.
 * Throws if the canister call fails.
 */
export async function loadAllSheetsFromBackend(
  actor: backendInterface,
): Promise<DailySheet[]> {
  const entries = await actor.loadAllSheets();
  return entries.map((e) => convertBackendSheet(e.value.sheet));
}

/**
 * Save product names directly to the canister.
 * Throws if the canister call fails.
 */
export async function saveProductNamesToBackend(
  actor: backendInterface,
  names: string[],
): Promise<void> {
  await actor.saveProductNames(names);
}

/**
 * Load product names directly from the canister.
 * Returns DEFAULT_PRODUCTS if no names are found (first-time setup).
 * Throws if the canister call fails.
 */
export async function loadProductNamesFromBackend(
  actor: backendInterface,
): Promise<string[]> {
  const entries = await actor.loadProductNames();
  if (!entries || entries.length === 0) {
    // First-time setup: push defaults to canister
    await actor.saveProductNames(DEFAULT_PRODUCTS);
    return [...DEFAULT_PRODUCTS];
  }
  const sorted = [...entries].sort(
    (a, b) => Number(a.key.index) - Number(b.key.index),
  );
  return sorted.map((e) => e.value.name);
}

/** Get the most recent locked sheet before a given date — direct from canister */
export async function getMostRecentLockedSheetFromBackend(
  actor: backendInterface,
  beforeDate: string,
): Promise<DailySheet | null> {
  const allSheets = await loadAllSheetsFromBackend(actor);
  const locked = allSheets
    .filter((s) => s.locked && s.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  return locked[0] ?? null;
}

/**
 * Get or create a sheet for a date — direct from canister.
 * If no sheet exists, carries forward from prev locked sheet and saves it.
 * Throws if any canister call fails.
 */
export async function getOrCreateSheetFromBackend(
  actor: backendInterface,
  date: string,
  productNames: string[],
): Promise<DailySheet> {
  // Try loading existing sheet
  const existing = await loadSheetFromBackend(actor, date);
  if (existing) return existing;

  // Get previous locked sheet for Opening/Open Counter carry-forward
  const allSheets = await loadAllSheetsFromBackend(actor);
  const prevLocked =
    allSheets
      .filter((s) => s.locked && s.date < date)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  // Create new sheet
  const rows = productNames.map((name, idx) => {
    if (prevLocked) {
      const prevRow = prevLocked.rows[idx];
      if (prevRow) {
        const prevTotalBA = calcTotalBA(prevRow);
        const prevTotalCounter = calcTotalCounter(prevRow);
        return emptyRow(name, prevTotalBA, prevTotalCounter);
      }
    }
    return emptyRow(name, 0, 0);
  });

  const newSheet: DailySheet = { date, rows, locked: false };
  await saveSheetToBackend(actor, newSheet);
  return newSheet;
}
