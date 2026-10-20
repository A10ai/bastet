import { type ClassValue, clsx } from "clsx";
import { format, formatDistanceToNow } from "date-fns";

// Simple cn utility without tailwind-merge to avoid extra deps
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Format currency amounts
export function formatCurrency(
  amount: number,
  currency: string = "GBP"
): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// Format date for display (in Cairo timezone)
export function formatDate(date: string | Date | null | undefined, pattern: string = "dd MMM yyyy"): string {
  if (date === null || date === undefined || date === "") return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, pattern);
}

// Relative time (e.g., "2 hours ago")
export function timeAgo(date: string | Date | null | undefined): string {
  if (date === null || date === undefined || date === "") return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

// Generate booking reference: BAS-HRG-YYNNNN
export function generateBookingRef(sequenceNumber: number): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const seq = sequenceNumber.toString().padStart(4, "0");
  return `BAS-HRG-${year}${seq}`;
}

// Generate invoice number: INV-HRG-YYNNNN
export function generateInvoiceNumber(sequenceNumber: number): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const seq = sequenceNumber.toString().padStart(4, "0");
  return `INV-HRG-${year}${seq}`;
}

// Calculate length-of-stay discount
/**
 * Channel commission is stored as a PERCENT in `booking_channels.commission_rate`
 * (e.g. 15.00). Older code and constants used a fraction (0.15). These helpers
 * accept either and return one unit, so a 15% commission can never be applied
 * as 1500%.
 */
export function commissionFraction(rate: number | null | undefined): number {
  const r = Number(rate) || 0;
  return r > 1 ? r / 100 : r;
}

export function commissionPercent(rate: number | null | undefined): number {
  return commissionFraction(rate) * 100;
}

export function getLengthOfStayDiscount(nights: number): number {
  if (nights >= 28) return 0.2;
  if (nights >= 21) return 0.15;
  if (nights >= 14) return 0.1;
  if (nights >= 7) return 0.05;
  return 0;
}

// Status color mapping
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    available: "text-status-success",
    occupied: "text-brand-accent",
    maintenance: "text-status-warning",
    cleaning: "text-status-info",
    blocked: "text-status-error",
    out_of_service: "text-text-muted",
    pending: "text-status-warning",
    confirmed: "text-status-info",
    checked_in: "text-status-success",
    checked_out: "text-text-secondary",
    cancelled: "text-status-error",
    no_show: "text-status-error",
    open: "text-status-warning",
    assigned: "text-status-info",
    in_progress: "text-brand-accent",
    completed: "text-status-success",
    verified: "text-status-success",
    on_hold: "text-status-warning",
    issue_found: "text-status-error",
    draft: "text-text-secondary",
    sent: "text-status-info",
    paid: "text-status-success",
    partially_paid: "text-brand-accent",
    overdue: "text-status-error",
    refunded: "text-status-warning",
    high: "text-status-warning",
    low: "text-status-info",
    normal: "text-text-secondary",
    urgent: "text-status-error",
    emergency: "text-status-error",
  };
  return colors[status] || "text-text-secondary";
}

export function getStatusBgColor(status: string): string {
  const colors: Record<string, string> = {
    available: "bg-status-success/10 text-status-success",
    occupied: "bg-brand-accent-muted text-brand-accent",
    maintenance: "bg-status-warning/10 text-status-warning",
    cleaning: "bg-status-info/10 text-status-info",
    blocked: "bg-status-error/10 text-status-error",
    pending: "bg-status-warning/10 text-status-warning",
    confirmed: "bg-status-info/10 text-status-info",
    checked_in: "bg-status-success/10 text-status-success",
    checked_out: "bg-text-secondary/10 text-text-secondary",
    cancelled: "bg-status-error/10 text-status-error",
    open: "bg-status-warning/10 text-status-warning",
    assigned: "bg-status-info/10 text-status-info",
    in_progress: "bg-brand-accent-muted text-brand-accent",
    completed: "bg-status-success/10 text-status-success",
    verified: "bg-status-success/10 text-status-success",
    urgent: "bg-status-error/10 text-status-error",
    emergency: "bg-status-error/20 text-status-error",
    on_hold: "bg-status-warning/10 text-status-warning",
    issue_found: "bg-status-error/10 text-status-error",
    draft: "bg-text-secondary/10 text-text-secondary",
    sent: "bg-status-info/10 text-status-info",
    paid: "bg-status-success/10 text-status-success",
    partially_paid: "bg-brand-accent-muted text-brand-accent",
    overdue: "bg-status-error/10 text-status-error",
    refunded: "bg-status-warning/10 text-status-warning",
    high: "bg-status-warning/10 text-status-warning",
    low: "bg-status-info/10 text-status-info",
    normal: "bg-text-secondary/10 text-text-secondary",
  };
  return colors[status] || "bg-text-secondary/10 text-text-secondary";
}
