import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, sendInvoiceSchema } from "@/lib/validation";
import { handleDbError } from "@/lib/api-error";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json().catch(() => ({}));

    const validation = validateBody(sendInvoiceSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }

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
      return handleDbError(error, "invoices.id.send");
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
