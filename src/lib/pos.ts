/** Point of sale (migration 00030): outlets, catalogue items and tickets posted to folios. */
export interface PosOutlet {
  id: string;
  property_id: string;
  code: string;
  name: string;
  type: "restaurant" | "bar" | "spa" | "shop" | "minibar" | "other";
  default_tax_rate_percent: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface PosItem {
  id: string;
  outlet_id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit_price_gbp: number;
  tax_rate_percent: number | null;
  is_active: boolean;
}
export interface PosTicketResult {
  ticket_id: string;
  folio_id: string;
  booking_id: string;
  reference: string;
  outlet: string;
  items: { name: string; quantity: number; unit_price_gbp: number; tax_rate_percent: number | null; line_id: string }[];
  subtotal_gbp: number;
  tax_gbp: number;
  total_gbp: number;
  folio_balance_gbp: number;
}
export interface InHouseStay {
  booking_id: string;
  reference: string;
  room_number: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  folio_balance_gbp: number | null;
}
