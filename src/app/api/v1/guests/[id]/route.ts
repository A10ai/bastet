import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { getByIdHandler } from "@/lib/crud";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createGuestSchema } from "@/lib/validation";

export const GET = getByIdHandler({
  table: "guests",
  roles: ROLES.FRONT_DESK,
  select: `
        *,
        segment:guest_segments(id, name, code, description)
      `,
  label: "Guest",
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(createGuestSchema.partial(), body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const allowedFields = [
      "first_name", "last_name", "email", "phone", "date_of_birth",
      "nationality", "language", "preferred_currency", "passport_number",
      "address_line1", "address_line2", "city", "country", "postcode",
      "vip_status", "notes", "marketing_consent", "segment_id",
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in validated) {
        updates[key] = (validated as Record<string, unknown>)[key];
      }
    }

    const { data, error } = await supabase
      .from("guests")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAudit(supabase, {
      action: "guest.update",
      category: "guest",
      resource_type: "guest",
      resource_id: data?.id || params.id,
      description: `Updated guest ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
