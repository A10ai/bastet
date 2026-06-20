import "server-only";

/**
 * PII Anonymization for AI calls.
 *
 * Strips all guest PII before sending data to any AI provider (Claude, local LLM).
 * Only sends aggregated operational metrics and anonymized patterns.
 *
 * This enforces the GDPR policy: "No guest PII sent to external AI — only
 * aggregated operational metrics and anonymized patterns."
 */

/**
 * Anonymize a guest name by replacing with initials + hash.
 * "John Smith" -> "Guest J.S. (a4f2)"
 */
export function anonymizeName(name: string): string {
  if (!name) return "Unknown";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return `Guest ${parts[0]?.[0]?.toUpperCase() || "?"}.`;
  const initials = `${parts[0][0]?.toUpperCase()}.${parts[parts.length - 1][0]?.toUpperCase()}.`;
  const hash = name.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(16).slice(-4);
  return `Guest ${initials} (${hash})`;
}

/**
 * Anonymize an email address.
 * "john.smith@example.com" -> "guest_***@example.com"
 */
export function anonymizeEmail(email: string): string {
  if (!email || !email.includes("@")) return "[redacted]";
  const [_, domain] = email.split("@");
  return `guest_***@${domain || "[redacted]"}`;
}

/**
 * Anonymize a phone number.
 * "+447700900100" -> "+44***100"
 */
export function anonymizePhone(phone: string): string {
  if (!phone) return "[redacted]";
  if (phone.length <= 4) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-3)}`;
}

/**
 * Anonymize a passport number entirely.
 */
export function anonymizePassport(passport: string): string {
  if (!passport) return "[redacted]";
  return `[redacted:passport:${passport.length}chars]`;
}

/**
 * Build an anonymized data snapshot for AI brain/chat calls.
 * Takes raw property data and returns a safe, PII-free version.
 */
export function anonymizeSnapshot(rawData: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawData)) {
    if (key === "arrivals" && Array.isArray(value)) {
      safe[key] = value.map((a: { apartment_number?: string }) => ({
        apartment_number: a.apartment_number || "TBD",
        // Guest name stripped — replaced with count
      }));
      safe["arrivals_count"] = value.length;
    } else if (key === "departures" && Array.isArray(value)) {
      safe[key] = value.map((d: { apartment_number?: string }) => ({
        apartment_number: d.apartment_number || "TBD",
      }));
      safe["departures_count"] = value.length;
    } else if (key === "guests" && Array.isArray(value)) {
      // Send only aggregate guest metrics, no PII
      safe["guest_count"] = value.length;
      const loyaltyTiers: Record<string, number> = {};
      for (const g of value) {
        const tier = (g as { loyalty_tier?: string }).loyalty_tier || "standard";
        loyaltyTiers[tier] = (loyaltyTiers[tier] || 0) + 1;
      }
      safe["guest_loyalty_breakdown"] = loyaltyTiers;
    } else if (key === "vip_arrivals" && Array.isArray(value)) {
      safe["vip_arrivals_count"] = value.length;
      safe["vip_tiers"] = value.map((v: { loyalty_tier?: string }) => v.loyalty_tier).filter(Boolean);
    } else if (key === "bookings" && Array.isArray(value)) {
      // Strip guest names and special requests from bookings
      safe[key] = value.map((b: { special_requests?: string; [key: string]: unknown }) => {
        const { guest_name, special_requests, ...rest } = b as Record<string, unknown>;
        return rest;
      });
    } else {
      // Pass through non-PII fields (occupancy, revenue, maintenance, etc.)
      safe[key] = value;
    }
  }

  return safe;
}