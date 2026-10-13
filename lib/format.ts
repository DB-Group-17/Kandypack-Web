/**
 * @file lib/format.ts
 * @description Shared date and time formatting for every page (Docs/11_ui-rules.md §12).
 *
 * One convention for the whole interface:
 * - dates:       "Oct 12, 2026"
 * - date + time: "Oct 12, 2026, 01:30 PM"   (12-hour clock, shown in the viewer's local timezone)
 * - time only:   "01:30 PM"
 *
 * Pages must call these helpers instead of writing their own formatter, so the same kind of value
 * never looks different from one page to the next.
 *
 * Input handling (see `parseDateValue`):
 * - ISO 8601 timestamps with a zone ("2026-10-12T08:00:00.000Z") are real instants and are shown
 *   in the viewer's local time.
 * - Date-only values ("2026-10-28") are calendar dates and are never shifted by timezone.
 * - MySQL-style "YYYY-MM-DD HH:MM:SS" strings (no zone) come from the shared database, which
 *   stores UTC (Docs/03 §19, "Database datetime timezone"), so they are read as UTC.
 *
 * Client and server safe: no browser-only APIs are used.
 */

/** Value accepted by the formatters; empty values render as an em dash. */
export type DateInput = string | Date | null | undefined;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MYSQL_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;

/**
 * Converts an API value into a Date, applying the zone rules described in the file header.
 *
 * @param value - ISO string, date-only string, MySQL datetime string or Date
 * @returns The parsed Date, or null when the value is empty or cannot be parsed
 */
export function parseDateValue(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  let date: Date;
  if (DATE_ONLY.test(value)) {
    // Calendar date: build it in local time so it never slips to the previous or next day
    const [year, month, day] = value.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else if (MYSQL_DATETIME.test(value)) {
    // Naive database datetime: the database stores UTC, so mark it as UTC explicitly
    date = new Date(`${value.replace(' ', 'T')}Z`);
  } else {
    date = new Date(value);
  }
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Formats a value as a calendar date, e.g. "Oct 12, 2026".
 *
 * @param value - Date-like value from the API
 * @returns The formatted date, "—" when empty, or the original text when it cannot be parsed
 */
export function formatDate(value: DateInput): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = parseDateValue(value);
  if (!date) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

/**
 * Formats a value as date plus time, e.g. "Oct 12, 2026, 01:30 PM", in the viewer's timezone.
 *
 * @param value    - Date-like value from the API
 * @param timeZone - Optional IANA zone (for example "UTC"); omitted means the viewer's own zone
 * @returns The formatted date and time, "—" when empty, or the original text when unparseable
 */
export function formatDateTime(value: DateInput, timeZone?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = parseDateValue(value);
  if (!date) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone,
  });
}

/**
 * Formats a value as a time of day only, e.g. "01:30 PM", in the viewer's timezone.
 *
 * @param value - Date-like value from the API
 * @returns The formatted time, "—" when empty, or the original text when unparseable
 */
export function formatTime(value: DateInput): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = parseDateValue(value);
  if (!date) return String(value);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}
