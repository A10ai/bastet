import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAllGuestIntelligence } from "@/lib/guest-intelligence";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const data = await getAllGuestIntelligence(supabase);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[AI/Guests] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate guest intelligence" },
      { status: 500 }
    );
  }
}
