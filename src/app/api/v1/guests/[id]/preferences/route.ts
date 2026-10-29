import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, guestPreferencesSchema } from "@/lib/validation";
import { handleDbError } from "@/lib/api-error";

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("guest_preferences")
      .select("*")
      .eq("guest_id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Preferences not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(guestPreferencesSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    // Upsert: update if exists, insert if not
    const { data: existing } = await supabase
      .from("guest_preferences")
      .select("id")
      .eq("guest_id", params.id)
      .single();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from("guest_preferences")
        .update({ ...validated, guest_id: params.id })
        .eq("guest_id", params.id)
        .select()
        .single();
      if (error) return handleDbError(error, "guests.id.preferences");
      result = data;
    } else {
      const { data, error } = await supabase
        .from("guest_preferences")
        .insert({ ...validated, guest_id: params.id })
        .select()
        .single();
      if (error) return handleDbError(error, "guests.id.preferences");
      result = data;
    }

    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
