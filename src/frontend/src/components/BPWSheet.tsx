import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  Lock,
  Printer,
  RotateCcw,
  ShieldAlert,
  StoreIcon,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { computeRow } from "../lib/calculations";
import {
  type DailySheet,
  type ProductRow,
  calcStoreClosing,
  calcTotalCounter,
  getAllSheetDates,
  getLockedDates,
  getOrCreateSheet,
  loadProductNames,
  saveProductNames,
  saveSheet,
} from "../lib/sheetStorage";
import CalendarPanel from "./CalendarPanel";
import SheetTable from "./SheetTable";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function BPWSheet() {
  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [sheet, setSheet] = useState<DailySheet | null>(null);
  const [allDates, setAllDates] = useState<string[]>([]);
  const [lockedDates, setLockedDates] = useState<string[]>([]);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState(false);
  // Admin Reset state
  const [showAdminResetDialog, setShowAdminResetDialog] = useState(false);
  const [adminResetPassword, setAdminResetPassword] = useState("");
  const [adminResetPasswordError, setAdminResetPasswordError] = useState(false);
  const [slicerOpen, setSlicerOpen] = useState(false);
  // Editable product names – persisted in localStorage
  const [productNames, setProductNames] = useState<string[]>(() =>
    loadProductNames(),
  );

  // Load sheet when date changes
  useEffect(() => {
    const names = loadProductNames();
    const s = getOrCreateSheet(selectedDate, names);
    setSheet(s);
    setAllDates(getAllSheetDates());
    setLockedDates(getLockedDates());
  }, [selectedDate]);

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date);
    setSlicerOpen(false);
  }, []);

  const handleProductNameChange = useCallback(
    (idx: number, newName: string) => {
      setProductNames((prev) => {
        const updated = prev.map((n, i) => (i === idx ? newName : n));
        saveProductNames(updated);
        return updated;
      });
      // Also update the product name in the current sheet's rows
      setSheet((prev) => {
        if (!prev) return prev;
        const newRows = prev.rows.map((row, i) =>
          i === idx ? { ...row, productName: newName } : row,
        );
        const updated: DailySheet = { ...prev, rows: newRows };
        saveSheet(updated);
        return updated;
      });
      toast.success("Product name updated");
    },
    [],
  );

  const handleCellChange = useCallback(
    (
      idx: number,
      field: keyof Pick<
        ProductRow,
        "delivery" | "transfer" | "physical" | "additional" | "posCount"
      >,
      value: string,
    ) => {
      if (!sheet || sheet.locked) return;
      const num = Math.max(0, Number.parseFloat(value) || 0);
      setSheet((prev) => {
        if (!prev) return prev;
        const newRows = prev.rows.map((row, i) =>
          i === idx ? { ...row, [field]: num } : row,
        );
        const updated: DailySheet = { ...prev, rows: newRows };
        saveSheet(updated);
        return updated;
      });
    },
    [sheet],
  );

  const handleCloseDay = useCallback(() => {
    if (!sheet || sheet.locked) return;

    // Lock the sheet
    const locked: DailySheet = { ...sheet, locked: true };
    saveSheet(locked);
    setSheet(locked);

    // Compute carry-forward for next day
    const [y, m, d] = selectedDate.split("-").map(Number);
    const nextDateObj = new Date(y, m - 1, d + 1);
    const nextDate = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, "0")}-${String(nextDateObj.getDate()).padStart(2, "0")}`;

    const nextRows: ProductRow[] = locked.rows.map((row) => {
      const sc = calcStoreClosing(row);
      const tc = calcTotalCounter(row);
      return {
        productName: row.productName,
        opening: sc,
        delivery: 0,
        transfer: 0,
        openCounter: tc,
        physical: 0,
        additional: 0,
        posCount: 0,
      };
    });

    const nextSheet: DailySheet = {
      date: nextDate,
      rows: nextRows,
      locked: false,
    };
    saveSheet(nextSheet);

    setLockedDates(getLockedDates());
    setAllDates(getAllSheetDates());
    setShowCloseDialog(false);

    toast.success(
      `Day closed! Closing stock carried forward to ${formatShortDate(nextDate)}`,
    );
  }, [sheet, selectedDate]);

  const handleResetDay = useCallback(() => {
    if (!sheet || sheet.locked) return;

    if (resetPassword !== "225231") {
      setResetPasswordError(true);
      return;
    }

    const resetRows: ProductRow[] = sheet.rows.map((row) => ({
      ...row,
      physical: 0,
      additional: 0,
    }));

    const resetSheet: DailySheet = { ...sheet, rows: resetRows };
    saveSheet(resetSheet);
    setSheet(resetSheet);
    setShowResetDialog(false);
    setResetPassword("");
    setResetPasswordError(false);

    toast.success("Physical & Additional values reset successfully");
  }, [sheet, resetPassword]);

  // Admin Reset: resets entire current open day to zero (all columns)
  const handleAdminReset = useCallback(() => {
    if (!sheet || sheet.locked) return;

    if (adminResetPassword !== "9924827787") {
      setAdminResetPasswordError(true);
      return;
    }

    const names = sheet.rows.map((r) => r.productName);
    const zeroRows: ProductRow[] = names.map((productName) => ({
      productName,
      opening: 0,
      delivery: 0,
      transfer: 0,
      openCounter: 0,
      physical: 0,
      additional: 0,
      posCount: 0,
    }));

    const resetSheet: DailySheet = { ...sheet, rows: zeroRows };
    saveSheet(resetSheet);
    setSheet(resetSheet);
    setShowAdminResetDialog(false);
    setAdminResetPassword("");
    setAdminResetPasswordError(false);

    toast.success("Admin Reset complete — entire day reset to zero");
  }, [sheet, adminResetPassword]);

  const computedRows = sheet ? sheet.rows.map(computeRow) : [];

  const currentYear = new Date().getFullYear();
  const hostname = window.location.hostname;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ─── Header ─── */}
      <header
        className="no-print shrink-0 flex items-center justify-between px-4 py-3 gap-3"
        style={{
          background:
            "linear-gradient(90deg, oklch(0.25 0.1 249), oklch(0.32 0.12 249))",
        }}
      >
        {/* Left: Store branding + Calendar slicer toggle */}
        <div className="flex items-center gap-2.5">
          <Button
            data-ocid="slicer.open_modal_button"
            size="sm"
            variant="outline"
            onClick={() => setSlicerOpen((v) => !v)}
            className="h-8 text-xs gap-1.5 border-white/30 text-white hover:bg-white/10 bg-transparent"
            aria-label="Toggle calendar slicer"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Calendar
          </Button>
          <div className="w-px h-6 bg-white/20" />
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <StoreIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-none">
              Store 22523
            </h1>
            <p className="text-white/60 text-[10px] mt-0.5">BPW Daily Sheet</p>
          </div>
        </div>

        {/* Center: Selected date */}
        <div className="text-center">
          <p className="text-white font-semibold text-sm">
            {formatLongDate(selectedDate)}
          </p>
          {sheet?.locked && (
            <span className="inline-flex items-center gap-1 text-amber-300 text-[10px]">
              <Lock className="w-2.5 h-2.5" /> Sheet Locked
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            data-ocid="sheet.print_button"
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            className="h-8 text-xs gap-1.5 border-white/30 text-white hover:bg-white/10 bg-transparent"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </Button>
          {!sheet?.locked && (
            <Button
              data-ocid="sheet.reset_button"
              size="sm"
              variant="outline"
              onClick={() => setShowResetDialog(true)}
              className="h-8 text-xs gap-1.5 border-red-400/50 text-red-300 hover:bg-red-500/10 bg-transparent"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Day
            </Button>
          )}
          {!sheet?.locked && (
            <Button
              data-ocid="sheet.admin_reset_button"
              size="sm"
              variant="outline"
              onClick={() => setShowAdminResetDialog(true)}
              className="h-8 text-xs gap-1.5 border-orange-400/60 text-orange-300 hover:bg-orange-500/10 bg-transparent"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Admin Reset
            </Button>
          )}
          {!sheet?.locked && (
            <Button
              data-ocid="sheet.close_button"
              size="sm"
              onClick={() => setShowCloseDialog(true)}
              className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0"
            >
              <Lock className="w-3.5 h-3.5" />
              Close Day
            </Button>
          )}
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ─── Calendar Slicer (floating overlay) ─── */}
        <AnimatePresence>
          {slicerOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                key="slicer-backdrop"
                className="no-print fixed inset-0 bg-black/30 z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setSlicerOpen(false)}
                aria-hidden="true"
              />

              {/* Panel */}
              <motion.aside
                key="slicer-panel"
                data-ocid="slicer.panel"
                className="no-print fixed top-0 left-0 h-full z-50 flex flex-col gap-3 p-3 bg-card border-r border-border shadow-2xl overflow-y-auto"
                style={{ width: 220 }}
                initial={{ x: -220 }}
                animate={{ x: 0 }}
                exit={{ x: -220 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                {/* Panel header */}
                <div className="flex items-center justify-between pb-1 border-b border-border">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                    Calendar
                  </span>
                  <button
                    type="button"
                    data-ocid="slicer.close_button"
                    onClick={() => setSlicerOpen(false)}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Close calendar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <CalendarPanel
                  selectedDate={selectedDate}
                  onDateSelect={handleDateSelect}
                  allDates={allDates}
                  lockedDates={lockedDates}
                />

                {/* History list */}
                {lockedDates.length > 0 && (
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-muted/30">
                      <span className="text-[10px] font-bold text-foreground uppercase tracking-wide">
                        Closed Days
                      </span>
                    </div>
                    <ScrollArea className="max-h-48">
                      <div className="divide-y divide-border">
                        {[...lockedDates]
                          .sort((a, b) => b.localeCompare(a))
                          .map((d, idx) => (
                            <button
                              type="button"
                              key={d}
                              data-ocid={`history.item.${idx + 1}`}
                              onClick={() => handleDateSelect(d)}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-muted/50 transition-colors",
                                selectedDate === d && "bg-primary/10",
                              )}
                            >
                              <span className="text-[11px] text-foreground">
                                {formatShortDate(d)}
                              </span>
                              <Lock className="w-2.5 h-2.5 text-success shrink-0" />
                            </button>
                          ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {lockedDates.length === 0 && (
                  <div
                    data-ocid="history.empty_state"
                    className="text-center py-4 px-2"
                  >
                    <p className="text-[10px] text-muted-foreground">
                      No closed days yet.
                    </p>
                  </div>
                )}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main sheet area — always full width */}
        <main className="flex-1 overflow-auto p-4">
          {/* Sheet title for print */}
          <div className="print-only mb-4">
            <h2 className="text-lg font-bold">Store 22523 — BPW Daily Sheet</h2>
            <p className="text-sm text-gray-600">
              {formatLongDate(selectedDate)}
            </p>
            {sheet?.locked && (
              <p className="text-xs text-gray-500">Sheet Status: CLOSED</p>
            )}
          </div>

          {/* Sheet header info */}
          <div className="no-print mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Daily Stock Sheet
              </h2>
              <p className="text-xs text-muted-foreground">
                {productNames.length} products ·{" "}
                {sheet?.locked ? "Locked (read-only)" : "Editable"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-300" />
              <span>Manual entry</span>
              <span className="inline-block w-3 h-3 rounded bg-muted ml-2" />
              <span>Auto-calculated</span>
            </div>
          </div>

          {sheet ? (
            <SheetTable
              computedRows={computedRows}
              locked={sheet.locked}
              productNames={productNames}
              onCellChange={handleCellChange}
              onProductNameChange={handleProductNameChange}
            />
          ) : (
            <div
              data-ocid="sheet.loading_state"
              className="flex items-center justify-center py-24 text-muted-foreground"
            >
              Loading sheet...
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="no-print border-t border-border bg-card px-4 py-2 text-center shrink-0">
        <p className="text-[10px] text-muted-foreground">
          &copy; {currentYear}. Built with &#10084; using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(hostname)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            caffeine.ai
          </a>
        </p>
      </footer>

      {/* Close Day Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent data-ocid="close.dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              Close Day?
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will <strong>lock the sheet</strong> for{" "}
              <strong>{formatLongDate(selectedDate)}</strong> and carry forward
              closing stock to tomorrow as the opening stock. This{" "}
              <strong>cannot be undone</strong>.
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
              onClick={handleCloseDay}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Lock className="w-4 h-4 mr-1.5" />
              Yes, Close Day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Day Dialog */}
      <Dialog
        open={showResetDialog}
        onOpenChange={(open) => {
          setShowResetDialog(open);
          if (!open) {
            setResetPassword("");
            setResetPasswordError(false);
          }
        }}
      >
        <DialogContent data-ocid="reset.dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-red-500" />
              Reset Physical &amp; Additional?
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will clear <strong>Physical</strong> and{" "}
              <strong>Additional</strong> values for{" "}
              <strong>{formatLongDate(selectedDate)}</strong>. This{" "}
              <strong>cannot be undone</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label
              htmlFor="reset-password-input"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Enter Password to Confirm
            </label>
            <input
              id="reset-password-input"
              type="password"
              value={resetPassword}
              onChange={(e) => {
                setResetPassword(e.target.value);
                setResetPasswordError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleResetDay();
              }}
              placeholder="Enter password"
              className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 ${
                resetPasswordError
                  ? "border-red-500 bg-red-50"
                  : "border-gray-300"
              }`}
            />
            {resetPasswordError && (
              <p className="text-red-500 text-xs mt-1">
                Incorrect password. Please try again.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              data-ocid="reset.cancel_button"
              variant="outline"
              onClick={() => {
                setShowResetDialog(false);
                setResetPassword("");
                setResetPasswordError(false);
              }}
            >
              Cancel
            </Button>
            <Button
              data-ocid="reset.confirm_button"
              onClick={handleResetDay}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Reset Dialog */}
      <Dialog
        open={showAdminResetDialog}
        onOpenChange={(open) => {
          setShowAdminResetDialog(open);
          if (!open) {
            setAdminResetPassword("");
            setAdminResetPasswordError(false);
          }
        }}
      >
        <DialogContent data-ocid="admin_reset.dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-orange-500" />
              Admin Reset — Entire Day to Zero?
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will reset <strong>ALL columns</strong> (Opening, Delivery,
              Transfer, Physical, Additional, POS Count, and all calculated
              values) for <strong>{formatLongDate(selectedDate)}</strong> to
              zero. Previously closed days will <strong>not</strong> be
              affected. This <strong>cannot be undone</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label
              htmlFor="admin-reset-password-input"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Enter Admin Password to Confirm
            </label>
            <input
              id="admin-reset-password-input"
              type="password"
              value={adminResetPassword}
              onChange={(e) => {
                setAdminResetPassword(e.target.value);
                setAdminResetPasswordError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdminReset();
              }}
              placeholder="Enter admin password"
              className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                adminResetPasswordError
                  ? "border-red-500 bg-red-50"
                  : "border-gray-300"
              }`}
            />
            {adminResetPasswordError && (
              <p className="text-red-500 text-xs mt-1">
                Incorrect admin password. Please try again.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              data-ocid="admin_reset.cancel_button"
              variant="outline"
              onClick={() => {
                setShowAdminResetDialog(false);
                setAdminResetPassword("");
                setAdminResetPasswordError(false);
              }}
            >
              Cancel
            </Button>
            <Button
              data-ocid="admin_reset.confirm_button"
              onClick={handleAdminReset}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <ShieldAlert className="w-4 h-4 mr-1.5" />
              Yes, Admin Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
