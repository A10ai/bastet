import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { getInvoicePaymentStatus } from "@/lib/finance-engine";
import { logAudit } from "@/lib/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
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
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const {
      amount_gbp,
      amount_original,
      currency = "GBP",
      fx_rate,
      method,
      reference,
      received_by,
      notes,
    } = body;

    if (!amount_gbp || !method) {
      return NextResponse.json(
        { error: "Missing required fields: amount_gbp, method" },
        { status: 400 }
      );
    }

    // Verify invoice exists and is payable
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, status, total_gbp")
      .eq("id", params.id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!["sent", "partially_paid"].includes(invoice.status)) {
      return NextResponse.json(
        { error: `Cannot record payment for invoice with status: ${invoice.status}` },
        { status: 400 }
      );
    }

    // Record payment
    const { data: payment, error: payError } = await supabase
      .from("payments")
      .insert({
        invoice_id: params.id,
        amount_gbp,
        amount_original: amount_original || amount_gbp,
        currency,
        fx_rate: fx_rate || null,
        method,
        status: "completed",
        reference: reference || null,
        received_by: received_by || null,
        received_at: new Date().toISOString(),
        notes: notes || null,
      })
      .select()
      .single();

    if (payError) {
      return NextResponse.json({ error: payError.message }, { status: 400 });
    }

    // Get total payments for this invoice
    const { data: allPayments } = await supabase
      .from("payments")
      .select("amount_gbp")
      .eq("invoice_id", params.id)
      .eq("status", "completed");

    const paymentsSum = (allPayments || []).reduce(
      (sum, p) => sum + p.amount_gbp,
      0
    );

    // Update invoice status
    const newStatus = getInvoicePaymentStatus(invoice.total_gbp, paymentsSum);
    const updateData: Record<string, unknown> = { status: newStatus };
    if (newStatus === "paid") {
      updateData.paid_at = new Date().toISOString();
    }

    await supabase
      .from("invoices")
      .update(updateData)
      .eq("id", params.id);

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
