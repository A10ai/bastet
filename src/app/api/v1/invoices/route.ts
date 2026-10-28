import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import {
  getNextInvoiceNumber,
  calculateInvoiceTotals,
  lineTotalGbp,
} from "@/lib/finance-engine";
import { convertCurrency } from "@/lib/booking-engine";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createInvoiceSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const guestId = searchParams.get("guest_id");
    const bookingId = searchParams.get("booking_id");

    let query = supabase
      .from("invoices")
      .select(`
        *,
        guest:guests(id, first_name, last_name, email),
        booking:bookings(id, reference)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (guestId) query = query.eq("guest_id", guestId);
    if (bookingId) query = query.eq("booking_id", bookingId);

    const pagination = parsePagination(searchParams);
    query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data, meta: paginationMeta(pagination, count, (data || []).length) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(createInvoiceSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const {
      booking_id,
      guest_id,
      line_items = [],
      guest_currency = "GBP",
      due_date,
      notes,
      tax_rate,
    } = validated;

    // Resolve the property first: the booking's, else the caller's.
    let propertyId: string | null = null;
    if (booking_id) {
      const { data: booking } = await supabase
        .from("bookings")
        .select("property_id")
        .eq("id", booking_id)
        .single();
      propertyId = booking?.property_id || null;
    }
    if (!propertyId) propertyId = auth.propertyId ?? null;
    if (!propertyId) {
      return NextResponse.json({ error: "No property resolved for this invoice" }, { status: 400 });
    }

    // Tax: explicit percent from the request, else the property's VAT rate
    // (migration 00021). Never a silent zero.
    let taxRatePercent = tax_rate;
    if (tax_rate === undefined || tax_rate === null) {
      const { data: prop } = await supabase
        .from("properties")
        .select("vat_rate_percent")
        .eq("id", propertyId)
        .single();
      taxRatePercent = Number(prop?.vat_rate_percent ?? 0);
    }

    // Calculate line item totals
    const processedItems = line_items.map(
      (item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price_gbp: item.unit_price_gbp,
        total_gbp: lineTotalGbp(item.quantity, item.unit_price_gbp),
      })
    );

    const totals = calculateInvoiceTotals(processedItems, taxRatePercent);

    // Get FX rate and convert
    let totalGuestCurrency: number | null = null;
    let fxRate: number | null = null;
    if (guest_currency !== "GBP") {
      const converted = await convertCurrency(totals.total_gbp, guest_currency, supabase);
      if (converted) {
        totalGuestCurrency = converted.amount;
        fxRate = converted.rate;
      }
    }

    const invoiceNumber = await getNextInvoiceNumber(supabase);

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        property_id: propertyId,
        booking_id: booking_id || null,
        guest_id: guest_id || null,
        invoice_number: invoiceNumber,
        status: "draft",
        subtotal_gbp: totals.subtotal_gbp,
        tax_amount_gbp: totals.tax_amount_gbp,
        discount_amount_gbp: 0,
        total_gbp: totals.total_gbp,
        total_guest_currency: totalGuestCurrency,
        guest_currency,
        fx_rate_used: fxRate,
        line_items: processedItems,
        // Stored so the database re-totals edited drafts at the same rate (00036)
        tax_rate_percent: taxRatePercent,
        due_date,
        notes: notes || null,
      })
      .select(`
        *,
        guest:guests(id, first_name, last_name, email),
        booking:bookings(id, reference)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAudit(supabase, {
      action: "invoice.create",
      category: "finance",
      resource_type: "invoice",
      resource_id: data?.id,
      description: `Created invoice ${data?.invoice_number}`,
      new_data: body,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
