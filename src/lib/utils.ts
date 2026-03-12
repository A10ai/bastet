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
export function formatDate(date: string | Date, pattern: string = "dd MMM yyyy"): string {
  return format(new Date(date), pattern);
}

// Relative time (e.g., "2 hours ago")
export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
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
    occupied: "text-bastet-gold",
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
    in_progress: "text-bastet-gold",
    completed: "text-status-success",
    verified: "text-status-success",
  };
  return colors[status] || "text-text-secondary";
}

export function getStatusBgColor(status: string): string {
  const colors: Record<string, string> = {
    available: "bg-status-success/10 text-status-success",
    occupied: "bg-bastet-gold-muted text-bastet-gold",
    maintenance: "bg-status-warning/10 text-status-warning",
    cleaning: "bg-status-info/10 text-status-info",
    blocked: "bg-status-error/10 text-status-error",
    pending: "bg-status-warning/10 text-status-warning",
    confirmed: "bg-status-info/10 text-status-info",
    checked_in: "bg-status-success/10 text-status-success",
    checked_out: "bg-text-secondary/10 text-text-secondary",
    cancelled: "bg-status-error/10 text-status-error",
    open: "bg-status-warning/10 text-status-warning",
    in_progress: "bg-bastet-gold-muted text-bastet-gold",
    completed: "bg-status-success/10 text-status-success",
    urgent: "bg-status-error/10 text-status-error",
    emergency: "bg-status-error/20 text-status-error",
  };
  return colors[status] || "bg-text-secondary/10 text-text-secondary";
}
