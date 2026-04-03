import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Session {
    sessionType: string;
    entries: Array<StockEntry>;
    savedAt: bigint;
}
export interface DailySheet {
    date: string;
    isClosed: boolean;
    closedAt?: bigint;
    sessions: Array<Session>;
}
export interface Product {
    id: bigint;
    name: string;
    unit: string;
}
export interface StockEntry {
    receivedQty: number;
    productId: bigint;
    actualClosing: number;
    soldQty: number;
    openingStock: number;
}
export interface backendInterface {
    closeDay(date: string): Promise<void>;
    getAllStockForDay(date: string): Promise<Array<StockEntry>>;
    getClosedDates(): Promise<Array<string>>;
    getDailySheet(date: string): Promise<DailySheet | null>;
    getDaysByStatus(isClosed: boolean): Promise<Array<string>>;
    getDiffForDay(date: string): Promise<Array<StockEntry>>;
    getOpeningStockForNewDay(date: string): Promise<Array<StockEntry>>;
    getProducts(): Promise<Array<Product>>;
    initializeProducts(): Promise<void>;
    saveSession(date: string, session: Session): Promise<void>;
}
