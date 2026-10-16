// CSV for the analytics download and the data export (build plan phase 6).
// Pure: NO runtime imports; see csv.test.ts.
//
// A cell that a spreadsheet would read as a formula (it starts with =, +, - or
// @, or a tab or carriage return) is written with a leading apostrophe, so a
// task titled "=HYPERLINK(...)" is text, never a formula. Numbers are written
// as they are (a negative number is not text). Lines end with CRLF, the usual
// for CSV; cells with a comma, quote or line break are quoted.
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) s = value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('; ');
  else if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return lines.join('\r\n') + '\r\n';
}
