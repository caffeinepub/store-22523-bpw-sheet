import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface ProductRow {
    opening: number;
    productName: string;
    delivery: number;
    transferCells: Array<number>;
    openCounter: number;
    additional: number;
    physical: number;
    transfer: number;
    posCount: number;
    deliveryCells: Array<number>;
}
export interface ProductNameKey {
    index: bigint;
}
export interface ProductNameEntry {
    key: ProductNameKey;
    value: ProductNameValue;
}
export interface DailySheet {
    negativeEntries: Array<NegativeEntry>;
    date: string;
    rows: Array<ProductRow>;
    locked: boolean;
    negativeReasons: Array<[string, string]>;
    finalizedReport?: Array<ReportRow>;
}
export interface NegativeEntry {
    entryType: string;
    cellIndex: bigint;
    quantity: number;
    productIndex: bigint;
    reason: string;
}
export interface SheetEntry {
    key: SheetKey;
    value: SheetValue;
}
export interface SheetKey {
    date: string;
}
export interface ReportRow {
    status: string;
    reportLabel: string;
    variance: number;
}
export interface SheetValue {
    sheet: DailySheet;
}
export interface ProductNameValue {
    name: string;
}
export interface backendInterface {
    getNegativeEntries(date: string): Promise<Array<NegativeEntry> | null>;
    getProductName(index: bigint): Promise<string | null>;
    loadAllSheets(): Promise<Array<SheetEntry>>;
    loadProductNames(): Promise<Array<ProductNameEntry>>;
    loadSheet(date: string): Promise<DailySheet | null>;
    lockSheet(date: string): Promise<boolean>;
    saveProductNames(names: Array<string>): Promise<void>;
    saveSheet(sheet: DailySheet): Promise<void>;
}
