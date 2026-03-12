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
