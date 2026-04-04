import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { ParsedCSVTemplate } from "../lib/storeClosingReport";
import { parseCSVTemplate } from "../lib/storeClosingReport";
import {
  dateToString,
  formatDisplayDate,
  getDaysInMonth,
  getFirstDayOfMonth,
  stringToDate,
} from "../utils/dateUtils";

interface SidebarProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  closedDates: string[];
  csvTemplate: ParsedCSVTemplate | null;
  onCSVTemplateChange: (template: ParsedCSVTemplate | null) => void;
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function Sidebar({
  selectedDate,
  onDateSelect,
  closedDates,
  csvTemplate,
  onCSVTemplateChange,
}: SidebarProps) {
  const today = new Date();
  const todayStr = dateToString(today);

  const selectedDateObj = stringToDate(selectedDate);
  const [calYear, setCalYear] = useState<number>(() =>
    selectedDateObj.getFullYear(),
  );
  const [calMonth, setCalMonth] = useState<number>(() =>
    selectedDateObj.getMonth(),
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDayOfWeek = getFirstDayOfMonth(calYear, calMonth);

  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString(
    "en-US",
    {
      month: "long",
      year: "numeric",
    },
  );

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  // Build calendar day cells
  const dayCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) dayCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) dayCells.push(d);

  const sortedClosedDates = [...closedDates].sort((a, b) => b.localeCompare(a));

  // Handle CSV template file upload
  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSVTemplate(text);
      if (!parsed) {
        toast.error(
          "Could not read the CSV template. Make sure it has a header row and at least one data row.",
        );
        return;
      }
      onCSVTemplateChange(parsed);
      toast.success(
        `Template loaded: ${parsed.headers.length} columns, ${parsed.rows.length} products`,
      );
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-uploaded
    e.target.value = "";
  };

  const handleRemoveTemplate = () => {
    onCSVTemplateChange(null);
    toast.success("Template removed. Downloads will use the built-in format.");
  };

  return (
    <aside className="w-[300px] shrink-0 flex flex-col gap-4 no-print">
      {/* Calendar Card */}
      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        {/* Calendar Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <button
            type="button"
            data-ocid="calendar.pagination_prev"
            onClick={prevMonth}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-semibold text-sm text-foreground">
            {monthLabel}
          </span>
          <button
            type="button"
            data-ocid="calendar.pagination_next"
            onClick={nextMonth}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 px-3 pt-2 pb-1">
          {WEEKDAY_LABELS.map((day) => (
            <div
              key={day}
              className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-1 px-3 pb-3">
          {dayCells.map((day, idx) => {
            if (day === null) {
              // biome-ignore lint/suspicious/noArrayIndexKey: empty cells have no better key
              return <div key={`empty-${idx}`} />;
            }
            const dateStr = dateToString(new Date(calYear, calMonth, day));
            const isClosed = closedDates.includes(dateStr);
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === todayStr;

            return (
              <button
                type="button"
                key={dateStr}
                data-ocid={`calendar.item.${day}`}
                onClick={() => onDateSelect(dateStr)}
                className={cn(
                  "relative flex items-center justify-center h-8 w-8 mx-auto rounded-full text-xs font-medium transition-all",
                  isSelected
                    ? "bg-info text-info-foreground font-semibold shadow-sm"
                    : isClosed
                      ? "bg-success-subtle text-success hover:bg-success hover:text-success-foreground"
                      : isToday
                        ? "ring-2 ring-info text-foreground hover:bg-muted"
                        : "text-foreground hover:bg-muted",
                )}
                aria-label={`${day} ${monthLabel}${isClosed ? " (closed)" : ""}`}
                aria-pressed={isSelected}
              >
                {day}
                {isClosed && !isSelected && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full flex items-center justify-center">
                    <span className="w-1 h-1 bg-white rounded-full" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-muted/30">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-info" />
            <span className="text-[10px] text-muted-foreground">Selected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-success-subtle border border-success" />
            <span className="text-[10px] text-muted-foreground">Closed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2 border-info" />
            <span className="text-[10px] text-muted-foreground">Today</span>
          </div>
        </div>
      </div>

      {/* CSV Report Template Upload */}
      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <FileUp className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">
            Report Template
          </span>
          {csvTemplate && (
            <Badge
              className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300"
              variant="outline"
            >
              Active
            </Badge>
          )}
        </div>

        <div className="px-4 py-3 flex flex-col gap-3">
          {csvTemplate ? (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                <p className="text-xs font-medium text-emerald-800 mb-0.5">
                  Template loaded
                </p>
                <p className="text-[11px] text-emerald-600">
                  {csvTemplate.headers.length} columns &bull;{" "}
                  {csvTemplate.rows.length} products
                </p>
                <p className="text-[11px] text-emerald-600 mt-0.5">
                  Name col:{" "}
                  <span className="font-semibold">
                    {csvTemplate.nameColumn}
                  </span>
                </p>
                <p className="text-[11px] text-emerald-600">
                  Qty col:{" "}
                  <span className="font-semibold">
                    {csvTemplate.quantityColumn}
                  </span>
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Downloads will use your template format. Quantity is filled from
                Store Closing.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-md border border-emerald-400 text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  <FileUp className="w-3 h-3" />
                  Replace
                </button>
                <button
                  type="button"
                  onClick={handleRemoveTemplate}
                  className="flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                  title="Remove template"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Upload your system's CSV template here. The app will use its
                column structure and static data for all future downloads — only
                the <span className="font-semibold">QUANTITY</span> column will
                be updated from Store Closing.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              >
                <FileUp className="w-3.5 h-3.5" />
                Upload CSV Template
              </button>
              <p className="text-[10px] text-muted-foreground text-center">
                Accepts .csv files only
              </p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleTemplateUpload}
          />
        </div>
      </div>

      {/* Historical Entries */}
      <div className="bg-card border border-border rounded-lg shadow-card flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">
            Historical Entries
          </span>
          {sortedClosedDates.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {sortedClosedDates.length}
            </Badge>
          )}
        </div>

        {sortedClosedDates.length === 0 ? (
          <div
            data-ocid="history.empty_state"
            className="flex flex-col items-center justify-center py-8 px-4 text-center"
          >
            <CheckCircle2 className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No completed sheets yet
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Closed days will appear here
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[260px]">
            <div data-ocid="history.list" className="divide-y divide-border">
              {sortedClosedDates.map((dateStr, idx) => (
                <button
                  type="button"
                  key={dateStr}
                  data-ocid={`history.item.${idx + 1}`}
                  onClick={() => onDateSelect(dateStr)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors",
                    selectedDate === dateStr && "bg-info-subtle",
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {formatDisplayDate(dateStr)}
                    </p>
                  </div>
                  <Badge
                    className="text-[10px] bg-success-subtle text-success border-success/30 shrink-0"
                    variant="outline"
                  >
                    Complete
                  </Badge>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </aside>
  );
}
