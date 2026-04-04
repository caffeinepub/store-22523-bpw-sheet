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
  BarChart2,
  CalendarIcon,
  ClipboardList,
  Download,
  LayoutList,
  Lock,
  LockOpen,
  Printer,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useActor } from "../hooks/useActor";
import {
  getMostRecentLockedSheetFromBackend,
  getOrCreateSheetFromBackend,
  loadAllSheetsFromBackend,
  loadProductNamesFromBackend,
  saveProductNamesToBackend,
  saveSheetToBackend,
} from "../lib/backendStorage";
import { computeRow } from "../lib/calculations";
import {
  DEFAULT_PRODUCTS,
  type DailySheet,
  type FinalizedReportRow,
  type NegativeEntry,
  type ProductRow,
  calcStoreClosing,
  calcTotalBA,
  calcTotalCounter,
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

// ── Category Report helpers ──────────────────────────────────────────────────

type CategoryDef = {
  label: string;
  match: (name: string) => boolean;
};

const CATEGORY_DEFS: CategoryDef[] = [
  {
    label: "Salad",
    match: (n) => n.includes("salad bowl") && n.includes("baggase"),
  },
  {
    label: "Bread",
    match: (n) =>
      n.includes("frozen italian white dough") ||
      n.includes("frozen multi grain dough"),
  },
  {
    label: "Ice Tea",
    match: (n) =>
      n.includes("iced green tea") &&
      (n.includes("mint mojito") || n.includes("peach")),
  },
  {
    label: "Tortilla Wrap",
    match: (n) =>
      (n.includes("multigrain tortilla") || n.includes("spinach tortilla")) &&
      n.includes("11.5"),
  },
  {
    label: "Cookies",
    match: (n) =>
      n.includes("dark chunk cookie") ||
      n.includes("double chunk cookie") ||
      n.includes("oatmeal cookie"),
  },
  {
    label: "Chips",
    match: (n) =>
      (n.includes("opera chips") && n.includes("salt")) ||
      n.includes("assorted nachos"),
  },
  {
    label: "Coca-Cola Cans",
    match: (n) =>
      (n.includes("coca-cola") && n.includes("330ml can")) ||
      (n.includes("coke zero") && n.includes("330ml can")) ||
      (n.includes("fanta") && n.includes("330ml can")) ||
      (n.includes("thums up") && n.includes("330ml can")) ||
      (n.includes("sprite") && n.includes("330ml can")),
  },
  {
    label: "Water Bottles",
    match: (n) => n.includes("schweppes") && n.includes("500ml"),
  },
  {
    label: "Mazza",
    match: (n) => n.includes("maaza") && n.includes("300ml"),
  },
  {
    label: "Minute Maid",
    match: (n) => n.includes("minute maid pulpy orange") && n.includes("300ml"),
  },
  {
    label: "Raw Juice",
    match: (n) =>
      (n.includes("tender coconut water") && n.includes("200 ml")) ||
      (n.includes("choco mint") && n.includes("milkshake")),
  },
];

type CategoryReportRow = {
  label: string;
  variance: number;
  status: "Excess" | "Short" | "Tally";
};

function buildCategoryReport(
  computedRows: ReturnType<typeof computeRow>[],
): CategoryReportRow[] {
  return CATEGORY_DEFS.map((def) => {
    const matched = computedRows.filter((r) =>
      def.match(r.productName.toLowerCase()),
    );
    const variance = matched.reduce((sum, r) => sum + (r.variance ?? 0), 0);
    let status: CategoryReportRow["status"];
    if (variance < 0) status = "Excess";
    else if (variance > 0) status = "Short";
    else status = "Tally";
    return { label: def.label, variance, status };
  });
}

function formatVariance(v: number): string {
  if (v > 0) return `+${v}`;
  if (v < 0) return `${v}`;
  return "0";
}

export default function BPWSheet() {
  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [sheet, setSheet] = useState<DailySheet | null>(() => ({
    date: todayKey(),
    rows: DEFAULT_PRODUCTS.map((name) => ({
      productName: name,
      opening: 0,
      delivery: 0,
      deliveryCells: [0, 0, 0] as [number, number, number],
      transfer: 0,
      transferCells: [0, 0, 0] as [number, number, number],
      openCounter: 0,
      physical: 0,
      additional: 0,
      posCount: 0,
    })),
    locked: false,
  }));
  const [syncStatus, setSyncStatus] = useState<"syncing" | "synced" | "error">(
    "syncing",
  );
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
  // Admin Edit state (unlock a closed/locked sheet)
  const [showAdminEditDialog, setShowAdminEditDialog] = useState(false);
  const [adminEditPassword, setAdminEditPassword] = useState("");
  const [adminEditPasswordError, setAdminEditPasswordError] = useState(false);
  const [slicerOpen, setSlicerOpen] = useState(false);
  // Editable product names – loaded from backend
  const [productNames, setProductNames] = useState<string[]>(DEFAULT_PRODUCTS);
  // Run Report state
  const [showRunReport, setShowRunReport] = useState(false);
  const [runReportStage, setRunReportStage] = useState<"report" | "finalize">(
    "report",
  );
  // Default Qty Set state
  const [showDefaultQtyDialog, setShowDefaultQtyDialog] = useState(false);
  // Delivery Window state
  const [showDeliveryWindow, setShowDeliveryWindow] = useState(false);
  const [deliveryDraft, setDeliveryDraft] = useState<
    [number, number, number][]
  >([]);
  // Transfer Window state
  const [showTransferWindow, setShowTransferWindow] = useState(false);
  const [transferDraft, setTransferDraft] = useState<
    [number, number, number][]
  >([]);
  // Negative entry reason prompt state
  const [pendingReason, setPendingReason] = useState<{
    type: "delivery" | "transfer";
    productIdx: number;
    cellIdx: number;
    qty: number;
  } | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  // Negative reasons for current window draft (key: "type_idx_cell")
  const [draftReasons, setDraftReasons] = useState<Record<string, string>>({});

  // PWA install banner state
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(() => {
    return localStorage.getItem("pwa-banner-dismissed") !== "1";
  });
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const deferredPromptRef = useRef<(Event & { prompt: () => void }) | null>(
    null,
  );

  // Backend actor for cross-device data
  const { actor, isFetching: actorFetching } = useActor();

  // PWA install prompt
  useEffect(() => {
    const iosCheck =
      /iPhone|iPad|iPod/.test(navigator.userAgent) &&
      !(window as Window & typeof globalThis & { MSStream?: unknown }).MSStream;
    setIsIOS(iosCheck);
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as Event & { prompt: () => void };
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Load sheet + product names when date or actor changes.
  // Sheet renders immediately with defaults; backend data updates it silently.
  // biome-ignore lint/correctness/useExhaustiveDependencies: productNames is stable after first load
  useEffect(() => {
    if (!actor || actorFetching) {
      if (actorFetching) setSyncStatus("syncing");
      return;
    }
    let cancelled = false;
    (async () => {
      setSyncStatus("syncing");
      try {
        // Load product names and current sheet in parallel
        const [names, allSheets, sheet] = await Promise.all([
          loadProductNamesFromBackend(actor),
          loadAllSheetsFromBackend(actor),
          getOrCreateSheetFromBackend(actor, selectedDate, productNames),
        ]);
        if (!cancelled) {
          setProductNames(names);
          setAllDates(allSheets.map((sh) => sh.date));
          setLockedDates(
            allSheets.filter((sh) => sh.locked).map((sh) => sh.date),
          );
          setSheet(sheet);
          setSyncStatus("synced");
        }
      } catch (err) {
        console.error("Failed to load sheet:", err);
        // Don't block the sheet -- just show a toast
        if (!cancelled) {
          toast.error("Could not reach server. Using local defaults.");
          setSyncStatus("error");
          // Ensure sheet shows something usable even if server fails
          setSheet(
            (prev) =>
              prev ?? {
                date: selectedDate,
                rows: productNames.map((name) => ({
                  productName: name,
                  opening: 0,
                  delivery: 0,
                  deliveryCells: [0, 0, 0] as [number, number, number],
                  transfer: 0,
                  transferCells: [0, 0, 0] as [number, number, number],
                  openCounter: 0,
                  physical: 0,
                  additional: 0,
                  posCount: 0,
                })),
                locked: false,
              },
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, actor, actorFetching]);

  // Helper to refresh allDates and lockedDates from backend
  const refreshDatesFromBackend = useCallback(async () => {
    if (!actor) return;
    try {
      const allSheets = await loadAllSheetsFromBackend(actor);
      setAllDates(allSheets.map((sh) => sh.date));
      setLockedDates(allSheets.filter((sh) => sh.locked).map((sh) => sh.date));
    } catch (err) {
      console.error("Failed to refresh dates:", err);
    }
  }, [actor]);

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date);
    setSlicerOpen(false);
  }, []);

  const handleProductNameChange = useCallback(
    async (idx: number, newName: string) => {
      if (!actor) return;
      const updatedNames = productNames.map((n, i) =>
        i === idx ? newName : n,
      );
      setProductNames(updatedNames);
      try {
        await saveProductNamesToBackend(actor, updatedNames);
      } catch (err) {
        console.error("Failed to save product names:", err);
        toast.error("Failed to save product name");
        return;
      }
      setSheet((prev) => {
        if (!prev) return prev;
        const newRows = prev.rows.map((row, i) =>
          i === idx ? { ...row, productName: newName } : row,
        );
        return { ...prev, rows: newRows };
      });
      // Save the sheet too with updated product name
      if (sheet) {
        const newRows = sheet.rows.map((row, i) =>
          i === idx ? { ...row, productName: newName } : row,
        );
        const updated: DailySheet = { ...sheet, rows: newRows };
        try {
          await saveSheetToBackend(actor, updated);
        } catch (err) {
          console.error("Failed to save sheet:", err);
        }
      }
      toast.success("Product name updated");
    },
    [actor, productNames, sheet],
  );

  const handleCellChange = useCallback(
    async (
      idx: number,
      field: keyof Pick<
        ProductRow,
        "delivery" | "transfer" | "physical" | "additional" | "posCount"
      >,
      value: string,
    ) => {
      if (!sheet || sheet.locked || !actor) return;
      const num = Math.max(0, Number.parseFloat(value) || 0);
      const newRows = sheet.rows.map((row, i) =>
        i === idx ? { ...row, [field]: num } : row,
      );
      const updated: DailySheet = { ...sheet, rows: newRows };
      setSheet(updated);
      try {
        await saveSheetToBackend(actor, updated);
      } catch (err) {
        console.error("Failed to save sheet:", err);
        toast.error("Failed to save changes");
      }
    },
    [sheet, actor],
  );

  const handleCloseDay = useCallback(async () => {
    if (!sheet || sheet.locked || !actor) return;

    // Lock the sheet — save finalized report at close time
    const report: FinalizedReportRow[] = buildCategoryReport(
      sheet.rows.map(computeRow),
    );
    const locked: DailySheet = {
      ...sheet,
      locked: true,
      finalizedReport: report,
    };
    try {
      await saveSheetToBackend(actor, locked);
    } catch (err) {
      console.error("Failed to save locked sheet:", err);
      toast.error("Failed to close day");
      return;
    }
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
        deliveryCells: [0, 0, 0],
        transfer: 0,
        transferCells: [0, 0, 0],
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
    try {
      await saveSheetToBackend(actor, nextSheet);
    } catch (err) {
      console.error("Failed to save next day sheet:", err);
    }

    await refreshDatesFromBackend();
    setShowCloseDialog(false);

    toast.success(
      `Day closed! Closing stock carried forward to ${formatShortDate(nextDate)}`,
    );
  }, [sheet, selectedDate, actor, refreshDatesFromBackend]);

  const handleResetDay = useCallback(async () => {
    if (!sheet || sheet.locked || !actor) return;

    if (resetPassword !== "225231") {
      setResetPasswordError(true);
      return;
    }

    const resetRows: ProductRow[] = sheet.rows.map((row) => ({
      ...row,
      physical: 0,
      additional: 0,
      posCount: 0,
    }));

    const resetSheet: DailySheet = { ...sheet, rows: resetRows };
    try {
      await saveSheetToBackend(actor, resetSheet);
    } catch (err) {
      console.error("Failed to save reset sheet:", err);
      toast.error("Failed to reset day");
      return;
    }
    setSheet(resetSheet);
    setShowResetDialog(false);
    setResetPassword("");
    setResetPasswordError(false);

    toast.success("Physical, Additional & POS Count values reset successfully");
  }, [sheet, resetPassword, actor]);

  // Admin Reset: resets entire current open day to zero (all columns)
  const handleAdminReset = useCallback(async () => {
    if (!sheet || sheet.locked || !actor) return;

    if (adminResetPassword !== "9924827787") {
      setAdminResetPasswordError(true);
      return;
    }

    const names = sheet.rows.map((r) => r.productName);
    const zeroRows: ProductRow[] = names.map((productName) => ({
      productName,
      opening: 0,
      delivery: 0,
      deliveryCells: [0, 0, 0] as [number, number, number],
      transfer: 0,
      transferCells: [0, 0, 0] as [number, number, number],
      openCounter: 0,
      physical: 0,
      additional: 0,
      posCount: 0,
    }));

    const resetSheet: DailySheet = { ...sheet, rows: zeroRows };
    try {
      await saveSheetToBackend(actor, resetSheet);
    } catch (err) {
      console.error("Failed to save admin reset sheet:", err);
      toast.error("Failed to perform admin reset");
      return;
    }
    setSheet(resetSheet);
    setShowAdminResetDialog(false);
    setAdminResetPassword("");
    setAdminResetPasswordError(false);

    toast.success("Admin Reset complete — entire day reset to zero");
  }, [sheet, adminResetPassword, actor]);

  // Admin Edit: unlock a closed/locked sheet for editing
  const handleAdminEdit = useCallback(async () => {
    if (!sheet || !sheet.locked || !actor) return;

    if (adminEditPassword !== "9924827787") {
      setAdminEditPasswordError(true);
      return;
    }

    const unlocked: DailySheet = { ...sheet, locked: false };
    try {
      await saveSheetToBackend(actor, unlocked);
    } catch (err) {
      console.error("Failed to save unlocked sheet:", err);
      toast.error("Failed to unlock sheet");
      return;
    }
    setSheet(unlocked);
    await refreshDatesFromBackend();
    setShowAdminEditDialog(false);
    setAdminEditPassword("");
    setAdminEditPasswordError(false);

    toast.success("Sheet unlocked for admin editing");
  }, [sheet, adminEditPassword, actor, refreshDatesFromBackend]);

  // Default Qty Set: restore Opening & Open Counter from previous closed day's Total BA & Total Counter
  const handleDefaultQtySet = useCallback(async () => {
    if (!sheet || !actor) return;
    let prev: DailySheet | null;
    try {
      prev = await getMostRecentLockedSheetFromBackend(actor, selectedDate);
    } catch (err) {
      console.error("Failed to get previous sheet:", err);
      toast.error("Failed to fetch previous day data");
      return;
    }
    if (!prev) {
      toast.error("No previous closed day found to restore quantities from.");
      return;
    }
    const updatedRows = sheet.rows.map((row, idx) => {
      const prevRow = prev!.rows[idx];
      if (!prevRow) return row;
      const prevTotalBA = calcTotalBA(prevRow);
      const prevTotalCounter = calcTotalCounter(prevRow);
      return { ...row, opening: prevTotalBA, openCounter: prevTotalCounter };
    });
    const updated: DailySheet = { ...sheet, rows: updatedRows };
    try {
      await saveSheetToBackend(actor, updated);
    } catch (err) {
      console.error("Failed to save sheet:", err);
      toast.error("Failed to save default quantities");
      return;
    }
    setSheet(updated);
    setShowDefaultQtyDialog(false);
    toast.success(
      "Opening & Open Counter restored from previous day's Total BA & Total Counter.",
    );
  }, [sheet, selectedDate, actor]);

  const handleDownloadReportPDF = useCallback(() => {
    document.body.classList.add("print-report-only");
    window.print();
    document.body.classList.remove("print-report-only");
  }, []);

  // Open Delivery Window: populate 3-cell draft from existing deliveryCells or delivery value
  const openDeliveryWindow = useCallback(() => {
    if (!sheet) return;
    setDeliveryDraft(
      sheet.rows.map((r) => r.deliveryCells ?? [r.delivery, 0, 0]) as [
        number,
        number,
        number,
      ][],
    );
    // Load saved reasons for delivery cells
    const reasons: Record<string, string> = {};
    if (sheet.negativeReasons) {
      for (const [k, v] of Object.entries(sheet.negativeReasons)) {
        if (k.startsWith("delivery_")) reasons[k] = v;
      }
    }
    setDraftReasons(reasons);
    setShowDeliveryWindow(true);
  }, [sheet]);

  // Open Transfer Window: populate 3-cell draft from existing transferCells or transfer value
  const openTransferWindow = useCallback(() => {
    if (!sheet) return;
    setTransferDraft(
      sheet.rows.map((r) => r.transferCells ?? [r.transfer, 0, 0]) as [
        number,
        number,
        number,
      ][],
    );
    // Load saved reasons for transfer cells
    const reasons: Record<string, string> = {};
    if (sheet.negativeReasons) {
      for (const [k, v] of Object.entries(sheet.negativeReasons)) {
        if (k.startsWith("transfer_")) reasons[k] = v;
      }
    }
    setDraftReasons(reasons);
    setShowTransferWindow(true);
  }, [sheet]);

  // Helper: build negativeEntries list from current draft + reasons
  const buildNegativeEntries = useCallback(
    (
      type: "delivery" | "transfer",
      draft: [number, number, number][],
      reasons: Record<string, string>,
      existingEntries: NegativeEntry[],
    ): NegativeEntry[] => {
      // Remove old entries of this type, then add new ones
      const kept = existingEntries.filter((e) => e.type !== type);
      const newEntries: NegativeEntry[] = [];
      draft.forEach((cells, productIdx) => {
        cells.forEach((qty, cellIdx) => {
          if (qty < 0) {
            const key = `${type}_${productIdx}_${cellIdx}`;
            newEntries.push({
              type,
              productIdx,
              cellIdx,
              qty,
              reason: reasons[key] ?? "",
            });
          }
        });
      });
      return [...kept, ...newEntries];
    },
    [],
  );

  // Save Delivery Window entries: sum 3 cells, store total + cells + reasons
  const saveDeliveryWindow = useCallback(async () => {
    if (!sheet || sheet.locked || !actor) return;
    const newRows = sheet.rows.map((row, i) => {
      const cells = deliveryDraft[i] ??
        row.deliveryCells ?? [row.delivery, 0, 0];
      const total = cells[0] + cells[1] + cells[2];
      return {
        ...row,
        deliveryCells: cells as [number, number, number],
        delivery: total,
      };
    });
    // Merge reasons: keep transfer reasons, replace delivery reasons
    const existingReasons = sheet.negativeReasons ?? {};
    const cleanedReasons: Record<string, string> = {};
    for (const [k, v] of Object.entries(existingReasons)) {
      if (!k.startsWith("delivery_")) cleanedReasons[k] = v;
    }
    const mergedReasons = { ...cleanedReasons, ...draftReasons };
    const negativeEntries = buildNegativeEntries(
      "delivery",
      deliveryDraft,
      draftReasons,
      sheet.negativeEntries ?? [],
    );
    const updated: DailySheet = {
      ...sheet,
      rows: newRows,
      negativeReasons: mergedReasons,
      negativeEntries,
    };
    try {
      await saveSheetToBackend(actor, updated);
    } catch (err) {
      console.error("Failed to save delivery entries:", err);
      toast.error("Failed to save delivery quantities");
      return;
    }
    setSheet(updated);
    setShowDeliveryWindow(false);
    setDraftReasons({});
    toast.success("Delivery quantities saved");
  }, [sheet, deliveryDraft, draftReasons, buildNegativeEntries, actor]);

  // Save Transfer Window entries: sum 3 cells, store total + cells + reasons
  const saveTransferWindow = useCallback(async () => {
    if (!sheet || sheet.locked || !actor) return;
    const newRows = sheet.rows.map((row, i) => {
      const cells = transferDraft[i] ??
        row.transferCells ?? [row.transfer, 0, 0];
      const total = cells[0] + cells[1] + cells[2];
      return {
        ...row,
        transferCells: cells as [number, number, number],
        transfer: total,
      };
    });
    // Merge reasons: keep delivery reasons, replace transfer reasons
    const existingReasons = sheet.negativeReasons ?? {};
    const cleanedReasons: Record<string, string> = {};
    for (const [k, v] of Object.entries(existingReasons)) {
      if (!k.startsWith("transfer_")) cleanedReasons[k] = v;
    }
    const mergedReasons = { ...cleanedReasons, ...draftReasons };
    const negativeEntries = buildNegativeEntries(
      "transfer",
      transferDraft,
      draftReasons,
      sheet.negativeEntries ?? [],
    );
    const updated: DailySheet = {
      ...sheet,
      rows: newRows,
      negativeReasons: mergedReasons,
      negativeEntries,
    };
    try {
      await saveSheetToBackend(actor, updated);
    } catch (err) {
      console.error("Failed to save transfer entries:", err);
      toast.error("Failed to save transfer quantities");
      return;
    }
    setSheet(updated);
    setShowTransferWindow(false);
    setDraftReasons({});
    toast.success("Transfer quantities saved");
  }, [sheet, transferDraft, draftReasons, buildNegativeEntries, actor]);

  const computedRows = sheet ? sheet.rows.map(computeRow) : [];
  const categoryReport = buildCategoryReport(computedRows);

  const currentYear = new Date().getFullYear();
  const hostname = window.location.hostname;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* ─── PWA Install Banner ─── */}
      {showInstallBanner && (
        <div
          className="no-print flex items-center justify-between gap-3 px-4 py-2.5 text-white text-sm shrink-0"
          style={{
            background:
              "linear-gradient(90deg, oklch(0.25 0.1 249), oklch(0.32 0.12 249))",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
              alt="22523 BPW"
              className="w-8 h-8 object-contain rounded shrink-0"
              style={{ background: "rgba(255,255,255,0.1)" }}
            />
            <div className="min-w-0">
              <span className="font-bold mr-2">22523 BPW</span>
              {isIOS ? (
                <span className="text-white/80 text-xs">
                  To install: tap the share icon and select &apos;Add to Home
                  Screen&apos;
                </span>
              ) : (
                <span className="text-white/80 text-xs">
                  Install this app on your device for quick access
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isIOS && deferredPromptRef.current && (
              <button
                type="button"
                className="px-3 py-1 rounded-md bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition-colors"
                onClick={() => {
                  if (deferredPromptRef.current) {
                    deferredPromptRef.current.prompt();
                    deferredPromptRef.current = null;
                  }
                  setShowInstallBanner(false);
                }}
              >
                Install App
              </button>
            )}
            <button
              type="button"
              className="p-1 rounded hover:bg-white/20 transition-colors"
              onClick={() => {
                localStorage.setItem("pwa-banner-dismissed", "1");
                setShowInstallBanner(false);
              }}
              aria-label="Dismiss install banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* ─── Header ─── */}
      <header
        className="no-print sticky top-0 z-30 shrink-0 flex items-center justify-between px-4 py-3 gap-3"
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
          <img
            src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
            alt="22523 BPW Logo"
            className="w-9 h-9 object-contain rounded-lg"
            style={{ background: "rgba(255,255,255,0.1)" }}
          />
          <div>
            <h1 className="text-white font-bold text-sm leading-none">
              Store 22523
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-white/60 text-[10px]">BPW Daily Sheet · v18</p>
              {syncStatus === "syncing" && (
                <span className="flex items-center gap-0.5 text-[9px] text-yellow-300">
                  <span className="w-1.5 h-1.5 bg-yellow-300 rounded-full animate-pulse" />
                  Syncing
                </span>
              )}
              {syncStatus === "synced" && (
                <span className="flex items-center gap-0.5 text-[9px] text-green-300">
                  <span className="w-1.5 h-1.5 bg-green-300 rounded-full" />
                  Live
                </span>
              )}
              {syncStatus === "error" && (
                <span className="flex items-center gap-0.5 text-[9px] text-red-300">
                  <span className="w-1.5 h-1.5 bg-red-300 rounded-full" />
                  Offline
                </span>
              )}
            </div>
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
          {/* Run Report — always visible */}
          <Button
            data-ocid="sheet.run_report_button"
            size="sm"
            onClick={() => {
              setRunReportStage("report");
              setShowRunReport(true);
            }}
            className="h-8 text-xs gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white border-0"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Run Report
          </Button>
          {/* Default Qty Set — always visible */}
          <Button
            data-ocid="sheet.default_qty_set_button"
            size="sm"
            variant="outline"
            onClick={() => setShowDefaultQtyDialog(true)}
            className="h-8 text-xs gap-1.5 border-teal-400/60 text-teal-300 hover:bg-teal-500/10 bg-transparent"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Default Qty Set
          </Button>
          {sheet?.locked && (
            <Button
              data-ocid="sheet.admin_edit_button"
              size="sm"
              variant="outline"
              onClick={() => setShowAdminEditDialog(true)}
              className="h-8 text-xs gap-1.5 border-emerald-400/60 text-emerald-300 hover:bg-emerald-500/10 bg-transparent"
            >
              <LockOpen className="w-3.5 h-3.5" />
              Admin Edit
            </Button>
          )}
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
            <div className="flex items-center gap-3 mb-2">
              <img
                src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                alt="22523 BPW"
                className="w-12 h-12 object-contain"
              />
              <div>
                <h2 className="text-lg font-bold">
                  Store 22523 — BPW Daily Sheet
                </h2>
                <p className="text-sm text-gray-600">
                  {formatLongDate(selectedDate)}
                </p>
                {sheet?.locked && (
                  <p className="text-xs text-gray-500">Sheet Status: CLOSED</p>
                )}
              </div>
            </div>
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
              onOpenDeliveryWindow={openDeliveryWindow}
              onOpenTransferWindow={openTransferWindow}
            />
          ) : (
            <div
              data-ocid="sheet.loading_state"
              className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground"
            >
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Loading sheet...</p>
            </div>
          )}

          {/* ─── Finalized Report Section ─── */}
          {sheet?.locked &&
            sheet?.finalizedReport &&
            sheet.finalizedReport.length > 0 && (
              <div
                id="finalized-report-section"
                className="mt-8 border border-border rounded-lg overflow-hidden"
              >
                {/* Header row with title + action buttons */}
                <div className="no-print flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-200">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-sm text-indigo-800">
                      Category Report — {formatLongDate(selectedDate)}
                    </span>
                    <span className="text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                      Finalized
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      data-ocid="finalized_report.print_button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => window.print()}
                    >
                      <Printer className="w-3 h-3" /> Print
                    </Button>
                    <Button
                      data-ocid="finalized_report.download_button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={handleDownloadReportPDF}
                    >
                      <Download className="w-3 h-3" /> Download PDF
                    </Button>
                  </div>
                </div>
                {/* Print-only header for this section */}
                <div className="print-only px-4 py-3 border-b border-gray-200 flex items-center gap-3">
                  <img
                    src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                    alt="22523 BPW"
                    className="w-10 h-10 object-contain"
                  />
                  <div>
                    <h3 className="font-bold text-base">
                      Category Report — {formatLongDate(selectedDate)}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Store 22523 · BPW Daily Sheet · Finalized
                    </p>
                  </div>
                </div>
                {/* Report table */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="px-4 py-2.5 text-left font-semibold text-foreground text-xs uppercase tracking-wide">
                        Categories
                      </th>
                      <th className="px-4 py-2.5 text-center font-semibold text-foreground text-xs uppercase tracking-wide">
                        Variance (+/−)
                      </th>
                      <th className="px-4 py-2.5 text-center font-semibold text-foreground text-xs uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sheet.finalizedReport.map((row) => (
                      <tr key={row.label} className="hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium text-foreground">
                          {row.label}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2 text-center font-mono font-semibold",
                            row.variance < 0
                              ? "text-red-600"
                              : row.variance > 0
                                ? "text-amber-600"
                                : "text-green-600",
                          )}
                        >
                          {formatVariance(row.variance)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span
                            className={cn(
                              "inline-block px-2.5 py-0.5 rounded-full text-xs font-bold",
                              row.status === "Excess" &&
                                "bg-red-100 text-red-700",
                              row.status === "Short" &&
                                "bg-amber-100 text-amber-700",
                              row.status === "Tally" &&
                                "bg-green-100 text-green-700",
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* ── Loan / BA Transfer Summary ── */}
                {sheet.negativeEntries && sheet.negativeEntries.length > 0 && (
                  <div className="border-t border-border mt-0">
                    <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                      <span className="font-bold text-sm text-red-800">
                        Loan / BA Transfer Summary
                      </span>
                      <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                        Negative Entries
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-red-50/60">
                          <th className="px-4 py-2 text-left text-xs font-semibold text-red-800 uppercase tracking-wide">
                            Product
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-red-800 uppercase tracking-wide">
                            Type
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-red-800 uppercase tracking-wide">
                            Entry #
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-red-800 uppercase tracking-wide">
                            Qty
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-red-800 uppercase tracking-wide">
                            Reason
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {sheet.negativeEntries.map((entry, ei) => (
                          <tr
                            key={`${entry.type}_${entry.productIdx}_${entry.cellIdx}_${ei}`}
                            className="hover:bg-red-50/40"
                          >
                            <td className="px-4 py-2 text-sm font-medium text-foreground">
                              {productNames[entry.productIdx] ??
                                `Product ${entry.productIdx + 1}`}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span
                                className={cn(
                                  "inline-block px-2 py-0.5 rounded text-xs font-semibold",
                                  entry.type === "delivery"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-purple-100 text-purple-700",
                                )}
                              >
                                {entry.type === "delivery"
                                  ? "Delivery"
                                  : "Transfer"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center text-sm text-muted-foreground">
                              Entry {entry.cellIdx + 1}
                            </td>
                            <td className="px-4 py-2 text-center font-mono font-bold text-red-600">
                              {entry.qty}
                            </td>
                            <td className="px-4 py-2 text-sm text-foreground">
                              {entry.reason || (
                                <span className="text-muted-foreground italic">
                                  No reason given
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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

      {/* ─── Run Report Dialog ─── */}
      <Dialog
        open={showRunReport}
        onOpenChange={(open) => {
          setShowRunReport(open);
          if (!open) setRunReportStage("report");
        }}
      >
        <DialogContent data-ocid="run_report.dialog" className="sm:max-w-lg">
          {runReportStage === "report" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <img
                    src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                    alt=""
                    className="w-6 h-6 object-contain opacity-80"
                  />
                  <BarChart2 className="w-5 h-5 text-indigo-500" />
                  Category Report
                </DialogTitle>
                <DialogDescription>
                  Variance summary for {formatLongDate(selectedDate)}
                </DialogDescription>
              </DialogHeader>

              {/* Category Report Table */}
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="px-3 py-2.5 text-left font-semibold text-foreground text-xs uppercase tracking-wide">
                        Categories
                      </th>
                      <th className="px-3 py-2.5 text-center font-semibold text-foreground text-xs uppercase tracking-wide">
                        Variance (+/−)
                      </th>
                      <th className="px-3 py-2.5 text-center font-semibold text-foreground text-xs uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {categoryReport.map((row, idx) => (
                      <tr
                        key={row.label}
                        data-ocid={`run_report.item.${idx + 1}`}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-3 py-2 font-medium text-foreground">
                          {row.label}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-center font-mono font-semibold",
                            row.variance < 0
                              ? "text-red-600"
                              : row.variance > 0
                                ? "text-amber-600"
                                : "text-green-600",
                          )}
                        >
                          {formatVariance(row.variance)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={cn(
                              "inline-block px-2.5 py-0.5 rounded-full text-xs font-bold",
                              row.status === "Excess" &&
                                "bg-red-100 text-red-700",
                              row.status === "Short" &&
                                "bg-amber-100 text-amber-700",
                              row.status === "Tally" &&
                                "bg-green-100 text-green-700",
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  data-ocid="run_report.cancel_button"
                  variant="outline"
                  onClick={() => {
                    setShowRunReport(false);
                    setRunReportStage("report");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  data-ocid="run_report.finalize_button"
                  onClick={() => setRunReportStage("finalize")}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white"
                >
                  <BarChart2 className="w-4 h-4 mr-1.5" />
                  Finalize Report
                </Button>
              </DialogFooter>
            </>
          ) : (
            /* Stage 2: Finalize */
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <img
                    src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                    alt=""
                    className="w-6 h-6 object-contain opacity-80"
                  />
                  <Lock className="w-5 h-5 text-amber-500" />
                  Finalize Report
                </DialogTitle>
                <DialogDescription>
                  {sheet?.locked
                    ? "This day has already been closed."
                    : "Choose to edit the sheet or close the day."}
                </DialogDescription>
              </DialogHeader>

              <div className="py-3">
                {sheet?.locked ? (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0" />
                    The day is already closed. No further changes can be made
                    until an admin edit is done.
                  </div>
                ) : (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <p className="font-medium mb-1">Ready to close this day?</p>
                    <p className="text-xs">
                      Selecting <strong>Close Day</strong> will lock the sheet
                      permanently and carry forward closing stock to the next
                      day. This cannot be undone.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                {sheet?.locked ? (
                  <Button
                    data-ocid="run_report.done_button"
                    onClick={() => {
                      setShowRunReport(false);
                      setRunReportStage("report");
                    }}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white"
                  >
                    Done
                  </Button>
                ) : (
                  <>
                    <Button
                      data-ocid="run_report.edit_button"
                      variant="outline"
                      onClick={() => {
                        setShowRunReport(false);
                        setRunReportStage("report");
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      data-ocid="run_report.close_day_button"
                      onClick={() => {
                        handleCloseDay();
                        setShowRunReport(false);
                        setRunReportStage("report");
                      }}
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      <Lock className="w-4 h-4 mr-1.5" />
                      Close Day
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Close Day Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent data-ocid="close.dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img
                src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                alt=""
                className="w-6 h-6 object-contain opacity-80"
              />
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
              <img
                src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                alt=""
                className="w-6 h-6 object-contain opacity-80"
              />
              <RotateCcw className="w-5 h-5 text-red-500" />
              Reset Physical, Additional &amp; POS Count?
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will clear <strong>Physical</strong>,{" "}
              <strong>Additional</strong>, and <strong>POS Count</strong> values
              for <strong>{formatLongDate(selectedDate)}</strong>. This{" "}
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
              <img
                src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                alt=""
                className="w-6 h-6 object-contain opacity-80"
              />
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

      {/* Admin Edit Dialog — unlock a closed/locked sheet */}
      <Dialog
        open={showAdminEditDialog}
        onOpenChange={(open) => {
          setShowAdminEditDialog(open);
          if (!open) {
            setAdminEditPassword("");
            setAdminEditPasswordError(false);
          }
        }}
      >
        <DialogContent data-ocid="admin_edit.dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img
                src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                alt=""
                className="w-6 h-6 object-contain opacity-80"
              />
              <LockOpen className="w-5 h-5 text-emerald-500" />
              Admin Edit — Unlock Closed Sheet
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will <strong>unlock</strong> the closed sheet for{" "}
              <strong>{formatLongDate(selectedDate)}</strong> and allow editing.
              Enter the admin password to proceed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label
              htmlFor="admin-edit-password-input"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Enter Admin Password
            </label>
            <input
              id="admin-edit-password-input"
              type="password"
              value={adminEditPassword}
              onChange={(e) => {
                setAdminEditPassword(e.target.value);
                setAdminEditPasswordError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdminEdit();
              }}
              placeholder="Enter admin password"
              className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                adminEditPasswordError
                  ? "border-red-500 bg-red-50"
                  : "border-gray-300"
              }`}
            />
            {adminEditPasswordError && (
              <p className="text-red-500 text-xs mt-1">
                Incorrect admin password. Please try again.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              data-ocid="admin_edit.cancel_button"
              variant="outline"
              onClick={() => {
                setShowAdminEditDialog(false);
                setAdminEditPassword("");
                setAdminEditPasswordError(false);
              }}
            >
              Cancel
            </Button>
            <Button
              data-ocid="admin_edit.confirm_button"
              onClick={handleAdminEdit}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <LockOpen className="w-4 h-4 mr-1.5" />
              Unlock for Editing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Default Qty Set Dialog */}
      <Dialog
        open={showDefaultQtyDialog}
        onOpenChange={setShowDefaultQtyDialog}
      >
        <DialogContent data-ocid="default_qty.dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img
                src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                alt=""
                className="w-6 h-6 object-contain opacity-80"
              />
              <ClipboardList className="w-5 h-5 text-teal-500" />
              Default Qty Set — Restore from Previous Day?
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will set <strong>Opening</strong> and{" "}
              <strong>Open Counter</strong> for{" "}
              <strong>{formatLongDate(selectedDate)}</strong> using the{" "}
              <strong>Total BA</strong> and <strong>Total Counter</strong>{" "}
              values from the previous closed day. All other columns (Delivery,
              Transfer, Physical, Additional, POS Count) will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDefaultQtyDialog(false)}
            >
              Cancel
            </Button>
            <Button
              data-ocid="default_qty.confirm_button"
              onClick={handleDefaultQtySet}
              className="bg-teal-500 hover:bg-teal-600 text-white"
            >
              <ClipboardList className="w-4 h-4 mr-1.5" />
              Yes, Set Default Qty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Negative Entry Reason Dialog ─── */}
      <Dialog
        open={pendingReason !== null}
        onOpenChange={(open) => {
          if (!open) {
            // If user dismisses without saving, clear the pending reason
            setPendingReason(null);
            setReasonDraft("");
          }
        }}
      >
        <DialogContent
          data-ocid="negative_reason.dialog"
          className="sm:max-w-sm"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <img
                src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                alt=""
                className="w-6 h-6 object-contain opacity-80"
              />
              <ShieldAlert className="w-5 h-5" />
              Negative Entry — Reason Required
            </DialogTitle>
            <DialogDescription>
              You entered{" "}
              <span className="font-mono font-bold text-red-600">
                {pendingReason?.qty}
              </span>{" "}
              for{" "}
              <span className="font-semibold">
                {pendingReason ? productNames[pendingReason.productIdx] : ""}
              </span>{" "}
              ({pendingReason?.type === "delivery" ? "Delivery" : "Transfer"}{" "}
              Entry {(pendingReason?.cellIdx ?? 0) + 1}).
              <br />
              Please provide a reason (e.g. Loan given to another store).
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <textarea
              rows={3}
              placeholder="e.g. Loan given to Store 22524 — to be returned"
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400 focus:border-red-400 resize-none"
            />
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => {
                setPendingReason(null);
                setReasonDraft("");
              }}
            >
              Skip
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!reasonDraft.trim()}
              onClick={() => {
                if (!pendingReason) return;
                const key = `${pendingReason.type}_${pendingReason.productIdx}_${pendingReason.cellIdx}`;
                setDraftReasons((prev) => ({
                  ...prev,
                  [key]: reasonDraft.trim(),
                }));
                setPendingReason(null);
                setReasonDraft("");
              }}
            >
              Save Reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delivery Window Dialog ─── */}
      <Dialog
        open={showDeliveryWindow}
        onOpenChange={(open) => setShowDeliveryWindow(open)}
      >
        <DialogContent data-ocid="delivery.dialog" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img
                src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                alt=""
                className="w-6 h-6 object-contain opacity-80"
              />
              <LayoutList className="w-5 h-5 text-blue-500" />
              Delivery Entry — {formatLongDate(selectedDate)}
            </DialogTitle>
            <DialogDescription>
              3 entry slots per product. Negative values indicate loans given
              from BA area. Total is saved to the sheet.
            </DialogDescription>
          </DialogHeader>

          {sheet?.locked && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              Day is closed. Open with Admin Edit to make changes.
            </div>
          )}

          {/* Column headers */}
          <div className="flex items-center gap-2 px-3 pb-1 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground flex-1 min-w-0">
              Product
            </span>
            <span className="text-xs font-semibold text-muted-foreground w-16 text-center">
              Entry 1
            </span>
            <span className="text-xs font-semibold text-muted-foreground w-16 text-center">
              Entry 2
            </span>
            <span className="text-xs font-semibold text-muted-foreground w-16 text-center">
              Entry 3
            </span>
            <span className="text-xs font-semibold text-blue-600 w-16 text-center">
              Total
            </span>
          </div>

          <ScrollArea className="max-h-[55vh]">
            <div className="pr-3">
              {productNames.map((name, idx) => {
                const cells = deliveryDraft[idx] ?? [0, 0, 0];
                const rowTotal =
                  (cells[0] || 0) + (cells[1] || 0) + (cells[2] || 0);
                const rowHasNegative = cells.some((c) => c < 0);
                return (
                  <div
                    key={name}
                    data-ocid={`delivery.item.${idx + 1}`}
                    className={cn(
                      "px-3 py-1.5 rounded",
                      idx % 2 === 0 ? "bg-muted/30" : "bg-transparent",
                      rowHasNegative && "ring-1 ring-red-200",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm text-foreground flex-1 min-w-0 leading-tight truncate"
                        title={name}
                      >
                        {name}
                      </span>
                      {([0, 1, 2] as const).map((cellIdx) => {
                        const key = `delivery_${idx}_${cellIdx}`;
                        const isNeg = (cells[cellIdx] ?? 0) < 0;
                        return (
                          <div
                            key={cellIdx}
                            className="flex flex-col items-center gap-0.5"
                          >
                            <input
                              type="number"
                              placeholder="0"
                              disabled={sheet?.locked ?? true}
                              value={cells[cellIdx] === 0 ? "" : cells[cellIdx]}
                              onChange={(e) => {
                                const val =
                                  Number.parseFloat(e.target.value) || 0;
                                setDeliveryDraft((prev) => {
                                  const next = prev.map(
                                    (c) => [...c] as [number, number, number],
                                  );
                                  if (!next[idx]) next[idx] = [0, 0, 0];
                                  next[idx][cellIdx] = val;
                                  return next;
                                });
                              }}
                              onBlur={(e) => {
                                const val =
                                  Number.parseFloat(e.target.value) || 0;
                                if (val < 0 && !(sheet?.locked ?? true)) {
                                  setPendingReason({
                                    type: "delivery",
                                    productIdx: idx,
                                    cellIdx,
                                    qty: val,
                                  });
                                  setReasonDraft(draftReasons[key] ?? "");
                                }
                              }}
                              style={
                                {
                                  MozAppearance: "textfield",
                                } as React.CSSProperties
                              }
                              className={cn(
                                "w-16 h-8 text-center text-sm font-mono border border-input rounded px-1 bg-background",
                                "focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400",
                                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                isNeg &&
                                  "text-red-600 border-red-300 bg-red-50",
                                (sheet?.locked ?? true) &&
                                  "bg-muted/40 cursor-not-allowed text-muted-foreground border-border",
                              )}
                            />
                          </div>
                        );
                      })}
                      <span
                        className={cn(
                          "w-16 h-8 flex items-center justify-center text-sm font-mono font-semibold rounded border",
                          rowTotal < 0
                            ? "text-red-600 bg-red-50 border-red-200"
                            : rowTotal > 0
                              ? "text-blue-700 bg-blue-50 border-blue-200"
                              : "text-muted-foreground bg-muted/20 border-border",
                        )}
                      >
                        {rowTotal}
                      </span>
                    </div>
                    {/* Show reasons for negative cells */}
                    {rowHasNegative && (
                      <div className="mt-1 ml-1 space-y-0.5">
                        {([0, 1, 2] as const).map((cellIdx) => {
                          const key = `delivery_${idx}_${cellIdx}`;
                          const reason = draftReasons[key];
                          if ((cells[cellIdx] ?? 0) >= 0 || !reason)
                            return null;
                          return (
                            <p
                              key={cellIdx}
                              className="text-[10px] text-red-600 leading-tight"
                            >
                              Entry {cellIdx + 1} ({cells[cellIdx]}): {reason}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            {sheet?.locked ? (
              <Button
                data-ocid="delivery.close_button"
                variant="outline"
                onClick={() => setShowDeliveryWindow(false)}
              >
                Close
              </Button>
            ) : (
              <>
                <Button
                  data-ocid="delivery.cancel_button"
                  variant="outline"
                  onClick={() => setShowDeliveryWindow(false)}
                >
                  Cancel
                </Button>
                <Button
                  data-ocid="delivery.save_button"
                  onClick={saveDeliveryWindow}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <LayoutList className="w-4 h-4 mr-1.5" />
                  Save Delivery
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Transfer Window Dialog ─── */}
      <Dialog
        open={showTransferWindow}
        onOpenChange={(open) => setShowTransferWindow(open)}
      >
        <DialogContent data-ocid="transfer.dialog" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img
                src="/assets/s_logo_transparent-019d5459-8b2e-75da-8df6-82f8ce38593e.png"
                alt=""
                className="w-6 h-6 object-contain opacity-80"
              />
              <LayoutList className="w-5 h-5 text-purple-500" />
              Transfer Entry — {formatLongDate(selectedDate)}
            </DialogTitle>
            <DialogDescription>
              3 entry slots per product. Negative values indicate loans given
              from BA area. Total is saved to the sheet.
            </DialogDescription>
          </DialogHeader>

          {sheet?.locked && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              Day is closed. Open with Admin Edit to make changes.
            </div>
          )}

          {/* Column headers */}
          <div className="flex items-center gap-2 px-3 pb-1 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground flex-1 min-w-0">
              Product
            </span>
            <span className="text-xs font-semibold text-muted-foreground w-16 text-center">
              Entry 1
            </span>
            <span className="text-xs font-semibold text-muted-foreground w-16 text-center">
              Entry 2
            </span>
            <span className="text-xs font-semibold text-muted-foreground w-16 text-center">
              Entry 3
            </span>
            <span className="text-xs font-semibold text-purple-600 w-16 text-center">
              Total
            </span>
          </div>

          <ScrollArea className="max-h-[55vh]">
            <div className="pr-3">
              {productNames.map((name, idx) => {
                const cells = transferDraft[idx] ?? [0, 0, 0];
                const rowTotal =
                  (cells[0] || 0) + (cells[1] || 0) + (cells[2] || 0);
                const rowHasNegative = cells.some((c) => c < 0);
                return (
                  <div
                    key={name}
                    data-ocid={`transfer.item.${idx + 1}`}
                    className={cn(
                      "px-3 py-1.5 rounded",
                      idx % 2 === 0 ? "bg-muted/30" : "bg-transparent",
                      rowHasNegative && "ring-1 ring-red-200",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm text-foreground flex-1 min-w-0 leading-tight truncate"
                        title={name}
                      >
                        {name}
                      </span>
                      {([0, 1, 2] as const).map((cellIdx) => {
                        const key = `transfer_${idx}_${cellIdx}`;
                        const isNeg = (cells[cellIdx] ?? 0) < 0;
                        return (
                          <div
                            key={cellIdx}
                            className="flex flex-col items-center gap-0.5"
                          >
                            <input
                              type="number"
                              placeholder="0"
                              disabled={sheet?.locked ?? true}
                              value={cells[cellIdx] === 0 ? "" : cells[cellIdx]}
                              onChange={(e) => {
                                const val =
                                  Number.parseFloat(e.target.value) || 0;
                                setTransferDraft((prev) => {
                                  const next = prev.map(
                                    (c) => [...c] as [number, number, number],
                                  );
                                  if (!next[idx]) next[idx] = [0, 0, 0];
                                  next[idx][cellIdx] = val;
                                  return next;
                                });
                              }}
                              onBlur={(e) => {
                                const val =
                                  Number.parseFloat(e.target.value) || 0;
                                if (val < 0 && !(sheet?.locked ?? true)) {
                                  setPendingReason({
                                    type: "transfer",
                                    productIdx: idx,
                                    cellIdx,
                                    qty: val,
                                  });
                                  setReasonDraft(draftReasons[key] ?? "");
                                }
                              }}
                              style={
                                {
                                  MozAppearance: "textfield",
                                } as React.CSSProperties
                              }
                              className={cn(
                                "w-16 h-8 text-center text-sm font-mono border border-input rounded px-1 bg-background",
                                "focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400",
                                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                isNeg &&
                                  "text-red-600 border-red-300 bg-red-50",
                                (sheet?.locked ?? true) &&
                                  "bg-muted/40 cursor-not-allowed text-muted-foreground border-border",
                              )}
                            />
                          </div>
                        );
                      })}
                      <span
                        className={cn(
                          "w-16 h-8 flex items-center justify-center text-sm font-mono font-semibold rounded border",
                          rowTotal < 0
                            ? "text-red-600 bg-red-50 border-red-200"
                            : rowTotal > 0
                              ? "text-purple-700 bg-purple-50 border-purple-200"
                              : "text-muted-foreground bg-muted/20 border-border",
                        )}
                      >
                        {rowTotal}
                      </span>
                    </div>
                    {/* Show reasons for negative cells */}
                    {rowHasNegative && (
                      <div className="mt-1 ml-1 space-y-0.5">
                        {([0, 1, 2] as const).map((cellIdx) => {
                          const key = `transfer_${idx}_${cellIdx}`;
                          const reason = draftReasons[key];
                          if ((cells[cellIdx] ?? 0) >= 0 || !reason)
                            return null;
                          return (
                            <p
                              key={cellIdx}
                              className="text-[10px] text-red-600 leading-tight"
                            >
                              Entry {cellIdx + 1} ({cells[cellIdx]}): {reason}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            {sheet?.locked ? (
              <Button
                data-ocid="transfer.close_button"
                variant="outline"
                onClick={() => setShowTransferWindow(false)}
              >
                Close
              </Button>
            ) : (
              <>
                <Button
                  data-ocid="transfer.cancel_button"
                  variant="outline"
                  onClick={() => setShowTransferWindow(false)}
                >
                  Cancel
                </Button>
                <Button
                  data-ocid="transfer.save_button"
                  onClick={saveTransferWindow}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <LayoutList className="w-4 h-4 mr-1.5" />
                  Save Transfer
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
