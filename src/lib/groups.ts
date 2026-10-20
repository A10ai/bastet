/** Group bookings (migration 00028): one master record owning several room bookings. */
export interface BookingGroup {
  id: string;
  property_id: string;
  reference: string;
  name: string;
  organiser_guest_id: string | null;
  organiser_name: string | null;
  organiser_email: string | null;
  organiser_phone: string | null;
  company: string | null;
  check_in: string;
  check_out: string;
  rooms_requested: number;
  rate_plan_id: string | null;
  channel_id: string | null;
  billing_mode: "individual" | "master";
  cutoff_date: string | null;
  status: "tentative" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupRoom {
  booking_id: string;
  reference: string;
  status: string;
  apartment_id: string;
  apartment_number: string;
  apartment_type: string | null;
  guest_id: string | null;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  contract_total_gbp: number;
  folio_id: string | null;
  folio_status: string | null;
  charged_gbp: number;
  paid_gbp: number;
  balance_gbp: number;
}

/** Result of the `group_statement` database function. */
export interface GroupStatement {
  group: BookingGroup;
  rooms: GroupRoom[];
  room_count: number;
  contract_total_gbp: number;
  charged_gbp: number;
  paid_gbp: number;
  balance_gbp: number;
}

export const GROUP_STATUS_LABEL: Record<BookingGroup["status"], string> = {
  tentative: "Tentative",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};
