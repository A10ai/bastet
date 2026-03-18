// ============================================================
// TypeScript types for all 44 database tables
// ============================================================

// Module 1: Core Property
export interface Property {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  default_currency: string;
  reporting_currency: string;
  star_rating: number | null;
  total_apartments: number;
  opening_date: string | null;
  status: "construction" | "pre_opening" | "active" | "maintenance" | "closed";
  phone: string | null;
  email: string;
  website: string | null;
  created_at: string;
  updated_at: string;
}

export interface Building {
  id: string;
  property_id: string;
  name: string;
  code: string;
  floors: number;
  apartments_per_floor: number;
  has_elevator: boolean;
  has_parking: boolean;
  status: "active" | "maintenance" | "closed";
  created_at: string;
  updated_at: string;
}

export interface ApartmentType {
  id: string;
  property_id: string;
  name: string;
  slug: string;
  description: string | null;
  bedrooms: number;
  bathrooms: number;
  max_occupancy: number;
  size_sqm: number | null;
  base_weekly_rate_gbp: number;
  amenities: string[];
  created_at: string;
  updated_at: string;
}

export type ApartmentViewType =
  | "sea"
  | "pool"
  | "garden"
  | "city"
  | "partial_sea";
export type ApartmentStatus =
  | "available"
  | "occupied"
  | "maintenance"
  | "cleaning"
  | "blocked"
  | "out_of_service";

export interface Apartment {
  id: string;
  property_id: string;
  building_id: string;
  apartment_type_id: string;
  number: string;
  floor: number;
  view_type: ApartmentViewType;
  status: ApartmentStatus;
  is_accessible: boolean;
  smart_lock_id: string | null;
  ac_unit_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  building?: Building;
  apartment_type?: ApartmentType;
}

export interface ApartmentImage {
  id: string;
  apartment_id: string | null;
  apartment_type_id: string | null;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface Facility {
  id: string;
  property_id: string;
  name: string;
  type: string;
  description: string | null;
  capacity: number | null;
  opening_time: string | null;
  closing_time: string | null;
  is_reservable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FacilityBooking {
  id: string;
  facility_id: string;
  guest_id: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  guests_count: number;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  notes: string | null;
  created_at: string;
}

// Module 2: Bookings & Pricing
export interface BookingChannel {
  id: string;
  name: string;
  code: string;
  commission_rate: number;
  is_active: boolean;
  api_connection: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export interface Booking {
  id: string;
  property_id: string;
  apartment_id: string;
  guest_id: string | null;
  channel_id: string;
  reference: string;
  status: BookingStatus;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  rate_per_night_gbp: number;
  discount_percentage: number;
  total_amount_gbp: number;
  total_amount_guest_currency: number | null;
  guest_currency: string;
  special_requests: string | null;
  internal_notes: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  guest?: Guest;
  apartment?: Apartment;
  channel?: BookingChannel;
}

export interface Rate {
  id: string;
  property_id: string;
  apartment_type_id: string;
  season_name: string;
  start_date: string;
  end_date: string;
  weekly_rate_gbp: number;
  nightly_rate_gbp: number;
  min_stay_nights: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Availability {
  id: string;
  apartment_id: string;
  date: string;
  is_available: boolean;
  price_override_gbp: number | null;
  block_reason: string | null;
  created_at: string;
}

export interface Promotion {
  id: string;
  property_id: string;
  name: string;
  code: string | null;
  type: "percentage" | "fixed_amount" | "free_nights" | "package";
  value: number;
  min_nights: number | null;
  max_uses: number | null;
  current_uses: number;
  valid_from: string;
  valid_until: string;
  applicable_apartment_types: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingAddon {
  id: string;
  booking_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_gbp: number;
  total_price_gbp: number;
  created_at: string;
}

// Module 3: Guest & CRM
export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export interface Guest {
  id: string;
  auth_user_id: string | null;
  segment_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  language: string;
  preferred_currency: string;
  passport_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  country: string | null;
  postcode: string | null;
  loyalty_tier: LoyaltyTier;
  loyalty_points: number;
  total_stays: number;
  total_nights: number;
  total_spend_gbp: number;
  vip_status: boolean;
  notes: string | null;
  marketing_consent: boolean;
  created_at: string;
  updated_at: string;
}

export interface GuestPreferences {
  id: string;
  guest_id: string;
  floor_preference: string | null;
  view_preference: string | null;
  bed_type: string | null;
  pillow_type: string | null;
  mattress_firmness: string | null;
  ac_temperature_c: number | null;
  ac_mode: string | null;
  housekeeping_frequency: string | null;
  housekeeping_time: string | null;
  towel_change_frequency: string | null;
  linen_change_frequency: string | null;
  dietary_needs: string[];
  food_allergies: string[];
  cuisine_preferences: string[];
  coffee_type: string | null;
  tea_type: string | null;
  milk_preference: string | null;
  minibar_preferences: unknown[];
  contact_method: string | null;
  contact_language: string;
  notification_preferences: Record<string, boolean>;
  interests: string[];
  activity_level: string | null;
  pool_preference: string | null;
  beach_preference: string | null;
  spa_preferences: unknown[];
  has_children: boolean;
  children_ages: number[];
  childcare_needed: boolean;
  airport_transfer: boolean;
  shuttle_preference: string | null;
  anniversary_date: string | null;
  birthday_celebrations: boolean;
  typical_arrival_time: string | null;
  typical_departure_time: string | null;
  early_checkin_preference: boolean;
  late_checkout_preference: boolean;
  extra_preferences: Record<string, unknown>;
  auto_learned: boolean;
  confidence_score: number;
  last_updated_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuestCommunication {
  id: string;
  guest_id: string;
  type: "email" | "sms" | "whatsapp" | "push" | "in_app" | "phone_call";
  direction: "inbound" | "outbound";
  subject: string | null;
  body: string | null;
  status: "draft" | "sent" | "delivered" | "read" | "failed";
  sent_by: string | null;
  sent_at: string | null;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GuestActivityLog {
  id: string;
  guest_id: string;
  activity_type: string;
  activity_detail: Record<string, unknown>;
  source: "app" | "web" | "reception" | "system" | "iot";
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface LoyaltyTransaction {
  id: string;
  guest_id: string;
  transaction_type: "earn" | "redeem" | "expire" | "adjust" | "bonus";
  points: number;
  balance_after: number;
  description: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  guest_id: string;
  overall_rating: number;
  cleanliness_rating: number | null;
  location_rating: number | null;
  service_rating: number | null;
  value_rating: number | null;
  title: string | null;
  body: string | null;
  response: string | null;
  responded_at: string | null;
  is_public: boolean;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface GuestSegment {
  id: string;
  name: string;
  code: string;
  description: string | null;
  criteria: Record<string, unknown> | null;
  created_at: string;
}

// Module 4: Operations
export type StaffRole =
  | "owner"
  | "manager"
  | "receptionist"
  | "housekeeping"
  | "maintenance"
  | "admin";

export interface Staff {
  id: string;
  auth_user_id: string | null;
  property_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  department: string | null;
  is_active: boolean;
  language: string;
  avatar_url: string | null;
  hire_date: string | null;
  created_at: string;
  updated_at: string;
}

export type HousekeepingType =
  | "checkout_clean"
  | "midstay_clean"
  | "deep_clean"
  | "inspection"
  | "turndown";
export type HousekeepingStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "verified"
  | "issue_found";

export interface HousekeepingTask {
  id: string;
  property_id: string;
  apartment_id: string;
  assigned_to: string | null;
  type: HousekeepingType;
  status: HousekeepingStatus;
  priority: "low" | "normal" | "high" | "urgent";
  scheduled_date: string;
  started_at: string | null;
  completed_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  photo_before: string[];
  photo_after: string[];
  notes: string | null;
  checklist: unknown[];
  created_at: string;
  updated_at: string;
  // Joined
  apartment?: Apartment;
  assigned_staff?: Staff;
}

export interface MaintenanceRequest {
  id: string;
  property_id: string;
  apartment_id: string | null;
  reported_by_guest: string | null;
  reported_by_staff: string | null;
  assigned_to: string | null;
  category: string;
  priority: "low" | "normal" | "high" | "urgent" | "emergency";
  status: "open" | "assigned" | "in_progress" | "on_hold" | "completed" | "cancelled";
  title: string;
  description: string;
  photos: string[];
  resolution_notes: string | null;
  estimated_cost_gbp: number | null;
  actual_cost_gbp: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  apartment?: Apartment;
  assigned_staff?: Staff;
}

export interface InventoryItem {
  id: string;
  property_id: string;
  category: string;
  name: string;
  sku: string | null;
  unit: string;
  quantity_in_stock: number;
  minimum_stock: number;
  reorder_quantity: number | null;
  unit_cost_egp: number | null;
  supplier: string | null;
  last_restocked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffSchedule {
  id: string;
  staff_id: string;
  date: string;
  shift_start: string;
  shift_end: string;
  shift_type: "regular" | "overtime" | "on_call" | "holiday";
  status: "scheduled" | "confirmed" | "completed" | "absent" | "cancelled";
  notes: string | null;
  created_at: string;
}

// Notifications
export interface Notification {
  id: string;
  staff_id: string | null;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "ai_decision";
  category:
    | "booking"
    | "housekeeping"
    | "maintenance"
    | "energy"
    | "guest"
    | "pricing"
    | "brain"
    | "system"
    | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

// Module 5: Finance
export interface Invoice {
  id: string;
  property_id: string;
  booking_id: string | null;
  guest_id: string | null;
  invoice_number: string;
  status: string;
  subtotal_gbp: number;
  tax_amount_gbp: number;
  discount_amount_gbp: number;
  total_gbp: number;
  total_guest_currency: number | null;
  guest_currency: string;
  fx_rate_used: number | null;
  line_items: unknown[];
  due_date: string;
  sent_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount_gbp: number;
  amount_original: number;
  currency: string;
  fx_rate: number | null;
  method: string;
  stripe_payment_id: string | null;
  status: string;
  reference: string | null;
  received_by: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  property_id: string;
  category: string;
  description: string;
  amount_egp: number;
  amount_gbp: number | null;
  fx_rate: number | null;
  vendor: string | null;
  invoice_reference: string | null;
  receipt_url: string | null;
  is_recurring: boolean;
  recurring_frequency: string | null;
  is_r_and_d: boolean;
  approved_by: string | null;
  expense_date: string;
  created_at: string;
  updated_at: string;
}

export interface CurrencyRate {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: number;
  source: string;
  fetched_at: string;
}

export interface FinancialReport {
  id: string;
  property_id: string;
  report_type: string;
  period_start: string;
  period_end: string;
  revenue_gbp: number | null;
  expenses_gbp: number | null;
  net_profit_gbp: number | null;
  occupancy_rate: number | null;
  adr_gbp: number | null;
  revpaa_gbp: number | null;
  data: Record<string, unknown>;
  generated_at: string;
  generated_by: string | null;
}

// Module 6: Experience Marketplace
export interface Partner {
  id: string;
  property_id: string;
  name: string;
  type: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  commission_rate: number;
  quality_score: number | null;
  total_bookings: number;
  total_revenue_gbp: number;
  status: "pending" | "active" | "suspended" | "terminated";
  auto_suspended: boolean;
  contract_start: string | null;
  contract_end: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerCertification {
  id: string;
  partner_id: string;
  type: string;
  name: string;
  issuer: string | null;
  certificate_number: string | null;
  issued_date: string;
  expiry_date: string | null;
  document_url: string | null;
  is_valid: boolean;
  created_at: string;
}

export interface Excursion {
  id: string;
  property_id: string;
  partner_id: string;
  name: string;
  slug: string;
  description: string;
  short_description: string | null;
  type: string;
  duration_hours: number;
  price_gbp: number;
  price_egp: number | null;
  max_participants: number | null;
  min_participants: number;
  difficulty: string;
  includes: string[];
  excludes: string[];
  meeting_point: string | null;
  meeting_latitude: number | null;
  meeting_longitude: number | null;
  image_url: string | null;
  gallery_urls: string[];
  average_rating: number;
  total_reviews: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExcursionBooking {
  id: string;
  excursion_id: string;
  guest_id: string;
  booking_id: string | null;
  date: string;
  participants: number;
  total_price_gbp: number;
  commission_gbp: number;
  status: string;
  special_requests: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface BeachPartnership {
  id: string;
  property_id: string;
  partner_id: string;
  beach_name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  day_pass_price_gbp: number;
  includes: string[];
  shuttle_available: boolean;
  shuttle_duration_mins: number | null;
  max_daily_capacity: number | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FlashDeal {
  id: string;
  property_id: string;
  partner_id: string | null;
  excursion_id: string | null;
  title: string;
  description: string;
  original_price_gbp: number;
  deal_price_gbp: number;
  discount_percentage: number;
  max_claims: number;
  current_claims: number;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  image_url: string | null;
  created_at: string;
}

// Module 7: AI & Analytics
export interface DemandForecast {
  id: string;
  property_id: string;
  forecast_date: string;
  horizon_days: number;
  predicted_occupancy: number;
  predicted_adr_gbp: number | null;
  predicted_revenue_gbp: number | null;
  confidence_score: number;
  model_version: string;
  factors: Record<string, unknown>;
  actual_occupancy: number | null;
  actual_revenue_gbp: number | null;
  created_at: string;
}

export interface PricingDecision {
  id: string;
  property_id: string;
  apartment_type_id: string;
  decision_date: string;
  base_rate_gbp: number;
  recommended_rate_gbp: number;
  applied_rate_gbp: number | null;
  adjustment_reason: string | null;
  demand_score: number | null;
  was_accepted: boolean | null;
  accepted_by: string | null;
  created_at: string;
}

export interface GuestPrediction {
  id: string;
  guest_id: string;
  prediction_type: string;
  predicted_value: number;
  confidence: number;
  model_version: string;
  features_used: Record<string, unknown>;
  actual_outcome: number | null;
  was_accurate: boolean | null;
  created_at: string;
  evaluated_at: string | null;
}

export interface AILearningFeedback {
  id: string;
  prediction_id: string | null;
  recommendation_type: string;
  recommendation_detail: Record<string, unknown>;
  was_shown: boolean;
  was_clicked: boolean;
  was_converted: boolean;
  guest_rating: number | null;
  feedback_text: string | null;
  created_at: string;
}

export interface AnalyticsEvent {
  id: string;
  property_id: string;
  guest_id: string | null;
  event_name: string;
  event_category: string;
  event_data: Record<string, unknown>;
  session_id: string | null;
  device_type: string | null;
  platform: string | null;
  created_at: string;
}

// Module 8: Shuttle & Transport
export interface ShuttleRoute {
  id: string;
  property_id: string;
  name: string;
  description: string | null;
  origin: string;
  destination: string;
  origin_latitude: number | null;
  origin_longitude: number | null;
  destination_latitude: number | null;
  destination_longitude: number | null;
  estimated_duration_mins: number;
  distance_km: number | null;
  price_per_person_gbp: number;
  vehicle_capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShuttleSchedule {
  id: string;
  route_id: string;
  day_of_week: number;
  departure_time: string;
  is_active: boolean;
  created_at: string;
}

export interface ShuttleBooking {
  id: string;
  schedule_id: string;
  guest_id: string;
  booking_id: string | null;
  travel_date: string;
  passengers: number;
  status: string;
  pickup_notes: string | null;
  created_at: string;
}
