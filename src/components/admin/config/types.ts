/** Row shapes edited on the System Configuration screen. */
export interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

export interface PropertyData {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  default_currency: string;
  reporting_currency: string;
  phone: string | null;
  email: string;
  website: string | null;
  [key: string]: unknown;
}

export interface RateRow {
  id: string;
  apartment_type_id: string;
  season: string;
  start_date: string;
  end_date: string;
  weekly_rate_gbp: number;
  min_nights: number;
  [key: string]: unknown;
}

export interface ChannelRow {
  id: string;
  name: string;
  code: string;
  commission_rate: number;
  is_active: boolean;
  [key: string]: unknown;
}

export interface CurrencyRow {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: number;
  source: string;
  [key: string]: unknown;
}

export type ShowToast = (message: string, type?: Toast["type"]) => void;
