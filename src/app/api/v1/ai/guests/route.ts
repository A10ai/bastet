import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { getAllGuestIntelligence } from "@/lib/guest-intelligence";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const data = await getAllGuestIntelligence(supabase);
    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err }, "[AI/Guests] Error");
    return NextResponse.json(
      { error: "Failed to generate guest intelligence" },
      { status: 500 }
    );
  }
}
