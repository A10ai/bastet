/**
 * One CSV cell, safe for spreadsheets.
 *
 * Text starting with = + - @ (or a tab / carriage return) is run as a formula
 * by Excel, Sheets and LibreOffice, so guest-controlled values such as a name
 * or description could execute on an accountant's machine (CSV injection,
 * OWASP). Such cells get a leading apostrophe. Plain numbers, including
 * negative ones, are left alone. Cells containing a quote, comma, CR or LF
 * are quoted.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  const isNumber = typeof value === "number" || /^-?\d+(\.\d+)?$/.test(s);
  if (!isNumber && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
