// localStorage helpers for BPW Daily Sheet

export const STORAGE_KEY = "bpw_sheets";
export const PRODUCTS_KEY = "bpw_product_names";

export const DEFAULT_PRODUCTS = [
  "Salad Bowl - Baggase 750 ML",
  "Frozen Italian White Dough",
  "Frozen Multi Grain Dough",
  "Iced Green Tea - Mint Mojito 245Ml",
  "Iced Green Tea - Peach 245Ml",
  "Multigrain Tortilla 11.5 Inch",
  "Spinach Tortilla 11.5 Inch",
  "Dark Chunk Cookie",
  "Double Chunk Cookie",
  "Oatmeal Cookie",
  "Opera Chips - Salt & Black Pepper",
  "Assorted Nachos",
  "Coca-Cola - 330ml Can",
  "Coke Zero - 330ml Can",
  "Fanta - 330ml Can",
  "Thums up - 330ml Can",
  "Sprite - 330ml Can",
  "Schweppes - 500ml PET Water",
  "Maaza - 300ml Juice",
  "Minute Maid Pulpy Orange - 300ml Juice",
  "Tender Coconut Water 200 ml",
  "Choco Mint 17 gm Protein Milkshake",
];

/** Load product names from localStorage (falls back to defaults) */
export function loadProductNames(): string[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (!raw) return [...DEFAULT_PRODUCTS];
    const parsed = JSON.parse(raw) as string[];
    // Ensure array length matches defaults (pad/trim if needed)
    if (parsed.length !== DEFAULT_PRODUCTS.length) {
      const merged = DEFAULT_PRODUCTS.map((d, i) => parsed[i] ?? d);
      return merged;
    }
    return parsed;
  } catch {
    return [...DEFAULT_PRODUCTS];
  }
}

/** Save product names to localStorage */
export function saveProductNames(names: string[]): void {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(names));
}

// Keep PRODUCTS as a getter so existing code that imports it gets current names
export const PRODUCTS = DEFAULT_PRODUCTS;

export interface ProductRow {
  productName: string;
  opening: number; // locked, carry-forward from previous Total BA
  delivery: number; // manual – sum of deliveryCells
  deliveryCells: [number, number, number]; // three individual delivery entries
  transfer: number; // manual – sum of transferCells
  transferCells: [number, number, number]; // three individual transfer entries
  openCounter: number; // locked, carry-forward from previous Total Counter + transfer
  physical: number; // manual
  additional: number; // manual
  posCount: number; // manual
}

export interface FinalizedReportRow {
  label: string;
  variance: number;
  status: "Excess" | "Short" | "Tally";
}

export interface NegativeEntry {
  type: "delivery" | "transfer";
  productIdx: number;
  cellIdx: number; // 0, 1, or 2
  qty: number;
  reason: string;
}

export interface DailySheet {
  date: string; // YYYY-MM-DD
  rows: ProductRow[];
  locked: boolean;
  finalizedReport?: FinalizedReportRow[]; // saved when day is closed via Run Report
  negativeReasons?: Record<string, string>; // key: "delivery_idx_cell" or "transfer_idx_cell"
  negativeEntries?: NegativeEntry[]; // full log of negative entries with reasons
}

/** Build a blank row for a product */
export function emptyRow(
  productName: string,
  opening = 0,
  openCounter = 0,
): ProductRow {
  return {
    productName,
    opening,
    delivery: 0,
    deliveryCells: [0, 0, 0],
    transfer: 0,
    transferCells: [0, 0, 0],
    openCounter,
    physical: 0,
    additional: 0,
    posCount: 0,
  };
}

/** Ensure legacy rows (missing deliveryCells/transferCells) are upgraded */
export function migrateRow(row: ProductRow): ProductRow {
  return {
    ...row,
    deliveryCells: row.deliveryCells ?? [row.delivery, 0, 0],
    transferCells: row.transferCells ?? [row.transfer, 0, 0],
  };
}

/** Load all sheets from localStorage */
export function loadAllSheets(): DailySheet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const sheets = JSON.parse(raw) as DailySheet[];
    // Migrate legacy rows
    return sheets.map((s) => ({ ...s, rows: s.rows.map(migrateRow) }));
  } catch {
    return [];
  }
}

/** Save all sheets to localStorage */
export function saveAllSheets(sheets: DailySheet[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sheets));
}

/** Load a single sheet by date */
export function loadSheet(date: string): DailySheet | null {
  const all = loadAllSheets();
  return all.find((s) => s.date === date) ?? null;
}

/** Save (upsert) a single sheet */
export function saveSheet(sheet: DailySheet): void {
  const all = loadAllSheets();
  const idx = all.findIndex((s) => s.date === sheet.date);
  if (idx >= 0) {
    all[idx] = sheet;
  } else {
    all.push(sheet);
  }
  saveAllSheets(all);
}

/** Get the most recent locked sheet before a given date */
export function getMostRecentLockedSheet(
  beforeDate: string,
): DailySheet | null {
  const all = loadAllSheets();
  const locked = all
    .filter((s) => s.locked && s.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  return locked[0] ?? null;
}

/**
 * Get or create a sheet for a date.
 * If no sheet exists, carry forward from the most recent locked sheet.
 */
export function getOrCreateSheet(
  date: string,
  productNames?: string[],
): DailySheet {
  const existing = loadSheet(date);
  if (existing) return existing;

  const names = productNames ?? loadProductNames();

  // Try to carry forward from the most recent locked sheet
  const prev = getMostRecentLockedSheet(date);

  const rows = names.map((name, idx) => {
    if (prev) {
      const prevRow = prev.rows[idx];
      if (prevRow) {
        const prevTotalBA = calcTotalBA(prevRow);
        const prevTotalCounter = calcTotalCounter(prevRow);
        // Opening = previous Total BA (not Store Closing)
        return emptyRow(name, prevTotalBA, prevTotalCounter);
      }
    }
    return emptyRow(name, 0, 0);
  });

  const sheet: DailySheet = { date, rows, locked: false };
  saveSheet(sheet);
  return sheet;
}

/** Helper – Total BA = Opening + Delivery - Transfer */
export function calcTotalBA(row: ProductRow): number {
  return row.opening + row.delivery - row.transfer;
}

/** Helper – Total Counter = Physical + Additional */
export function calcTotalCounter(row: ProductRow): number {
  return row.physical + row.additional;
}

/** Helper – Open Counter = Previous Total Counter + current Transfer */
// (stored directly on the row as openCounter, computed at carry-forward time)

/** Helper – Store Closing = Total BA + Total Counter */
export function calcStoreClosing(row: ProductRow): number {
  return calcTotalBA(row) + calcTotalCounter(row);
}

/** Helper – Variance = POS Count - Store Closing */
export function calcVariance(row: ProductRow): number {
  return row.posCount - calcStoreClosing(row);
}

/** Get list of all sheet dates that have data */
export function getAllSheetDates(): string[] {
  return loadAllSheets().map((s) => s.date);
}

/** Get list of all locked sheet dates */
export function getLockedDates(): string[] {
  return loadAllSheets()
    .filter((s) => s.locked)
    .map((s) => s.date);
}
