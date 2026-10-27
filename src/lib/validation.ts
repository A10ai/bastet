import "server-only";
import { z } from "zod";

/**
 * Zod validation schemas for all API request bodies and query params.
 * Used to validate input before processing — reject early, reject loudly.
 */

// ── Auth ────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email format"),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});

// ── Bookings ─────────────────────────────────────────────────────────────

export const createBookingSchema = z.object({
  apartment_id: z.string().uuid("Invalid apartment ID"),
  guest_id: z.string().uuid().optional().nullable(),
  channel_id: z.string().uuid().optional().nullable(),
  /** Rate plan used to price the stay; the property's default plan when omitted. */
  rate_plan_id: z.string().uuid().optional().nullable(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  adults: z.number().int().min(1).max(20).default(1),
  children: z.number().int().min(0).max(20).default(0),
  infants: z.number().int().min(0).max(10).optional().default(0),
  guest_currency: z.string().length(3).default("GBP"),
  special_requests: z.string().max(2000).optional().nullable(),
  internal_notes: z.string().max(2000).optional().nullable(),
  property_id: z.string().uuid().optional(),
});

export const updateBookingSchema = z.object({
  /**
   * Only the pending -> confirmed transition may be made here. Check-in,
   * check-out and cancellation have dedicated endpoints that enforce the
   * state machine, availability and balance rules.
   */
  status: z.enum(["confirmed"]).optional(),
  adults: z.number().int().min(1).max(20).optional(),
  children: z.number().int().min(0).max(20).optional(),
  special_requests: z.string().max(2000).optional().nullable(),
  internal_notes: z.string().max(2000).optional().nullable(),
  guest_currency: z.string().length(3).optional(),
});

// ── Properties ────────────────────────────────────────────────────────────

export const createPropertySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required").max(200),
  slug: z.string().min(1).max(100).optional(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  postcode: z.string().max(20).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().url().optional().nullable(),
  total_apartments: z.number().int().min(0).optional(),
  currency: z.string().length(3).default("GBP"),
  default_currency: z.string().length(3).optional(),
  reporting_currency: z.string().length(3).optional(),
  star_rating: z.number().min(0).max(5).optional(),
  status: z.string().max(50).optional(),
  timezone: z.string().max(50).optional(),
});

// ── Apartments ───────────────────────────────────────────────────────────

export const createApartmentSchema = z.object({
  building_id: z.string().uuid("Invalid building ID"),
  apartment_type_id: z.string().uuid("Invalid apartment type ID"),
  number: z.string().min(1, "Number is required").max(10),
  floor: z.number().int().min(-5).max(100),
  view_type: z.enum(["sea", "pool", "garden", "city", "partial_sea"]).optional(),
  status: z.enum(["available", "occupied", "maintenance", "cleaning", "blocked", "out_of_service"]).optional(),
  is_accessible: z.boolean().optional(),
  smart_lock_id: z.string().max(50).optional().nullable(),
  ac_unit_id: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateApartmentSchema = z.object({
  number: z.string().min(1).max(10).optional(),
  floor: z.number().int().min(-5).max(100).optional(),
  view_type: z.enum(["sea", "pool", "garden", "city", "partial_sea"]).optional(),
  status: z.enum(["available", "occupied", "maintenance", "cleaning", "blocked", "out_of_service"]).optional(),
  is_accessible: z.boolean().optional(),
  smart_lock_id: z.string().max(50).optional().nullable(),
  ac_unit_id: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// ── Apartment Types ──────────────────────────────────────────────────────

export const createApartmentTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  slug: z.string().min(1).max(50).optional(),
  description: z.string().max(2000).optional().nullable(),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(0).max(20).default(1),
  max_occupancy: z.number().int().min(1).max(50),
  size_sqm: z.number().min(0).optional().nullable(),
  base_weekly_rate_gbp: z.number().min(0),
  amenities: z.array(z.string()).optional().default([]),
});

// ── Buildings ────────────────────────────────────────────────────────────

export const createBuildingSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  code: z.string().min(1).max(20),
  floors: z.number().int().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
});

// ── Guests ────────────────────────────────────────────────────────────────

export const createGuestSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(50),
  last_name: z.string().min(1, "Last name is required").max(50),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  passport_number: z.string().max(50).optional().nullable(),
  address_line1: z.string().max(200).optional().nullable(),
  address_line2: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  postcode: z.string().max(20).optional().nullable(),
  marketing_consent: z.boolean().default(false),
  vip_status: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional().nullable(),
  language: z.string().max(10).optional().default("en"),
  preferred_currency: z.string().length(3).optional().default("GBP"),
  segment_id: z.string().uuid().optional().nullable(),
});

// ── Staff ──────────────────────────────────────────────────────────────────

export const createStaffSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(50),
  last_name: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Valid email is required"),
  password: z.string().min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number")
    .optional(),
  phone: z.string().max(30).optional().nullable(),
  role: z.enum(["owner", "admin", "manager", "receptionist", "housekeeping", "maintenance", "readonly"]),
  department: z.string().max(100).optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  language: z.string().max(10).optional().default("en"),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const updateStaffSchema = z.object({
  first_name: z.string().min(1).max(50).optional(),
  last_name: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional().nullable(),
  // No "owner": nobody is promoted to owner through the API (see canManageRole).
  role: z.enum(["admin", "manager", "receptionist", "housekeeping", "maintenance", "readonly"]).optional(),
  department: z.string().max(100).optional().nullable(),
  is_active: z.boolean().optional(),
  language: z.string().max(10).optional(),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
}).strict();

// ── Housekeeping ──────────────────────────────────────────────────────────

export const createHousekeepingTaskSchema = z.object({
  apartment_id: z.string().uuid("Invalid apartment ID"),
  type: z.enum(["checkout_clean", "midstay_clean", "deep_clean", "inspection", "turndown"]),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assigned_to: z.string().uuid().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
  notes: z.string().max(2000).optional().nullable(),
});

// ── Maintenance ──────────────────────────────────────────────────────────

export const createMaintenanceRequestSchema = z.object({
  apartment_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  category: z.enum(["plumbing", "electrical", "hvac", "furniture", "appliance", "structural", "pest", "other"]),
  priority: z.enum(["low", "normal", "high", "urgent", "emergency"]).optional().default("normal"),
  reported_by_staff: z.string().uuid().optional().nullable(),
  reported_by_guest: z.string().uuid().optional().nullable(),
  estimated_cost_gbp: z.number().min(0).optional().nullable(),
  status: z.enum(["open", "assigned", "in_progress", "on_hold", "completed", "cancelled"]).optional(),
});

// ── Expenses ──────────────────────────────────────────────────────────────

export const createExpenseSchema = z.object({
  category: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  amount: z.number().min(0).optional(),
  amount_egp: z.number().min(0).optional(),
  currency: z.string().length(3).default("GBP"),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendor: z.string().max(200).optional().nullable(),
  receipt_url: z.string().url().optional().nullable(),
  invoice_reference: z.string().max(200).optional().nullable(),
  is_recurring: z.boolean().optional().default(false),
  recurring_frequency: z.string().max(50).optional().nullable(),
  is_r_and_d: z.boolean().optional().default(false),
  approved_by: z.string().uuid().optional().nullable(),
  amount_gbp: z.number().min(0).optional().nullable(),
});

// ── Reports ────────────────────────────────────────────────────────────────

export const reportQuerySchema = z.object({
  type: z.enum(["occupancy", "revenue", "executive", "energy", "ai_decisions", "guests", "housekeeping", "maintenance"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ── Messaging ─────────────────────────────────────────────────────────────

export const messagingQuerySchema = z.object({
  type: z.enum(["overview", "arrivals", "departures", "templates", "guests"]),
});

export const messageSchema = z.object({
  guest_id: z.string().uuid().optional().nullable(),
  subject: z.string().min(1, "Subject is required").max(200),
  body: z.string().min(1, "Body is required").max(5000),
});

// ── Booking lifecycle ──────────────────────────────────────────────────────

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
  cancellation_reason: z.string().max(500).optional(),
}).strict();

export const updateBookingChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  /** Percent, 0-100 (e.g. 15 for Booking.com). */
  commission_rate: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
  channel_type: z.string().max(30).optional(),
}).strict();

export const assignSchema = z.object({
  staff_id: z.string().uuid("staff_id must be a UUID"),
}).strict();

export const checkinSchema = z.object({
  notes: z.string().max(2000).optional(),
}).strict();

export const checkoutSchema = z.object({
  notes: z.string().max(2000).optional(),
  /** Manager+ only: check out with an unpaid balance (recorded in audit). */
  allow_outstanding_balance: z.boolean().optional(),
}).strict();

// ── Guest preferences ──────────────────────────────────────────────────────

export const guestPreferencesSchema = z.object({
  contact_language: z.string().max(20).optional().nullable(),
  preferred_communication: z.enum(["email", "phone", "sms", "whatsapp"]).optional().nullable(),
  dietary_requirements: z.string().max(500).optional().nullable(),
  accessibility_needs: z.string().max(500).optional().nullable(),
  pillow_preference: z.string().max(100).optional().nullable(),
  room_temperature: z.string().max(50).optional().nullable(),
  high_floor: z.boolean().optional().nullable(),
  quiet_room: z.boolean().optional().nullable(),
  extra_pillows: z.number().int().min(0).max(10).optional().nullable(),
  late_checkout: z.boolean().optional().nullable(),
  early_checkin: z.boolean().optional().nullable(),
  preferred_room_view: z.string().max(50).optional().nullable(),
}).partial();

// ── Staff schedule ──────────────────────────────────────────────────────────

export const staffScheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  shift_start: z.string().min(1, "shift_start is required"),
  shift_end: z.string().min(1, "shift_end is required"),
  shift_type: z.enum(["regular", "overtime", "on_call", "holiday"]).optional().default("regular"),
  notes: z.string().max(2000).optional().nullable(),
}).strict();

// ── Housekeeping lifecycle ──────────────────────────────────────────────────

export const simpleSchema = z.object({
  notes: z.string().max(2000).optional(),
}).strict();

export const completeSchema = z.object({
  notes: z.string().max(2000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
}).strict();

export const verifySchema = z.object({
  passed: z.boolean(),
  verified_by: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
}).strict();

// ── Maintenance resolve ─────────────────────────────────────────────────────

export const resolveSchema = z.object({
  resolution_notes: z.string().max(5000).optional().nullable(),
  actual_cost_gbp: z.number().min(0).optional().nullable(),
}).strict();

// ── Invoices ────────────────────────────────────────────────────────────────

export const createInvoiceSchema = z.object({
  booking_id: z.string().uuid().optional().nullable(),
  guest_id: z.string().uuid().optional().nullable(),
  line_items: z.array(z.object({
    description: z.string().min(1).max(500),
    quantity: z.number().min(0),
    unit_price_gbp: z.number().min(0),
  })).min(1, "At least one line item is required"),
  guest_currency: z.string().length(3).default("GBP"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD"),
  notes: z.string().max(2000).optional().nullable(),
  /** Percent (0-100). Omit to use the property VAT rate. */
  tax_rate: z.number().min(0).max(100).optional(),
}).strict();

export const updateInvoiceSchema = z.object({
  line_items: z.array(z.object({
    description: z.string().min(1).max(500),
    quantity: z.number().min(0),
    unit_price_gbp: z.number().min(0),
  })).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional().nullable(),
  guest_id: z.string().uuid().optional().nullable(),
  status: z.enum(["cancelled"]).optional(),
}).strict();

export const sendInvoiceSchema = z.object({
  method: z.enum(["email", "post", "hand", "sms"]).optional(),
}).strict();

export const paymentSchema = z.object({
  amount_gbp: z.number().min(0.01, "amount_gbp is required"),
  amount_original: z.number().min(0).optional(),
  currency: z.string().length(3).default("GBP"),
  fx_rate: z.number().positive().optional().nullable(),
  method: z.string().min(1, "method is required"),
  reference: z.string().max(200).optional().nullable(),
  received_by: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
}).strict();

// ── Currency rates ──────────────────────────────────────────────────────────

export const currencyRateSchema = z.object({
  base_currency: z.string().length(3).default("GBP"),
  target_currency: z.string().length(3, "target_currency is required (3-letter code)"),
  rate: z.number().positive("rate must be a positive number"),
}).strict();

// ── Notifications ───────────────────────────────────────────────────────────

export const notificationSchema = z.object({
  action: z.enum(["mark_read", "mark_all_read", "create"]),
  id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional().nullable(),
  title: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  type: z.enum(["info", "success", "warning", "error", "ai_decision"]).optional(),
  category: z.enum(["booking", "housekeeping", "maintenance", "energy", "guest", "pricing", "brain", "system"]).optional().nullable(),
  link: z.string().max(500).optional().nullable(),
}).strict();

// ── GDPR ────────────────────────────────────────────────────────────────────

export const gdprActionSchema = z.object({
  action: z.enum(["erasure", "consent", "complete_erasure"]),
  guest_id: z.string().uuid().optional().nullable(),
  reason: z.string().max(1000).optional().nullable(),
  request_id: z.string().uuid().optional().nullable(),
  consent_type: z.enum(["marketing", "analytics", "profiling", "third_party_sharing"]).optional(),
  granted: z.boolean().optional(),
  method: z.string().max(50).optional(),
  notes: z.string().max(2000).optional().nullable(),
}).strict();

// ── Admin database ──────────────────────────────────────────────────────────

export const databaseActionSchema = z.object({
  action: z.enum(["insert", "update", "delete"]).optional(),
  table: z.string().min(1).max(100),
  id: z.string().optional(),
  row: z.record(z.string(), z.unknown()).optional(),
  updates: z.record(z.string(), z.unknown()).optional(),
}).strict();

// ── AI routes ────────────────────────────────────────────────────────────────

export const aiChatSchema = z.object({
  message: z.string().min(1, "Message is required").max(5000),
  context: z.string().max(5000).optional(),
}).strict();

export const aiBrainActionSchema = z.object({
  action: z.enum(["run_cycle", "update_config", "approve", "reject"]),
  config: z.object({
    mode: z.enum(["supervised", "autonomous"]).optional(),
    enabled: z.boolean().optional(),
    cycle_interval_minutes: z.number().int().min(1).max(1440).optional(),
  }).optional(),
  decision_id: z.string().uuid().optional().nullable(),
}).strict();

export const automationSchema = z.object({
  action: z.enum(["run_all"]).optional(),
  automation_id: z.string().optional(),
}).strict();

export const runAutomationSchema = z.object({
  automation_id: z.string().uuid("automation_id must be a valid UUID"),
}).strict();

export const predictionSchema = z.object({
  action: z.enum(["train"]),
}).strict();

export const revenueAnalysisSchema = z.object({
  current_rate: z.number().min(0),
  new_rate: z.number().min(0),
  occupancy: z.number().min(0).max(1),
  elasticity: z.number().optional().default(-0.5),
}).strict();

export const schedulerSchema = z.object({
  action: z.enum(["start", "stop", "run_now", "set_interval"]),
  interval_minutes: z.number().int().min(5).max(60).optional(),
}).strict();

export const workflowSchema = z.object({
  action: z.enum(["create", "approve", "execute_step", "cancel", "record_outcome"]),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  source: z.enum(["ai_brain", "automation", "manual", "event", "anomaly"]).optional(),
  source_id: z.string().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  steps: z.array(z.record(z.string(), z.unknown())).optional(),
  created_by: z.string().uuid().optional().nullable(),
  id: z.string().uuid().optional().nullable(),
  approved_by: z.string().optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
  outcome: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(2000).optional().nullable(),
}).strict();

export const eventSchema = z.object({
  type: z.string().min(1, "type is required"),
  source_system: z.string().max(100).optional().default("manual"),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();

// ── Query param schemas ─────────────────────────────────────────────────────

export const guestActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  type: z.string().max(50).optional(),
}).strict();

export const guestCommunicationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  type: z.string().max(50).optional(),
}).strict();

// ── Helper ────────────────────────────────────────────────────────────────

/**
 * Validate a request body against a Zod schema.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown):
  { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Format Zod errors into a user-friendly string.
 */
export function formatZodErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// Rate plans (migration 00027)
// ---------------------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
export const RATE_PLAN_PRICING_MODES = ["bar", "percent_off", "percent_markup", "fixed_nightly"] as const;
export const CANCELLATION_POLICIES = ["flexible", "moderate", "strict", "non_refundable"] as const;

const ratePlanBase = z.object({
  property_id: z.string().uuid().optional(),
  code: z.string().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, "Code may contain letters, digits, - and _"),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  pricing_mode: z.enum(RATE_PLAN_PRICING_MODES).default("bar"),
  adjustment: z.number().min(0).max(100000).default(0),
  cancellation_policy: z.enum(CANCELLATION_POLICIES).default("flexible"),
  free_cancellation_days: z.number().int().min(0).max(365).default(1),
  min_nights: z.number().int().min(1).max(365).default(1),
  max_nights: z.number().int().min(1).max(365).optional().nullable(),
  includes_breakfast: z.boolean().default(false),
  valid_from: isoDate.optional().nullable(),
  valid_to: isoDate.optional().nullable(),
  channel_codes: z.array(z.string().min(1).max(30)).max(20).optional().nullable(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});
const ratePlanRules = (v: Partial<z.infer<typeof ratePlanBase>>, ctx: z.RefinementCtx) => {
  if (v.pricing_mode === "percent_off" && (v.adjustment ?? 0) > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["adjustment"], message: "A discount cannot exceed 100%" });
  if (v.pricing_mode === "fixed_nightly" && (v.adjustment ?? 0) <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["adjustment"], message: "A fixed nightly rate must be above zero" });
  if (v.max_nights != null && v.min_nights != null && v.max_nights < v.min_nights) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["max_nights"], message: "max_nights must be at least min_nights" });
  if (v.valid_from && v.valid_to && v.valid_to < v.valid_from) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valid_to"], message: "valid_to must be on or after valid_from" });
};
export const ratePlanSchema = ratePlanBase.superRefine(ratePlanRules);
export const updateRatePlanSchema = ratePlanBase.partial().superRefine(ratePlanRules);

export const quoteStaySchema = z
  .object({
    apartment_id: z.string().uuid().optional(),
    apartment_type_id: z.string().uuid().optional(),
    check_in: isoDate,
    check_out: isoDate,
    rate_plan_id: z.string().uuid().optional().nullable(),
    channel_code: z.string().max(30).optional().nullable(),
  })
  .refine((v) => v.apartment_id || v.apartment_type_id, { message: "apartment_id or apartment_type_id is required", path: ["apartment_id"] })
  .refine((v) => v.check_out > v.check_in, { message: "check_out must be after check_in", path: ["check_out"] });


// ---------------------------------------------------------------------------
// Group bookings (migration 00028)
// ---------------------------------------------------------------------------
export const GROUP_STATUSES = ["tentative", "confirmed", "cancelled", "completed"] as const;
const groupBase = z.object({
  property_id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  organiser_guest_id: z.string().uuid().optional().nullable(),
  organiser_name: z.string().max(120).optional().nullable(),
  organiser_email: z.string().email().max(255).optional().nullable(),
  organiser_phone: z.string().max(50).optional().nullable(),
  company: z.string().max(120).optional().nullable(),
  check_in: isoDate,
  check_out: isoDate,
  rooms_requested: z.number().int().min(0).max(500).default(0),
  rate_plan_id: z.string().uuid().optional().nullable(),
  channel_id: z.string().uuid().optional().nullable(),
  billing_mode: z.enum(["individual", "master"]).default("individual"),
  cutoff_date: isoDate.optional().nullable(),
  status: z.enum(["tentative", "confirmed"]).default("tentative"),
  notes: z.string().max(2000).optional().nullable(),
  /** Rooms to block immediately (optional). */
  apartment_ids: z.array(z.string().uuid()).max(200).optional(),
  adults: z.number().int().min(1).max(20).default(2),
});
const groupRules = (v: { check_in?: string; check_out?: string; cutoff_date?: string | null }, ctx: z.RefinementCtx) => {
  if (v.check_in && v.check_out && v.check_out <= v.check_in) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["check_out"], message: "check_out must be after check_in" });
  if (v.cutoff_date && v.check_in && v.cutoff_date > v.check_in) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cutoff_date"], message: "cutoff_date must be on or before check_in" });
};
export const createGroupSchema = groupBase.superRefine(groupRules);
export const updateGroupSchema = groupBase.omit({ apartment_ids: true, adults: true, property_id: true }).extend({ status: z.enum(["tentative", "confirmed", "completed"]).optional() }).partial().superRefine(groupRules);
export const addGroupRoomsSchema = z
  .object({
    apartment_ids: z.array(z.string().uuid()).min(1).max(200),
    guest_ids: z.array(z.string().uuid().nullable()).optional(),
    adults: z.number().int().min(1).max(20).default(2),
    rate_plan_id: z.string().uuid().optional().nullable(),
  })
  .refine((v) => !v.guest_ids || v.guest_ids.length === v.apartment_ids.length, { message: "guest_ids must match apartment_ids one to one", path: ["guest_ids"] });
export const groupPaymentSchema = z.object({
  amount_gbp: z.number().positive().max(1_000_000),
  method: z.enum(["cash", "card", "bank_transfer", "stripe", "other"]),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export const cancelGroupSchema = z.object({ reason: z.string().min(3).max(500) });


// ---------------------------------------------------------------------------
// Guest portal (migration 00029)
// ---------------------------------------------------------------------------
export const precheckinSchema = z.object({
  arrival_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM").optional().nullable(),
  flight_or_transport: z.string().max(120).optional().nullable(),
  adults: z.number().int().min(1).max(20).optional(),
  children: z.number().int().min(0).max(20).optional(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  special_requests: z.string().max(1000).optional().nullable(),
  marketing_consent: z.boolean().default(false),
  accept_terms: z.literal(true, { message: "You must accept the booking terms" }),
});


// ---------------------------------------------------------------------------
// Point of sale (migration 00030)
// ---------------------------------------------------------------------------
export const POS_OUTLET_TYPES = ["restaurant", "bar", "spa", "shop", "minibar", "other"] as const;
export const posOutletSchema = z.object({
  property_id: z.string().uuid().optional(),
  code: z.string().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().min(2).max(100),
  type: z.enum(POS_OUTLET_TYPES).default("restaurant"),
  default_tax_rate_percent: z.number().min(0).max(100).optional().nullable(),
  is_active: z.boolean().default(true),
});
export const updatePosOutletSchema = posOutletSchema.omit({ property_id: true }).partial();
export const posItemSchema = z.object({
  sku: z.string().max(30).optional().nullable(),
  name: z.string().min(1).max(120),
  category: z.string().max(60).optional().nullable(),
  unit_price_gbp: z.number().min(0).max(100000),
  tax_rate_percent: z.number().min(0).max(100).optional().nullable(),
  is_active: z.boolean().default(true),
});
export const updatePosItemSchema = posItemSchema.partial();
const posTicketItem = z
  .object({
    item_id: z.string().uuid().optional(),
    name: z.string().min(1).max(120).optional(),
    quantity: z.number().positive().max(999).default(1),
    unit_price_gbp: z.number().min(0).max(100000).optional(),
    tax_rate_percent: z.number().min(0).max(100).optional().nullable(),
  })
  .refine((v) => v.item_id || (v.name && v.unit_price_gbp !== undefined), { message: "Give an item_id or a name and a price", path: ["item_id"] });
export const posTicketSchema = z
  .object({
    outlet_id: z.string().uuid(),
    booking_id: z.string().uuid().optional(),
    room_number: z.string().min(1).max(20).optional(),
    ticket_reference: z.string().max(40).optional().nullable(),
    items: z.array(posTicketItem).min(1).max(100),
  })
  .refine((v) => v.booking_id || v.room_number, { message: "booking_id or room_number is required", path: ["room_number"] });
export const voidPosTicketSchema = z.object({ reason: z.string().min(3).max(500) });

// ---------------------------------------------------------------------------
// Admin user management (POST /api/v1/admin/users)
// ---------------------------------------------------------------------------
export const adminCreateUserSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(50),
  last_name: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Valid email is required").max(255),
  password: z.string().min(12, "Password must be at least 12 characters").max(128)
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  phone: z.string().max(30).optional().nullable(),
  // No "owner": see canManageRole in src/lib/api-auth.ts.
  role: z.enum(["admin", "manager", "receptionist", "housekeeping", "maintenance", "readonly"]),
  department: z.string().max(100).optional().nullable(),
}).strict();
