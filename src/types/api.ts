// API request/response types

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
  };
  staff: {
    id: string;
    first_name: string;
    last_name: string;
    role: string;
    property_id: string;
  };
}

export interface DashboardStats {
  occupancy_percentage: number;
  occupancy_trend: number;
  revenue_today_gbp: number;
  revenue_week_gbp: number;
  revenue_month_gbp: number;
  arrivals_today: number;
  departures_today: number;
  open_maintenance: number;
  urgent_maintenance: number;
  housekeeping_clean: number;
  housekeeping_dirty: number;
  housekeeping_in_progress: number;
  guest_satisfaction: number;
  channel_split: { channel: string; bookings: number; percentage: number }[];
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price_gbp: number;
  total_gbp: number;
}

export interface ExpenseBreakdownItem {
  category: string;
  total_gbp: number;
  count: number;
  percentage: number;
}

export interface RevenueBySourceItem {
  source: string;
  amount_gbp: number;
  percentage: number;
}

export interface RevenueByRoomTypeItem {
  type: string;
  bookings: number;
  revenue_gbp: number;
  avg_rate: number;
  avg_nights: number;
}

export interface RevenueByChannelItem {
  source: string;
  bookings: number;
  revenue_gbp: number;
  percentage: number;
}

export interface AccountsReceivableBucket {
  count: number;
  total: number;
}

export interface AccountsReceivable {
  current: AccountsReceivableBucket;
  days_30: AccountsReceivableBucket;
  days_60: AccountsReceivableBucket;
  days_90_plus: AccountsReceivableBucket;
}

export interface GrossOperatingProfit {
  gop_gbp: number;
  gop_margin_pct: number;
}

export interface CporTrendItem {
  month: string;
  cpor_gbp: number;
}

export interface DepartmentCostItem {
  department: string;
  budget_gbp: number;
  actual_gbp: number;
  variance_pct: number;
}

export interface FinancialSummary {
  revenue_gbp: number;
  expenses_gbp: number;
  net_profit_gbp: number;
  occupancy_rate: number;
  adr_gbp: number;
  revpaa_gbp: number;
  total_invoices: number;
  outstanding_invoices: number;
  monthly_data: {
    month: string;
    revenue: number;
    expenses: number;
  }[];
  expense_breakdown: ExpenseBreakdownItem[];
  revenue_by_source: RevenueBySourceItem[];
  cost_per_occupied_room: number;
  profit_margin_pct: number;
  revenue_vs_last_month_pct: number | null;
  expenses_vs_last_month_pct: number | null;
  ytd_revenue_gbp: number;
  ytd_expenses_gbp: number;
  ytd_net_profit_gbp: number;
  r_and_d_total_gbp: number;
  revenue_by_room_type: RevenueByRoomTypeItem[];
  revenue_by_channel: RevenueByChannelItem[];
  accounts_receivable: AccountsReceivable;
  gop: GrossOperatingProfit;
  cpor_trend: CporTrendItem[];
  department_costs: DepartmentCostItem[];
}
