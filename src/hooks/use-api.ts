"use client";

/**
 * SWR data fetching hooks for HospitAI dashboard.
 *
 * Replaces manual useEffect + useState + fetch pattern with:
 * - Automatic caching (data persists between page navigations)
 * - Background revalidation (stale-while-revalidate)
 * - Focus revalidation (refetch when user returns to tab)
 * - Error retry with exponential backoff
 * - Realtime integration via mutate()
 */

import useSWR, { type SWRConfiguration } from "swr";
import { useRealtimeSubscription } from "@/hooks/use-realtime";

/**
 * Default fetcher: parses JSON, returns `data` field from standard API envelope.
 * Falls back to raw json if no `data` field (some endpoints return bare objects).
 */
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`API error: ${res.status} ${res.statusText}`);
    (error as any).status = res.status;
    (error as any).url = url;
    throw error;
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

/** Default SWR options for dashboard data. */
const dashboardConfig: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  refreshInterval: 30_000, // refresh every 30s
  errorRetryCount: 3,
  errorRetryInterval: 2_000,
  dedupingInterval: 5_000,
  shouldRetryOnError: (err: any) => err?.status !== 401 && err?.status !== 403,
};

/** Slow-refresh config for expensive endpoints (AI, reports). */
const slowRefreshConfig: SWRConfiguration = {
  ...dashboardConfig,
  refreshInterval: 60_000, // 1 min
  dedupingInterval: 30_000,
};

/** Static config — data that rarely changes (apartment types, channels). */
const staticConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  refreshInterval: 0,
  dedupingInterval: 300_000, // 5 min
};

/**
 * Generic SWR hook with realtime subscription integration.
 * When a realtime event fires for the watched tables, SWR revalidates.
 */
export function useApi<T>(
  url: string | null,
  options?: SWRConfiguration,
  realtimeTables?: string[]
) {
  const swr = useSWR<T>(url, fetcher, { ...dashboardConfig, ...options });

  // If realtime tables specified, revalidate on events
  useRealtimeSubscription(
    realtimeTables ?? [],
    () => swr.mutate(),
    3000
  );

  return swr;
}

/** Dashboard stats (30s refresh). */
export function useDashboardStats(realtimeTables?: string[]) {
  return useApi<DashboardStatsData>("/api/v1/dashboard/stats", dashboardConfig, realtimeTables);
}

/** AI brain status (60s refresh). */
export function useAIBrain() {
  return useApi<AIBrainData>("/api/v1/ai/brain", slowRefreshConfig);
}

/** AI energy data (60s refresh). */
export function useAIEnergy() {
  return useApi<AIEnergyData>("/api/v1/ai/energy", slowRefreshConfig);
}

/** AI revenue data (60s refresh). */
export function useAIRevenue() {
  return useApi<AIRevenueData>("/api/v1/ai/revenue", slowRefreshConfig);
}

/** AI insights (60s refresh). */
export function useAIInsights() {
  return useApi<AIInsightsData>("/api/v1/ai/insights", slowRefreshConfig);
}

/** AI guest intelligence (60s refresh). */
export function useAIGuests() {
  return useApi<AIGuestsData>("/api/v1/ai/guests", slowRefreshConfig);
}

/** Guests list (30s refresh, realtime on bookings table). */
export function useGuests(params?: string) {
  const url = params ? `/api/v1/guests?${params}` : "/api/v1/guests";
  return useApi<GuestsListData>(url, dashboardConfig, ["guests", "bookings"]);
}

/** Bookings list (30s refresh, realtime on bookings table). */
export function useBookings(params?: string) {
  const url = params ? `/api/v1/bookings?${params}` : "/api/v1/bookings";
  return useApi<BookingsListData>(url, dashboardConfig, ["bookings"]);
}

/** Apartments list (5min refresh — rarely changes). */
export function useApartments() {
  return useApi<ApartmentsListData>("/api/v1/apartments", staticConfig, ["apartments"]);
}

/** Staff list (5min refresh). */
export function useStaff() {
  return useApi<StaffListData>("/api/v1/staff", staticConfig, ["staff"]);
}

/** Housekeeping tasks (30s refresh, realtime). */
export function useHousekeeping() {
  return useApi<HousekeepingListData>("/api/v1/housekeeping", dashboardConfig, ["housekeeping_tasks"]);
}

/** Maintenance requests (30s refresh, realtime). */
export function useMaintenance() {
  return useApi<MaintenanceListData>("/api/v1/maintenance", dashboardConfig, ["maintenance_requests"]);
}

/** Invoices (60s refresh). */
export function useInvoices() {
  return useApi<InvoicesListData>("/api/v1/invoices", slowRefreshConfig, ["invoices"]);
}

/** Expenses (60s refresh). */
export function useExpenses() {
  return useApi<ExpensesListData>("/api/v1/expenses", slowRefreshConfig, ["expenses"]);
}

/** Notifications (30s refresh, realtime). */
export function useNotifications() {
  return useApi<NotificationsData>("/api/v1/notifications", dashboardConfig, ["notifications"]);
}

/** Availability calendar (5min refresh). */
export function useAvailabilityCalendar(params: string) {
  return useApi<AvailabilityCalendarData>(`/api/v1/availability/calendar?${params}`, staticConfig);
}

/** Daily briefing (30s refresh). */
export function useBriefing() {
  return useApi<BriefingData>("/api/v1/briefing", dashboardConfig);
}

/** Reports (60s refresh — expensive queries). */
export function useReports(reportType: string, dateFrom: string, dateTo: string) {
  const url = `/api/v1/reports?type=${reportType}&from=${dateFrom}&to=${dateTo}`;
  return useApi<ReportsData>(url, slowRefreshConfig);
}

/** Audit log (60s refresh). */
export function useAuditLog(limit: number = 50, offset: number = 0) {
  return useApi<AuditLogData>(`/api/v1/audit?limit=${limit}&offset=${offset}`, slowRefreshConfig);
}

// ── Type definitions ──────────────────────────────────────────────────

interface DashboardStatsData {
  occupancy_percentage: number;
  occupancy_trend: number;
  revenue_today_gbp: number;
  arrivals_today: number;
  departures_today: number;
  open_maintenance: number;
  urgent_maintenance: number;
  housekeeping_clean: number;
  housekeeping_dirty: number;
  housekeeping_in_progress: number;
  total_apartments: number;
  recent_bookings: Array<{
    id: string;
    reference: string;
    status: string;
    nights: number;
    guest?: { first_name: string; last_name: string } | null;
    apartment?: { number: string } | null;
  }>;
}

interface AIBrainData {
  config?: { mode?: string; last_cycle?: string };
  decisions?: unknown[];
  stats?: { total_decisions?: number; total_executed?: number };
}

interface AIEnergyData {
  overview?: { daily_savings_potential_gbp?: number; waste_kwh?: number };
}

interface AIRevenueData {
  adr_gbp?: number;
  revpar_gbp?: number;
  channel_optimization_savings_gbp?: number;
}

interface AIInsightsData {
  insights?: Array<{ id: string; title: string; severity: string; impact: string }>;
}

interface AIGuestsData {
  vip_arrivals_today?: number;
  at_risk_guests?: number;
}

interface GuestsListData {
  guests: unknown[];
  total?: number;
}

interface BookingsListData {
  bookings: unknown[];
  total?: number;
}

interface ApartmentsListData {
  apartments: unknown[];
  total?: number;
}

interface StaffListData {
  staff: unknown[];
}

interface HousekeepingListData {
  tasks: unknown[];
}

interface MaintenanceListData {
  requests: unknown[];
}

interface InvoicesListData {
  invoices: unknown[];
}

interface ExpensesListData {
  expenses: unknown[];
}

interface NotificationsData {
  notifications: unknown[];
}

interface AvailabilityCalendarData {
  apartments: unknown[];
  date_range: { from: string; to: string };
}

interface BriefingData {
  date: string;
  arrivals: unknown[];
  departures: unknown[];
  in_house: number;
  occupancy: number;
}

interface ReportsData {
  data: unknown;
  meta?: unknown;
}

interface AuditLogData {
  entries: unknown[];
  total: number;
}