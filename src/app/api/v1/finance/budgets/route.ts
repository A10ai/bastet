import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

import { DEPARTMENTS } from "@/lib/constants";

const budgetsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
  budgets: z.array(z.object({
    department: z.enum(DEPARTMENTS),
    budget_gbp: z.number().min(0).max(100000000),
  })).min(1),
}).strict();

/** GET /api/v1/finance/budgets?month=YYYY-MM — budgets for one month (manager+). */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const month = request.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("department_budgets")
    .select("department, budget_gbp, updated_by, updated_at")
    .eq("month", `${month}-01`)
    .order("department");
  if (error) return rpcErrorResponse(error, "budgets.list");
  return NextResponse.json({ data: { month, departments: DEPARTMENTS, budgets: data || [] } });
}

/** PUT /api/v1/finance/budgets — upsert budgets for a month (manager+). */
export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const body = await request.json().catch(() => ({}));
  const validation = validateBody(budgetsSchema, body);
  if (!validation.success) return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
  if (!auth.propertyId) return NextResponse.json({ error: "No property for this staff member" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const rows = validation.data.budgets.map((b) => ({
    property_id: auth.propertyId,
    department: b.department,
    month: `${validation.data.month}-01`,
    budget_gbp: b.budget_gbp,
    updated_by: auth.email || auth.userId,
    updated_at: new Date().toISOString(),
  }));
  const { data, error } = await supabase
    .from("department_budgets")
    .upsert(rows, { onConflict: "property_id,department,month" })
    .select("department, budget_gbp");
  if (error) return rpcErrorResponse(error, "budgets.upsert");

  await logAudit(supabase, {
    user_id: auth.userId,
    user_email: auth.email,
    action: "finance.budgets_set",
    category: "finance",
    resource_type: "department_budgets",
    description: `Set ${rows.length} department budgets for ${validation.data.month}`,
    new_data: { month: validation.data.month, budgets: validation.data.budgets },
  });
  return NextResponse.json({ data });
}
