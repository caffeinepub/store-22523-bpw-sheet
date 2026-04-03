import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertCircle, Loader2, Lock, Printer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DailySheet, Product, Session, StockEntry } from "../backend";
import { formatLongDate, getCurrentSessionType } from "../utils/dateUtils";

interface RowData {
  productId: bigint;
  openingStock: number;
  receivedQty: number;
  soldQty: number;
  actualClosing: number;
}

interface ComputedRow extends RowData {
  expectedClosing: number;
  difference: number;
}

function computeRow(row: RowData): ComputedRow {
  const expectedClosing = row.openingStock + row.receivedQty - row.soldQty;
  const difference = expectedClosing - row.actualClosing;
  return { ...row, expectedClosing, difference };
}

function buildRowsFromEntries(
  entries: StockEntry[],
  products: Product[],
): RowData[] {
  return products.map((product) => {
    const entry = entries.find((e) => e.productId === product.id);
    return {
      productId: product.id,
      openingStock: entry?.openingStock ?? 0,
      receivedQty: entry?.receivedQty ?? 0,
      soldQty: entry?.soldQty ?? 0,
      actualClosing: entry?.actualClosing ?? 0,
    };
  });
}

function buildRowsFromOpeningStock(
  openingEntries: StockEntry[],
  products: Product[],
): RowData[] {
  return products.map((product) => {
    const entry = openingEntries.find((e) => e.productId === product.id);
    return {
      productId: product.id,
      openingStock: entry?.actualClosing ?? 0,
      receivedQty: 0,
      soldQty: 0,
      actualClosing: 0,
    };
  });
}

interface DailySheetViewProps {
  date: string;
  products: Product[];
  sheet: DailySheet | null;
  openingStock: StockEntry[];
  isSaving: boolean;
  isClosing: boolean;
  onSaveSession: (session: Session) => void;
  onCloseDay: () => void;
}

export default function DailySheetView({
  date,
  products,
  sheet,
  openingStock,
  isSaving,
  isClosing,
  onSaveSession,
  onCloseDay,
}: DailySheetViewProps) {
  const defaultSession = getCurrentSessionType();
  const [activeTab, setActiveTab] = useState<"AM" | "PM">(defaultSession);
  const [rows, setRows] = useState<RowData[]>([]);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  const isClosed = sheet?.isClosed ?? false;

  const getSessionData = useCallback(
    (sessionType: "AM" | "PM"): StockEntry[] | null => {
      if (!sheet) return null;
      const session = sheet.sessions.find((s) => s.sessionType === sessionType);
      return session?.entries ?? null;
    },
    [sheet],
  );

  // Initialize rows when sheet or activeTab changes
  useEffect(() => {
    if (products.length === 0) return;

    const sessionEntries = getSessionData(activeTab);

    if (sessionEntries) {
      setRows(buildRowsFromEntries(sessionEntries, products));
    } else if (sheet) {
      const otherSession = activeTab === "AM" ? "PM" : "AM";
      const otherEntries = getSessionData(otherSession);
      if (otherEntries) {
        setRows(
          products.map((product) => {
            const other = otherEntries.find((e) => e.productId === product.id);
            return {
              productId: product.id,
              openingStock: other?.openingStock ?? 0,
              receivedQty: 0,
              soldQty: 0,
              actualClosing: 0,
            };
          }),
        );
      } else {
        setRows(buildRowsFromOpeningStock(openingStock, products));
      }
    } else {
      setRows(buildRowsFromOpeningStock(openingStock, products));
    }
  }, [activeTab, sheet, products, openingStock, getSessionData]);

  const updateRow = (
    index: number,
    field: "receivedQty" | "soldQty" | "actualClosing",
    value: string,
  ) => {
    const numValue = Number.parseFloat(value) || 0;
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: numValue } : row)),
    );
  };

  const computedRows = rows.map(computeRow);

  const hasAMData = !!sheet?.sessions.find((s) => s.sessionType === "AM");
  const hasPMData = !!sheet?.sessions.find((s) => s.sessionType === "PM");
  const hasAnySavedSession = hasAMData || hasPMData;

  const handleSave = () => {
    const entries: StockEntry[] = computedRows.map((row) => ({
      productId: row.productId,
      openingStock: row.openingStock,
      receivedQty: row.receivedQty,
      soldQty: row.soldQty,
      actualClosing: row.actualClosing,
    }));
    onSaveSession({
      sessionType: activeTab,
      entries,
      savedAt: BigInt(Date.now()),
    });
  };

  const handleCloseConfirm = () => {
    setShowCloseDialog(false);
    onCloseDay();
  };

  // Totals
  const totals = computedRows.reduce(
    (acc, row) => ({
      openingStock: acc.openingStock + row.openingStock,
      receivedQty: acc.receivedQty + row.receivedQty,
      soldQty: acc.soldQty + row.soldQty,
      expectedClosing: acc.expectedClosing + row.expectedClosing,
      actualClosing: acc.actualClosing + row.actualClosing,
      difference: acc.difference + row.difference,
    }),
    {
      openingStock: 0,
      receivedQty: 0,
      soldQty: 0,
      expectedClosing: 0,
      actualClosing: 0,
      difference: 0,
    },
  );

  return (
    <main className="flex-1 min-w-0">
      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        {/* Sheet Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Store 22523 — BPW Daily Sheet
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {formatLongDate(date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isClosed && (
              <Badge
                className="bg-muted text-muted-foreground gap-1"
                variant="secondary"
              >
                <Lock className="w-3 h-3" />
                Sheet Closed
              </Badge>
            )}
            <Button
              data-ocid="sheet.print_button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5 text-primary border-primary/40 hover:bg-primary/5"
            >
              <Printer className="w-4 h-4" />
              Print
            </Button>
          </div>
        </div>

        {/* Closed Banner */}
        {isClosed && (
          <div
            data-ocid="sheet.closed_banner"
            className="mx-6 mt-4 flex items-center gap-2 bg-info-subtle text-info px-4 py-3 rounded-md border border-info/20"
          >
            <Lock className="w-4 h-4 shrink-0" />
            <p className="text-sm font-medium">
              This sheet is closed and cannot be edited.
            </p>
          </div>
        )}

        {/* Session Tabs */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-0 border-b border-border">
            {(["AM", "PM"] as const).map((tab) => {
              const hasSaved = tab === "AM" ? hasAMData : hasPMData;
              const isActive = activeTab === tab;
              return (
                <button
                  type="button"
                  key={tab}
                  data-ocid={`session.${tab.toLowerCase()}.tab`}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px",
                    isActive
                      ? "border-primary text-primary font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  )}
                >
                  {tab} Session
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold",
                      hasSaved
                        ? "bg-success-subtle text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {hasSaved ? "Saved" : "Pending"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stock Entry Table */}
        <div className="px-6 py-4 overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr className="bg-table-header">
                {[
                  "Product",
                  "Unit",
                  "Opening Stock",
                  "Received",
                  "Sold / Issued",
                  "Expected Closing",
                  "Actual Closing",
                  "Difference",
                ].map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2.5 text-left text-xs font-bold text-foreground/80 border border-border uppercase tracking-wide"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computedRows.map((row, idx) => {
                const product = products.find((p) => p.id === row.productId);
                if (!product) return null;
                const diffIsNegative = row.difference < 0;

                return (
                  <tr
                    key={row.productId.toString()}
                    data-ocid={`sheet.row.${idx + 1}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-2 border border-border font-medium text-foreground">
                      {product.name}
                    </td>
                    <td className="px-3 py-2 border border-border text-muted-foreground">
                      {product.unit}
                    </td>
                    <td className="px-3 py-2 border border-border">
                      <span className="text-foreground font-mono text-xs bg-muted/50 px-2 py-1 rounded">
                        {row.openingStock}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 border border-border">
                      <Input
                        data-ocid={`sheet.received.${idx + 1}`}
                        type="number"
                        min="0"
                        value={row.receivedQty || ""}
                        onChange={(e) =>
                          updateRow(idx, "receivedQty", e.target.value)
                        }
                        disabled={isClosed}
                        placeholder="0"
                        className="h-7 text-xs w-20 disabled:bg-muted/30 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-2 py-1.5 border border-border">
                      <Input
                        data-ocid={`sheet.sold.${idx + 1}`}
                        type="number"
                        min="0"
                        value={row.soldQty || ""}
                        onChange={(e) =>
                          updateRow(idx, "soldQty", e.target.value)
                        }
                        disabled={isClosed}
                        placeholder="0"
                        className="h-7 text-xs w-20 disabled:bg-muted/30 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-3 py-2 border border-border">
                      <span className="text-foreground font-mono text-xs">
                        {row.expectedClosing}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 border border-border">
                      <Input
                        data-ocid={`sheet.actual.${idx + 1}`}
                        type="number"
                        min="0"
                        value={row.actualClosing || ""}
                        onChange={(e) =>
                          updateRow(idx, "actualClosing", e.target.value)
                        }
                        disabled={isClosed}
                        placeholder="0"
                        className="h-7 text-xs w-20 disabled:bg-muted/30 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 border border-border font-mono text-xs font-semibold",
                        diffIsNegative
                          ? "text-destructive bg-destructive/5"
                          : "text-foreground",
                      )}
                    >
                      {diffIsNegative
                        ? `(${Math.abs(row.difference)})`
                        : row.difference}
                    </td>
                  </tr>
                );
              })}

              {/* Totals Row */}
              {computedRows.length > 0 && (
                <tr
                  className="bg-table-header font-bold"
                  data-ocid="sheet.totals.row"
                >
                  <td
                    className="px-3 py-2.5 border border-border text-sm font-bold text-foreground"
                    colSpan={2}
                  >
                    TOTALS
                  </td>
                  <td className="px-3 py-2.5 border border-border font-mono text-xs text-foreground">
                    {totals.openingStock}
                  </td>
                  <td className="px-3 py-2.5 border border-border font-mono text-xs text-foreground">
                    {totals.receivedQty}
                  </td>
                  <td className="px-3 py-2.5 border border-border font-mono text-xs text-foreground">
                    {totals.soldQty}
                  </td>
                  <td className="px-3 py-2.5 border border-border font-mono text-xs text-foreground">
                    {totals.expectedClosing}
                  </td>
                  <td className="px-3 py-2.5 border border-border font-mono text-xs text-foreground">
                    {totals.actualClosing}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 border border-border font-mono text-xs font-bold",
                      totals.difference < 0
                        ? "text-destructive"
                        : "text-foreground",
                    )}
                  >
                    {totals.difference < 0
                      ? `(${Math.abs(totals.difference)})`
                      : totals.difference}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {computedRows.length === 0 && (
            <div
              data-ocid="sheet.loading_state"
              className="flex items-center justify-center py-12 text-muted-foreground"
            >
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading products...
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {!isClosed && (
          <div className="px-6 py-4 border-t border-border flex items-center gap-3 flex-wrap bg-muted/20">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Fill in entries above, then save the session.</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Button
                data-ocid="session.save_button"
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || products.length === 0}
                className="border-primary text-primary hover:bg-primary/5 gap-1.5"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Session"
                )}
              </Button>

              <Button
                data-ocid="sheet.close_button"
                onClick={() => setShowCloseDialog(true)}
                disabled={!hasAnySavedSession || isClosing}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              >
                {isClosing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Closing...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Close &amp; Update
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Close Confirmation Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent data-ocid="close.dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Close & Update Sheet
            </DialogTitle>
            <DialogDescription className="pt-1">
              Are you sure you want to close this sheet for{" "}
              <strong>{formatLongDate(date)}</strong>? This action{" "}
              <strong>cannot be undone</strong> — the sheet will be permanently
              locked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              data-ocid="close.cancel_button"
              variant="outline"
              onClick={() => setShowCloseDialog(false)}
            >
              Cancel
            </Button>
            <Button
              data-ocid="close.confirm_button"
              onClick={handleCloseConfirm}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Lock className="w-4 h-4 mr-1.5" />
              Yes, Close Sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
