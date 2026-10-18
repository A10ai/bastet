import "server-only";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedUser } from "@/lib/api-auth";

interface StaffRecord {
  id: string;
  role: string;
  property_id: string;
  auth_user_id: string;
}

/**
 * Load the active staff record for the VERIFIED auth user on this request.
 * Returns null if the session is invalid, there is no staff row, or the
 * account is disabled.
 */
async function loadStaff(request: NextRequest): Promise<StaffRecord | null> {
  const user = await getVerifiedUser(request);
  if (!user) return null;

  // Admin client: RLS policies depend on the property_id we are resolving,
  // which would otherwise be circular.
  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("staff")
    .select("id, role, property_id, auth_user_id, is_active")
    .eq("auth_user_id", user.id)
    .single();

  if (!staff || !staff.is_active) return null;
  return {
    id: staff.id,
    role: staff.role,
    property_id: staff.property_id,
    auth_user_id: staff.auth_user_id,
  };
}

/**
 * Resolve the active property ID from the authenticated user's staff record.
 *
 * SECURITY: Property ID is ALWAYS resolved from the user's staff record in the
 * database — NEVER from client-supplied headers or query params. This prevents
 * IDOR attacks where a user from Property A could access Property B's data.
 *
 * The optional `X-Property-Id` header is only honoured for owner/admin users
 * (cross-property access for multi-property management).
 */
export async function getActivePropertyId(request: NextRequest): Promise<string | null> {
  try {
    const staff = await loadStaff(request);
    if (!staff) return null;

    if (staff.role === "owner" || staff.role === "admin") {
      const headerId = request.headers.get("X-Property-Id");
      if (headerId) {
        const admin = createAdminClient();
        const { data: prop } = await admin
          .from("properties")
          .select("id")
          .eq("id", headerId)
          .single();
        if (prop) return prop.id;
      }
    }

    return staff.property_id;
  } catch {
    return null;
  }
}

/**
 * Get the authenticated user's staff record.
 * Returns staff data including role, property_id, and user ID.
 */
export async function getAuthenticatedStaff(request: NextRequest): Promise<StaffRecord | null> {
  try {
    return await loadStaff(request);
  } catch {
    return null;
  }
}
