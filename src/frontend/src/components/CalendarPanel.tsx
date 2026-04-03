import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useState } from "react";

interface CalendarPanelProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  allDates: string[]; // dates that have any sheet data
  lockedDates: string[]; // dates that are locked/closed
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayKey(): string {
  const d = new Date();
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function CalendarPanel({
  selectedDate,
  onDateSelect,
  allDates,
  lockedDates,
}: CalendarPanelProps) {
  const today = todayKey();

  const initYear = selectedDate
    ? Number(selectedDate.slice(0, 4))
    : new Date().getFullYear();
  const initMonth = selectedDate
    ? Number(selectedDate.slice(5, 7)) - 1
    : new Date().getMonth();

  const [calYear, setCalYear] = useState(initYear);
  const [calMonth, setCalMonth] = useState(initMonth);

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();

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
    } else setCalMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else setCalMonth((m) => m + 1);
  };

  const goToday = () => {
    const d = new Date();
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
    onDateSelect(today);
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/30">
        <button
          type="button"
          data-ocid="calendar.pagination_prev"
          onClick={prevMonth}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="font-semibold text-xs text-foreground">
          {monthLabel}
        </span>
        <button
          type="button"
          data-ocid="calendar.pagination_next"
          onClick={nextMonth}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Next month"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 px-2 pt-1.5 pb-0.5">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-[9px] font-bold text-muted-foreground uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5 px-2 pb-2">
        {cells.map((day, idx) => {
          if (day === null) {
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholder cells
            return <div key={`e-${idx}`} className="h-7" />;
          }
          const key = toDateKey(calYear, calMonth, day);
          const isSelected = key === selectedDate;
          const isLocked = lockedDates.includes(key);
          const hasData = allDates.includes(key);
          const isToday = key === today;

          return (
            <button
              type="button"
              key={key}
              data-ocid={`calendar.item.${day}`}
              onClick={() => onDateSelect(key)}
              className={cn(
                "relative flex items-center justify-center h-7 w-7 mx-auto rounded text-[11px] font-medium transition-all",
                isSelected
                  ? "bg-primary text-primary-foreground font-semibold"
                  : isLocked
                    ? "bg-success/15 text-success hover:bg-success/25"
                    : hasData
                      ? "bg-info/10 text-info hover:bg-info/20"
                      : isToday
                        ? "ring-2 ring-primary text-foreground hover:bg-muted"
                        : "text-foreground hover:bg-muted",
              )}
              aria-label={`${day} ${monthLabel}${isLocked ? " (locked)" : ""}`}
              aria-pressed={isSelected}
            >
              {day}
              {isLocked && !isSelected && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-success rounded-full flex items-center justify-center">
                  <Lock className="w-1 h-1 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend + Today button */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-success/30 border border-success inline-block" />
            <span className="text-[9px] text-muted-foreground">Closed</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-info/20 border border-info/40 inline-block" />
            <span className="text-[9px] text-muted-foreground">Open</span>
          </span>
        </div>
        <button
          type="button"
          data-ocid="calendar.today_button"
          onClick={goToday}
          className="text-[9px] font-semibold text-primary hover:underline"
        >
          Today
        </button>
      </div>
    </div>
  );
}
