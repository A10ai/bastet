import "server-only";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve the active property ID from the authenticated user's staff record.
 *
 * SECURITY: Property ID is ALWAYS resolved from the user's staff record in the
 * database — NEVER from client-supplied headers or query params. This prevents
 * IDOR attacks where a user from Property A could access Property B's data.
 *
 * The optional `X-Property-Id` header is only honored if the user is an
 * owner/admin (cross-property access for multi-property management).
 *
 * @param request - NextRequest with auth cookies
 * @returns The property UUID, or null if not authenticated / no staff record
 */
export async function getActivePropertyId(
  request: NextRequest
): Promise<string | null> {
  try {
    // Build a request-scoped SSR client to read cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) return null;

    // Look up staff record by auth_user_id using admin client
    // (bypasses RLS — needed because RLS policies depend on the property_id
    //  we're trying to resolve, creating a circular dependency)
    const admin = createAdminClient();
    const { data: staff } = await admin
      .from("staff")
      .select("property_id, role, is_active")
      .eq("auth_user_id", session.user.id)
      .single();

    if (!staff || !staff.is_active) return null;

    // For owner/admin roles, allow cross-property access via header
    // This is the ONLY case where client input is trusted, and only for
    // users who have been verified as having elevated privileges
    if (staff.role === "owner" || staff.role === "admin") {
      const headerId = request.headers.get("X-Property-Id");
      if (headerId) {
        // Validate that the property exists
        const { data: prop } = await admin
          .from("properties")
          .select("id")
          .eq("id", headerId)
          .single();
        if (prop) return prop.id;
      }
    }

    // Default: user's own property
    return staff.property_id;
  } catch {
    return null;
  }
}

/**
 * Get the authenticated user's staff record.
 * Returns staff data including role, property_id, and user ID.
 */
export async function getAuthenticatedStaff(
  request: NextRequest
): Promise<{ id: string; role: string; property_id: string; auth_user_id: string } | null> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) return null;

    const admin = createAdminClient();
    const { data: staff } = await admin
      .from("staff")
      .select("id, role, property_id, auth_user_id, is_active")
      .eq("auth_user_id", session.user.id)
      .single();

    if (!staff || !staff.is_active) return null;

    return {
      id: staff.id,
      role: staff.role,
      property_id: staff.property_id,
      auth_user_id: staff.auth_user_id,
    };
  } catch {
    return null;
  }
}