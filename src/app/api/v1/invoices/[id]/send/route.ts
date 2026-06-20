import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("id", params.id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status !== "draft") {
      return NextResponse.json(
        { error: `Cannot send invoice with status: ${invoice.status}. Must be draft.` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("invoices")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAudit(supabase, {
      action: "invoice.send",
      category: "finance",
      resource_type: "invoice",
      resource_id: data?.id || params.id,
      description: `Sent invoice ${params.id}`,
      new_data: { status: "sent" },
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
