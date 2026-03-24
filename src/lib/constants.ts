// Sidebar navigation items
export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const SIDEBAR_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
      { label: "Apartments", href: "/dashboard/apartments", icon: "Building2" },
      { label: "Bookings", href: "/dashboard/bookings", icon: "CalendarDays" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "AI Brain", href: "/dashboard/ai/brain", icon: "Brain" },
      { label: "AI Command Centre", href: "/dashboard/ai", icon: "BrainCircuit" },
      { label: "Predictions", href: "/dashboard/ai/predictions", icon: "TrendingUp" },
      { label: "Smart Automations", href: "/dashboard/ai/automations", icon: "Workflow" },
      { label: "AI Scheduler", href: "/dashboard/ai/scheduler", icon: "Timer" },
      { label: "Workflows", href: "/dashboard/ai/workflows", icon: "GitBranch" },
      { label: "Event Bus", href: "/dashboard/ai/events", icon: "Activity" },
    ],
  },
  {
    label: "Guests",
    items: [
      { label: "Guests", href: "/dashboard/guests", icon: "Users" },
      { label: "Guest Intelligence", href: "/dashboard/ai/guests", icon: "UserCheck" },
      { label: "Revenue Copilot", href: "/dashboard/ai/revenue", icon: "LineChart" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Housekeeping", href: "/dashboard/housekeeping", icon: "Sparkles" },
      { label: "Maintenance", href: "/dashboard/maintenance", icon: "Wrench" },
      { label: "Energy", href: "/dashboard/energy", icon: "Zap" },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Finance", href: "/dashboard/finance", icon: "Wallet" },
      { label: "Reports", href: "/dashboard/reports", icon: "FileBarChart" },
      { label: "Marketplace", href: "/dashboard/marketplace", icon: "Palmtree" },
      { label: "Staff", href: "/dashboard/staff", icon: "UserCog" },
      { label: "Admin", href: "/dashboard/admin", icon: "Shield" },
      { label: "Settings", href: "/dashboard/settings", icon: "Settings" },
    ],
  },
];

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

// Housekeeping
export const HOUSEKEEPING_TYPES = [
  "checkout_clean",
  "midstay_clean",
  "deep_clean",
  "inspection",
  "turndown",
] as const;

export const HOUSEKEEPING_STATUSES = [
  "pending",
  "assigned",
  "in_progress",
  "completed",
  "verified",
  "issue_found",
] as const;

export const PRIORITY_LEVELS = ["low", "normal", "high", "urgent"] as const;

// Maintenance
export const MAINTENANCE_CATEGORIES = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "structural",
  "furniture",
  "painting",
  "pest_control",
  "general",
] as const;

export const MAINTENANCE_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export const MAINTENANCE_PRIORITY_LEVELS = [
  "low",
  "normal",
  "high",
  "urgent",
  "emergency",
] as const;

// Staff scheduling
export const SHIFT_TYPES = [
  "regular",
  "overtime",
  "on_call",
  "holiday",
] as const;

export const SCHEDULE_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
  "absent",
  "cancelled",
] as const;

// Finance
export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "paid",
  "partially_paid",
  "overdue",
  "cancelled",
] as const;

export const PAYMENT_METHODS = [
  "card",
  "bank_transfer",
  "cash",
  "stripe",
  "cheque",
] as const;

export const EXPENSE_CATEGORIES = [
  "utilities",
  "staff",
  "maintenance",
  "supplies",
  "marketing",
  "insurance",
  "taxes",
  "software",
  "professional_services",
  "travel",
  "other",
] as const;
