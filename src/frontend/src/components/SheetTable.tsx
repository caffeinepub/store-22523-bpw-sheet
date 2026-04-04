import { cn } from "@/lib/utils";
import { Check, LayoutList, Pencil, X } from "lucide-react";
import { useRef, useState } from "react";
import type { ComputedRow } from "../lib/calculations";
import type { ProductRow } from "../lib/sheetStorage";

interface SheetTableProps {
  computedRows: ComputedRow[];
  locked: boolean;
  productNames: string[];
  onCellChange: (
    idx: number,
    field: keyof Pick<
      ProductRow,
      "delivery" | "transfer" | "physical" | "additional" | "posCount"
    >,
    value: string,
  ) => void;
  onProductNameChange: (idx: number, newName: string) => void;
  onOpenDeliveryWindow?: () => void;
  onOpenTransferWindow?: () => void;
}

const COL_HEADERS = [
  { label: "Product Name", width: "w-44", align: "text-left" },
  { label: "Opening", width: "w-16", align: "text-center" },
  { label: "Delivery", width: "w-16", align: "text-center" },
  { label: "Transfer", width: "w-16", align: "text-center" },
  { label: "Total BA", width: "w-16", align: "text-center" },
  { label: "Open Counter", width: "w-20", align: "text-center" },
  { label: "Physical", width: "w-16", align: "text-center" },
  { label: "Additional", width: "w-16", align: "text-center" },
  { label: "Total Counter", width: "w-20", align: "text-center" },
  { label: "Store Closing", width: "w-20", align: "text-center" },
  { label: "Product Name", width: "w-44", align: "text-left" },
  { label: "POS Count", width: "w-16", align: "text-center" },
  { label: "Variance", width: "w-16", align: "text-center" },
];

// Indices (0-based) of manual-entry columns
const MANUAL_COL_INDICES = [2, 3, 6, 7, 11];

// Remove spinner arrows from number inputs via inline style
const noSpinnerStyle: React.CSSProperties = {
  MozAppearance: "textfield",
};

function ReadCell({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        "text-[12px] text-muted-foreground font-mono block text-center",
        className,
      )}
    >
      {value}
    </span>
  );
}

function NumberInput({
  value,
  onChange,
  disabled,
  ocid,
}: {
  value: number;
  onChange: (v: string) => void;
  disabled: boolean;
  ocid: string;
}) {
  return (
    <input
      data-ocid={ocid}
      type="number"
      min="0"
      value={value === 0 ? "" : value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="0"
      style={noSpinnerStyle}
      className={cn(
        "w-14 h-7 text-center text-[12px] font-mono border border-input rounded px-1 bg-background",
        "focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary",
        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        disabled &&
          "bg-muted/40 cursor-not-allowed text-muted-foreground border-border",
      )}
    />
  );
}

function EditableProductName({
  name,
  onSave,
}: {
  name: string;
  onSave: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const confirm = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") confirm();
    else if (e.key === "Escape") cancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          className="flex-1 min-w-0 h-6 text-[11px] font-medium border border-primary rounded px-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={confirm}
          className="bpw-edit-btn shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-success/20 text-success"
          title="Save"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={cancel}
          className="bpw-edit-btn shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-destructive/20 text-destructive"
          title="Cancel"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 group min-w-0">
      <span className="font-medium text-[12px] text-foreground truncate">
        {name}
      </span>
      <button
        type="button"
        onClick={startEdit}
        className="bpw-edit-btn shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-opacity"
        title="Edit product name"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function SheetTable({
  computedRows,
  locked,
  productNames,
  onCellChange,
  onProductNameChange,
  onOpenDeliveryWindow,
  onOpenTransferWindow,
}: SheetTableProps) {
  if (computedRows.length === 0) return null;

  const totalOpening = computedRows.reduce((s, r) => s + r.opening, 0);
  const totalDelivery = computedRows.reduce((s, r) => s + r.delivery, 0);
  const totalTransfer = computedRows.reduce((s, r) => s + r.transfer, 0);
  const totalBA = computedRows.reduce((s, r) => s + r.totalBA, 0);
  const totalOpenCounter = computedRows.reduce((s, r) => s + r.openCounter, 0);
  const totalPhysical = computedRows.reduce((s, r) => s + r.physical, 0);
  const totalAdditional = computedRows.reduce((s, r) => s + r.additional, 0);
  const totalCounter = computedRows.reduce((s, r) => s + r.totalCounter, 0);
  const totalStoreClosing = computedRows.reduce(
    (s, r) => s + r.storeClosing,
    0,
  );
  const totalPosCount = computedRows.reduce((s, r) => s + r.posCount, 0);
  const totalVariance = computedRows.reduce((s, r) => s + r.variance, 0);

  return (
    <div className="overflow-x-auto w-full" data-ocid="sheet.table">
      <style>{`
        .bpw-table input[type=number]::-webkit-outer-spin-button,
        .bpw-table input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .bpw-table input[type=number] { -moz-appearance: textfield; }
      `}</style>
      <div className="bpw-table-wrap min-w-max w-full">
        <table className="bpw-table border-collapse text-[12px] w-full">
          <thead>
            <tr>
              {COL_HEADERS.map((col, i) => {
                // Special header for Delivery column (index 2)
                if (i === 2) {
                  return (
                    <th
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed column headers
                      key={i}
                      className={cn(
                        "px-2 py-2 text-[10px] font-bold uppercase tracking-wide border border-border text-foreground/80 whitespace-nowrap",
                        col.align,
                        col.width,
                        "bg-blue-50",
                      )}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{col.label}</span>
                        <button
                          type="button"
                          data-ocid="delivery.open_modal_button"
                          onClick={onOpenDeliveryWindow}
                          title={
                            locked
                              ? "View delivery entries (read-only)"
                              : "Open Delivery Entry Window"
                          }
                          className={cn(
                            "w-4 h-4 flex items-center justify-center rounded transition-colors",
                            locked
                              ? "text-muted-foreground/50 cursor-default"
                              : "text-blue-600 hover:bg-blue-100 hover:text-blue-800 cursor-pointer",
                          )}
                        >
                          <LayoutList className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="block text-[8px] font-normal normal-case tracking-normal text-blue-600 opacity-80 font-semibold">
                        window only
                      </span>
                    </th>
                  );
                }

                // Special header for Transfer column (index 3)
                if (i === 3) {
                  return (
                    <th
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed column headers
                      key={i}
                      className={cn(
                        "px-2 py-2 text-[10px] font-bold uppercase tracking-wide border border-border text-foreground/80 whitespace-nowrap",
                        col.align,
                        col.width,
                        "bg-blue-50",
                      )}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{col.label}</span>
                        <button
                          type="button"
                          data-ocid="transfer.open_modal_button"
                          onClick={onOpenTransferWindow}
                          title={
                            locked
                              ? "View transfer entries (read-only)"
                              : "Open Transfer Entry Window"
                          }
                          className={cn(
                            "w-4 h-4 flex items-center justify-center rounded transition-colors",
                            locked
                              ? "text-muted-foreground/50 cursor-default"
                              : "text-blue-600 hover:bg-blue-100 hover:text-blue-800 cursor-pointer",
                          )}
                        >
                          <LayoutList className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="block text-[8px] font-normal normal-case tracking-normal text-blue-600 opacity-80 font-semibold">
                        window only
                      </span>
                    </th>
                  );
                }

                return (
                  <th
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed column headers
                    key={i}
                    className={cn(
                      "px-2 py-2 text-[10px] font-bold uppercase tracking-wide border border-border text-foreground/80 whitespace-nowrap",
                      col.align,
                      col.width,
                      MANUAL_COL_INDICES.includes(i)
                        ? "bg-blue-50"
                        : "bg-table-header",
                    )}
                  >
                    {col.label}
                    {MANUAL_COL_INDICES.includes(i) && (
                      <span className="block text-[8px] font-normal normal-case tracking-normal text-info opacity-70">
                        manual
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {computedRows.map((row, idx) => {
              const isEven = idx % 2 === 0;
              const displayName = productNames[idx] ?? row.productName;
              const varClass =
                row.variance < 0
                  ? "text-destructive font-semibold"
                  : row.variance > 0
                    ? "text-success font-semibold"
                    : "text-muted-foreground";

              return (
                <tr
                  key={row.productName}
                  data-ocid={`sheet.row.${idx + 1}`}
                  className={cn(
                    "transition-colors hover:bg-primary/5",
                    isEven ? "bg-card" : "bg-muted/20",
                  )}
                >
                  {/* Col 1: Product Name – editable */}
                  <td className="px-2 py-1.5 border border-border whitespace-nowrap max-w-[180px]">
                    <EditableProductName
                      name={displayName}
                      onSave={(newName) => onProductNameChange(idx, newName)}
                    />
                  </td>

                  {/* Col 2: Opening – locked */}
                  <td className="px-2 py-1.5 border border-border text-center">
                    <ReadCell value={row.opening} />
                  </td>

                  {/* Col 3: Delivery – window only */}
                  <td
                    className="px-1 py-1 border border-border text-center bg-blue-50/30 cursor-not-allowed"
                    title="Use Delivery Window to enter values"
                  >
                    <ReadCell
                      value={row.delivery}
                      className="text-foreground/80"
                    />
                  </td>

                  {/* Col 4: Transfer – window only */}
                  <td
                    className="px-1 py-1 border border-border text-center bg-blue-50/30 cursor-not-allowed"
                    title="Use Transfer Window to enter values"
                  >
                    <ReadCell
                      value={row.transfer}
                      className="text-foreground/80"
                    />
                  </td>

                  {/* Col 5: Total BA – locked */}
                  <td className="px-2 py-1.5 border border-border text-center">
                    <ReadCell
                      value={row.totalBA}
                      className="font-semibold text-foreground"
                    />
                  </td>

                  {/* Col 6: Open Counter – locked */}
                  <td className="px-2 py-1.5 border border-border text-center">
                    <ReadCell value={row.openCounter} />
                  </td>

                  {/* Col 7: Physical – manual */}
                  <td className="px-1 py-1 border border-border text-center bg-blue-50/50">
                    <NumberInput
                      value={row.physical}
                      onChange={(v) => onCellChange(idx, "physical", v)}
                      disabled={locked}
                      ocid={`sheet.physical.${idx + 1}`}
                    />
                  </td>

                  {/* Col 8: Additional – manual */}
                  <td className="px-1 py-1 border border-border text-center bg-blue-50/50">
                    <NumberInput
                      value={row.additional}
                      onChange={(v) => onCellChange(idx, "additional", v)}
                      disabled={locked}
                      ocid={`sheet.additional.${idx + 1}`}
                    />
                  </td>

                  {/* Col 9: Total Counter – locked */}
                  <td className="px-2 py-1.5 border border-border text-center">
                    <ReadCell
                      value={row.totalCounter}
                      className="font-semibold text-foreground"
                    />
                  </td>

                  {/* Col 10: Store Closing – locked */}
                  <td className="px-2 py-1.5 border border-border text-center bg-muted/30">
                    <ReadCell
                      value={row.storeClosing}
                      className="font-bold text-foreground"
                    />
                  </td>

                  {/* Col 11: Product Name (repeat) – editable */}
                  <td className="px-2 py-1.5 border border-border whitespace-nowrap max-w-[180px]">
                    <EditableProductName
                      name={displayName}
                      onSave={(newName) => onProductNameChange(idx, newName)}
                    />
                  </td>

                  {/* Col 12: POS Count – manual */}
                  <td className="px-1 py-1 border border-border text-center bg-blue-50/50">
                    <NumberInput
                      value={row.posCount}
                      onChange={(v) => onCellChange(idx, "posCount", v)}
                      disabled={locked}
                      ocid={`sheet.poscount.${idx + 1}`}
                    />
                  </td>

                  {/* Col 13: Variance – locked */}
                  <td
                    className={cn(
                      "px-2 py-1.5 border border-border text-center font-mono text-[12px]",
                      varClass,
                    )}
                  >
                    {row.variance === 0
                      ? "0"
                      : row.variance > 0
                        ? `+${row.variance}`
                        : row.variance}
                  </td>
                </tr>
              );
            })}

            {/* Totals Row */}
            <tr
              className="bg-table-header font-bold"
              data-ocid="sheet.totals.row"
            >
              <td className="px-2 py-2 border border-border text-[11px] font-bold text-foreground uppercase">
                TOTALS
              </td>
              <td className="px-2 py-2 border border-border text-center font-mono text-[11px] text-foreground">
                {totalOpening}
              </td>
              <td className="px-2 py-2 border border-border text-center font-mono text-[11px] text-foreground bg-blue-50/50">
                {totalDelivery}
              </td>
              <td className="px-2 py-2 border border-border text-center font-mono text-[11px] text-foreground bg-blue-50/50">
                {totalTransfer}
              </td>
              <td className="px-2 py-2 border border-border text-center font-mono text-[11px] font-bold text-foreground">
                {totalBA}
              </td>
              <td className="px-2 py-2 border border-border text-center font-mono text-[11px] text-foreground">
                {totalOpenCounter}
              </td>
              <td className="px-2 py-2 border border-border text-center font-mono text-[11px] text-foreground bg-blue-50/50">
                {totalPhysical}
              </td>
              <td className="px-2 py-2 border border-border text-center font-mono text-[11px] text-foreground bg-blue-50/50">
                {totalAdditional}
              </td>
              <td className="px-2 py-2 border border-border text-center font-mono text-[11px] font-bold text-foreground">
                {totalCounter}
              </td>
              <td className="px-2 py-2 border border-border text-center font-mono text-[11px] font-bold text-foreground bg-muted/30">
                {totalStoreClosing}
              </td>
              <td className="px-2 py-2 border border-border text-[11px] font-bold text-foreground uppercase">
                TOTALS
              </td>
              <td className="px-2 py-2 border border-border text-center font-mono text-[11px] text-foreground bg-blue-50/50">
                {totalPosCount}
              </td>
              <td
                className={cn(
                  "px-2 py-2 border border-border text-center font-mono text-[11px] font-bold",
                  totalVariance < 0
                    ? "text-destructive"
                    : totalVariance > 0
                      ? "text-success"
                      : "text-muted-foreground",
                )}
              >
                {totalVariance === 0
                  ? "0"
                  : totalVariance > 0
                    ? `+${totalVariance}`
                    : totalVariance}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
