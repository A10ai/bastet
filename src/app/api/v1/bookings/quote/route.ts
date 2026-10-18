import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, quoteStaySchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { quoteStay } from "@/lib/rate-plans";
import { logger } from "@/lib/logger";

/**
 * GET /api/v1/bookings/quote?apartment_id=|apartment_type_id=&check_in=&check_out=&rate_plan_id=&channel_code=
 *
 * Price a stay before booking it: nightly BAR per season, the chosen (or
 * default) rate plan's adjustment and its rules (minimum nights, validity,
 * channel). A read, so it is a GET (no CSRF token needed from the booking
 * form). Front desk and above.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  try {
    const q = request.nextUrl.searchParams;
    const body = Object.fromEntries(["apartment_id", "apartment_type_id", "check_in", "check_out", "rate_plan_id", "channel_code"].filter((k) => q.get(k)).map((k) => [k, q.get(k)]));
    const validation = validateBody(quoteStaySchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    }
    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    let apartmentTypeId = input.apartment_type_id ?? null;
    if (!apartmentTypeId && input.apartment_id) {
      const { data: apt } = await supabase.from("apartments").select("apartment_type_id").eq("id", input.apartment_id).maybeSingle();
      if (!apt) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Apartment not found" } }, { status: 404 });
      apartmentTypeId = apt.apartment_type_id;
    }
    const { quote, error } = await quoteStay(supabase, {
      apartmentTypeId: apartmentTypeId!,
      checkIn: input.check_in,
      checkOut: input.check_out,
      ratePlanId: input.rate_plan_id,
      channelCode: input.channel_code,
    });
    if (error) return rpcErrorResponse(error, "quote_stay");
    return NextResponse.json({ data: quote });
  } catch (err) {
    logger.error({ err: String(err) }, "[bookings/quote] failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
