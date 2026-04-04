/**
 * Backend storage helpers — mirrors sheetStorage.ts API but uses ICP canister.
 * All data is stored on-chain so it's accessible from any device.
 */

import type { backendInterface } from "../backend";

// Extended interface for backup operations (new backend methods)
export interface FullBackup {
  sheets: Array<import("../backend").SheetEntry>;
  productNames: Array<import("../backend").ProductNameEntry>;
}

interface backendWithBackup extends backendInterface {
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

// ── Type conversion: Frontend → Backend ─────────────────────────────────────

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

// ── Type conversion: Backend → Frontend ─────────────────────────────────────

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

// ── Backend storage API ──────────────────────────────────────────────────────

/** Save a single sheet to backend */
export async function saveSheetToBackend(
  actor: backendInterface,
  sheet: DailySheet,
): Promise<void> {
  await actor.saveSheet(toBackendSheet(sheet));
}

/** Load a single sheet from backend by date */
export async function loadSheetFromBackend(
  actor: backendInterface,
  date: string,
): Promise<DailySheet | null> {
  const result = await actor.loadSheet(date);
  if (result === null || result === undefined) return null;
  return convertBackendSheet(result);
}

/** Load all sheets from backend */
export async function loadAllSheetsFromBackend(
  actor: backendInterface,
): Promise<DailySheet[]> {
  const entries = await actor.loadAllSheets();
  return entries.map((e) => convertBackendSheet(e.value.sheet));
}

/** Save product names to backend */
export async function saveProductNamesToBackend(
  actor: backendInterface,
  names: string[],
): Promise<void> {
  await actor.saveProductNames(names);
}

/** Load product names from backend, fall back to DEFAULT_PRODUCTS if empty */
export async function loadProductNamesFromBackend(
  actor: backendInterface,
): Promise<string[]> {
  const entries = await actor.loadProductNames();
  if (!entries || entries.length === 0) {
    // First-time setup: save defaults to backend
    await actor.saveProductNames(DEFAULT_PRODUCTS);
    return [...DEFAULT_PRODUCTS];
  }
  // Sort by index and extract names
  return entries
    .sort((a, b) => Number(a.key.index - b.key.index))
    .map((e) => e.value.name);
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
 * If no sheet exists, carry forward from the most recent locked sheet.
 */
export async function getOrCreateSheetFromBackend(
  actor: backendInterface,
  date: string,
  productNames: string[],
): Promise<DailySheet> {
  const existing = await loadSheetFromBackend(actor, date);
  if (existing) return existing;

  // Try to carry forward from the most recent locked sheet
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
  await saveSheetToBackend(actor, sheet);
  return sheet;
}

// ── Backup / Restore ─────────────────────────────────────────────────────────

/** Download all data as a JSON backup file */
export async function downloadBackup(actor: backendInterface): Promise<void> {
  const backupActor = actor as backendWithBackup;
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
  a.click();
  URL.revokeObjectURL(url);
}

/** Restore data from a JSON backup file — overwrites all existing data */
export async function restoreBackup(
  actor: backendInterface,
  file: File,
): Promise<void> {
  const backupActor = actor as backendWithBackup;
  const text = await file.text();
  const backup = JSON.parse(text);
  // Convert any number-typed bigints back
  const convert = (obj: unknown): unknown => {
    if (Array.isArray(obj)) return obj.map(convert);
    if (obj && typeof obj === "object") {
      return Object.fromEntries(
        Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
          k,
          convert(v),
        ]),
      );
    }
    return obj;
  };
  await backupActor.importAllData(convert(backup) as FullBackup);
}
