import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Resolve the active property ID from the request.
 * Priority:
 *   1. ?property_id= query param
 *   2. X-Property-Id header
 *   3. Staff's default property_id from the database
 */
export async function getActivePropertyId(
  request: NextRequest
): Promise<string | null> {
  // 1. Check query param
  const { searchParams } = new URL(request.url);
  const paramId = searchParams.get("property_id");
  if (paramId) return paramId;

  // 2. Check header
  const headerId = request.headers.get("X-Property-Id");
  if (headerId) return headerId;

  // 3. Fall back to staff's default property
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: staff } = await supabase
        .from("staff")
        .select("property_id")
        .eq("auth_user_id", user.id)
        .single();
      return staff?.property_id || null;
    }
  } catch {
    // Silently fail — caller will handle null
  }

  return null;
}
