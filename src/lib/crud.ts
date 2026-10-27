import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, type StaffRole } from "@/lib/api-auth";
import { logAudit, type AuditEntry } from "@/lib/audit";
import { validatePatchBody, formatZodErrors } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logger } from "@/lib/logger";

type IdRouteContext = { params: Promise<{ id: string }> };

export interface GetByIdConfig {
  table: string;
  /** Role floor for reading. */
  roles: readonly StaffRole[];
  /** PostgREST select string; defaults to "*". */
  select?: string;
  /** Human label used in the 404 message: "Expense", "Staff member". */
  label: string;
}

/**
 * GET /<resource>/:id — the skeleton previously copied into every `[id]`
 * route. Row Level Security still scopes the row to the caller's property.
 */
export function getByIdHandler(config: GetByIdConfig) {
  return async function GET(request: NextRequest, ctx: IdRouteContext) {
    const params = await ctx.params;
    try {
      const auth = await requireRole(request, config.roles);
      if (!auth.authenticated) return auth.error!;
      const supabase = await createServerSupabaseClient();

      const { data, error } = await supabase
        .from(config.table)
        .select(config.select ?? "*")
        .eq("id", params.id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: `${config.label} not found` }, { status: 404 });
      }
      return NextResponse.json({ data });
    } catch (err) {
      logger.error({ err: String(err), table: config.table }, "[crud.get] unhandled");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export interface UpdateByIdConfig<T extends Record<string, unknown>> {
  table: string;
  roles: readonly StaffRole[];
  /** Zod schema for the body. Unknown keys are rejected by the schema itself. */
  schema: ZodType<T>;
  /** Whitelist of columns that may be written, in addition to schema validation. */
  allowedFields: readonly string[];
  /** PostgREST select string for the returned row; defaults to "*". */
  select?: string;
  label: string;
  audit: { action: string; category: AuditEntry["category"]; resource_type: string };
}

/**
 * PUT/PATCH /<resource>/:id — validate, whitelist, update, audit.
 */
export function updateByIdHandler<T extends Record<string, unknown>>(config: UpdateByIdConfig<T>) {
  return async function UPDATE(request: NextRequest, ctx: IdRouteContext) {
    const params = await ctx.params;
    try {
      const auth = await requireRole(request, config.roles);
      if (!auth.authenticated) return auth.error!;
      const supabase = await createServerSupabaseClient();
      const body = await request.json().catch(() => ({}));

      const validation = validatePatchBody(config.schema, body);
      if (!validation.success) {
        return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
      }
      const validated = validation.data as Record<string, unknown>;

      const updates: Record<string, unknown> = {};
      for (const key of config.allowedFields) {
        if (validated[key] !== undefined) updates[key] = validated[key];
      }
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from(config.table)
        .update(updates)
        .eq("id", params.id)
        .select(config.select ?? "*")
        .single();

      if (error) return rpcErrorResponse(error, `${config.table}.update`);

      await logAudit(supabase, {
        user_id: auth.userId,
        user_email: auth.email,
        action: config.audit.action,
        category: config.audit.category,
        resource_type: config.audit.resource_type,
        resource_id: params.id,
        description: `Updated ${config.label.toLowerCase()} ${params.id}`,
        new_data: updates,
      });

      return NextResponse.json({ data });
    } catch (err) {
      logger.error({ err: String(err), table: config.table }, "[crud.update] unhandled");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
