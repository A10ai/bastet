import "server-only";
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { logAudit, type AuditEntry } from "@/lib/audit";
import { validateBody, formatZodErrors, assignSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logger } from "@/lib/logger";

export interface AssignHandlerConfig {
  /** Table holding the work item (housekeeping_tasks, maintenance_requests). */
  table: string;
  /** Human label for messages: "task", "request". */
  label: string;
  /** Staff roles that may be assigned this kind of work. */
  assignableRoles: string[];
  /** Work-item statuses from which assignment is allowed. */
  assignableStatuses: string[];
  /** PostgREST select string returned after update. */
  select: string;
  audit: { action: string; category: AuditEntry["category"]; resource_type: string };
}

/**
 * Builds the POST handler for `.../:id/assign` routes. Housekeeping and
 * maintenance previously carried two identical copies of this logic.
 */
export function createAssignHandler(config: AssignHandlerConfig) {
  return async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      const auth = await requireRole(request, ROLES.MANAGEMENT);
      if (!auth.authenticated) return auth.error!;
      const supabase = createServerSupabaseClient();
      const body = await request.json().catch(() => ({}));

      const validation = validateBody(assignSchema, body);
      if (!validation.success) {
        return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
      }
      const { staff_id } = validation.data;

      const { data: staffMember } = await supabase
        .from("staff")
        .select("id, role, is_active")
        .eq("id", staff_id)
        .single();

      if (!staffMember) {
        return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      }
      if (!config.assignableRoles.includes(staffMember.role)) {
        return NextResponse.json(
          { error: `Only ${config.assignableRoles.join(" or ")} roles can be assigned to ${config.label}s` },
          { status: 400 }
        );
      }
      if (!staffMember.is_active) {
        return NextResponse.json({ error: "Staff member is inactive" }, { status: 400 });
      }

      const { data: item } = await supabase
        .from(config.table)
        .select("id, status")
        .eq("id", params.id)
        .single();

      if (!item) {
        return NextResponse.json({ error: `${config.label} not found` }, { status: 404 });
      }
      if (!config.assignableStatuses.includes(item.status)) {
        return NextResponse.json(
          { error: `Cannot assign ${config.label} with status: ${item.status}` },
          { status: 409 }
        );
      }

      const { data, error } = await supabase
        .from(config.table)
        .update({ assigned_to: staff_id, status: "assigned" })
        .eq("id", params.id)
        .select(config.select)
        .single();

      if (error) return rpcErrorResponse(error, `${config.table}.assign`);

      await logAudit(supabase, {
        user_id: auth.userId,
        user_email: auth.email,
        action: config.audit.action,
        category: config.audit.category,
        resource_type: config.audit.resource_type,
        resource_id: params.id,
        description: `Assigned ${config.label} ${params.id} to staff ${staff_id}`,
        new_data: { staff_id },
      });

      return NextResponse.json({ data });
    } catch (err) {
      logger.error({ err: String(err), table: config.table }, "[assign] unhandled");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
