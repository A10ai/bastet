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
  status: z.enum(["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"]).optional(),
  adults: z.number().int().min(1).max(20).optional(),
  children: z.number().int().min(0).max(20).optional(),
  special_requests: z.string().max(2000).optional().nullable(),
  internal_notes: z.string().max(2000).optional().nullable(),
  guest_currency: z.string().length(3).optional(),
});

// ── Properties ────────────────────────────────────────────────────────────

export const createPropertySchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  slug: z.string().min(1).max(100).optional(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  postcode: z.string().max(20).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  total_apartments: z.number().int().min(0).optional(),
  currency: z.string().length(3).default("GBP"),
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
});

// ── Staff ──────────────────────────────────────────────────────────────────

export const createStaffSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(50),
  last_name: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Valid email is required"),
  password: z.string().min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  phone: z.string().max(30).optional().nullable(),
  role: z.enum(["owner", "admin", "manager", "receptionist", "housekeeping", "maintenance", "readonly"]),
  department: z.string().max(100).optional().nullable(),
});

export const updateStaffSchema = z.object({
  first_name: z.string().min(1).max(50).optional(),
  last_name: z.string().min(1).max(50).optional(),
  phone: z.string().max(30).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  // Note: role, is_active, auth_user_id, property_id are NOT here —
  // they require special admin endpoints with additional RBAC checks
}).strict();

// ── Housekeeping ──────────────────────────────────────────────────────────

export const createHousekeepingTaskSchema = z.object({
  apartment_id: z.string().uuid("Invalid apartment ID"),
  type: z.enum(["checkout_clean", "stay_clean", "deep_clean", "inspection", "turnover"]),
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
  category: z.enum(["plumbing", "electrical", "hvac", "appliance", "structural", "cosmetic", "other"]),
  priority: z.enum(["low", "normal", "high", "urgent", "emergency"]).optional().default("normal"),
});

// ── Expenses ──────────────────────────────────────────────────────────────

export const createExpenseSchema = z.object({
  category: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  amount: z.number().min(0),
  currency: z.string().length(3).default("GBP"),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendor: z.string().max(200).optional().nullable(),
  receipt_url: z.string().url().optional().nullable(),
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