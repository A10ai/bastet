import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, paymentSchema } from "@/lib/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", params.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(paymentSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const {
      amount_gbp,
      amount_original,
      currency = "GBP",
      fx_rate,
      method,
      reference,
      received_by,
      notes,
    } = validated;

    const { data: result, error: rpcError } = await supabase.rpc("record_invoice_payment", {
      p_invoice_id: params.id,
      p_amount_gbp: amount_gbp,
      p_method: method,
      p_amount_original: amount_original ?? null,
      p_currency: currency,
      p_fx_rate: fx_rate ?? null,
      p_reference: reference ?? null,
      p_received_by: received_by ?? auth.staffId ?? null,
      p_notes: notes ?? null,
    });

    if (rpcError) return rpcErrorResponse(rpcError, "record_invoice_payment");

    const { payment, invoice_status: newStatus, outstanding_gbp } = result as {
      payment: { id: string };
      invoice_status: string;
      outstanding_gbp: number;
    };

    await logAudit(supabase, {
      action: "invoice.payment",
      category: "finance",
      resource_type: "payment",
      resource_id: payment?.id,
      description: `Recorded payment of ${amount_gbp} GBP for invoice ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data: payment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
