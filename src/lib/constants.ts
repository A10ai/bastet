// Sidebar navigation items
export const SIDEBAR_NAV = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Apartments", href: "/dashboard/apartments", icon: "Building2" },
  { label: "Bookings", href: "/dashboard/bookings", icon: "CalendarDays" },
  { label: "Guests", href: "/dashboard/guests", icon: "Users" },
  { label: "Housekeeping", href: "/dashboard/housekeeping", icon: "Sparkles" },
  { label: "Maintenance", href: "/dashboard/maintenance", icon: "Wrench" },
  { label: "Finance", href: "/dashboard/finance", icon: "Wallet" },
  { label: "Marketplace", href: "/dashboard/marketplace", icon: "Palmtree" },
  { label: "Staff", href: "/dashboard/staff", icon: "UserCog" },
  { label: "Settings", href: "/dashboard/settings", icon: "Settings" },
] as const;

// Business rules
export const LENGTH_OF_STAY_DISCOUNTS = [
  { min_nights: 7, discount: 0.05 },
  { min_nights: 14, discount: 0.1 },
  { min_nights: 21, discount: 0.15 },
  { min_nights: 28, discount: 0.2 },
] as const;

export const CHANNEL_COMMISSIONS: Record<string, number> = {
  direct: 0,
  "booking.com": 0.15,
  airbnb: 0.14,
  expedia: 0.18,
  phone: 0,
  "walk-in": 0,
};

export const LOYALTY_TIERS = {
  bronze: { min: 0, max: 999 },
  silver: { min: 1000, max: 4999 },
  gold: { min: 5000, max: 14999 },
  platinum: { min: 15000, max: Infinity },
} as const;

export const POINTS_PER_GBP_ROOM = 10;
export const POINTS_PER_GBP_EXTRAS = 5;

export const SUPPORTED_CURRENCIES = ["GBP", "EUR", "USD", "EGP"] as const;
export const SUPPORTED_LANGUAGES = ["en", "ar", "ru", "de"] as const;

export const APARTMENT_STATUSES = [
  "available",
  "occupied",
  "maintenance",
  "cleaning",
  "blocked",
  "out_of_service",
] as const;

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
] as const;

export const STAFF_ROLES = [
  "owner",
  "manager",
  "receptionist",
  "housekeeping",
  "maintenance",
  "admin",
] as const;
