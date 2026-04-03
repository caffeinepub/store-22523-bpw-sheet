/**
 * Convert a JavaScript Date to YYYYMMDD string format
 */
export function dateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Convert YYYYMMDD string to JavaScript Date
 */
export function stringToDate(dateStr: string): Date {
  const year = Number.parseInt(dateStr.substring(0, 4), 10);
  const month = Number.parseInt(dateStr.substring(4, 6), 10) - 1;
  const day = Number.parseInt(dateStr.substring(6, 8), 10);
  return new Date(year, month, day);
}

/**
 * Format YYYYMMDD string to a readable format like "Apr 03, 2026"
 */
export function formatDisplayDate(dateStr: string): string {
  const date = stringToDate(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

/**
 * Format YYYYMMDD string to a longer format like "Friday, April 3, 2026"
 */
export function formatLongDate(dateStr: string): string {
  const date = stringToDate(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Get today's date as YYYYMMDD string
 */
export function todayString(): string {
  return dateToString(new Date());
}

/**
 * Determine the current session type based on current hour
 */
export function getCurrentSessionType(): "AM" | "PM" {
  const hour = new Date().getHours();
  return hour < 12 ? "AM" : "PM";
}

/**
 * Get the number of days in a given month/year
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get the day-of-week index (0=Sun) for the first day of a month
 */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}
