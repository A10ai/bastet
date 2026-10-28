import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { getByIdHandler } from "@/lib/crud";
import { encryptPii, revealGuestDocument } from "@/lib/pii-crypto";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { validatePatchBody, formatZodErrors, createGuestSchema } from "@/lib/validation";

const getGuest = getByIdHandler({
  table: "guests",
  roles: ROLES.FRONT_DESK,
  select: `
        *,
        segment:guest_segments(id, name, code, description)
      `,
  label: "Guest",
});

/** Front desk and above see the decrypted document; the row is stored encrypted. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const res = await getGuest(request, ctx);
  if (res.status !== 200) return res;
  const json = await res.json();
  return NextResponse.json({ ...json, data: revealGuestDocument(json.data, true) });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const validation = validatePatchBody(createGuestSchema.partial(), body);
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
    if ("passport_number" in updates) {
      updates.passport_number = encryptPii(updates.passport_number as string | null);
    }

    const { data, error } = await supabase
      .from("guests")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) return rpcErrorResponse(error, "guests.update");

    await logAudit(supabase, {
      action: "guest.update",
      category: "guest",
      resource_type: "guest",
      resource_id: data?.id || params.id,
      description: `Updated guest ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data: revealGuestDocument(data, true) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
