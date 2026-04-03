// Pure calculation functions for BPW Daily Sheet columns
import type { ProductRow } from "./sheetStorage";

export function totalBA(row: ProductRow): number {
  return row.opening + row.delivery - row.transfer;
}

export function openCounter(row: ProductRow): number {
  // openCounter is stored and updated at carry-forward time;
  // also updated in real-time based on transfer changes
  return row.openCounter + row.transfer;
}

export function totalCounter(row: ProductRow): number {
  return row.physical + row.additional;
}

export function storeClosing(row: ProductRow): number {
  return totalBA(row) + totalCounter(row);
}

export function variance(row: ProductRow): number {
  return row.posCount - storeClosing(row);
}

export interface ComputedRow {
  productName: string;
  opening: number;
  delivery: number;
  transfer: number;
  totalBA: number;
  openCounter: number;
  physical: number;
  additional: number;
  totalCounter: number;
  storeClosing: number;
  posCount: number;
  variance: number;
}

export function computeRow(row: ProductRow): ComputedRow {
  const tba = totalBA(row);
  const oc = openCounter(row);
  const tc = totalCounter(row);
  const sc = tba + tc;
  const vari = row.posCount - sc;
  return {
    productName: row.productName,
    opening: row.opening,
    delivery: row.delivery,
    transfer: row.transfer,
    totalBA: tba,
    openCounter: oc,
    physical: row.physical,
    additional: row.additional,
    totalCounter: tc,
    storeClosing: sc,
    posCount: row.posCount,
    variance: vari,
  };
}
