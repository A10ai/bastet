import "server-only";
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { formatZodErrors } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logger } from "@/lib/logger";

export interface GuestSubresourceConfig {
  /** Table keyed by guest_id (guest_activity_log, guest_communications). */
  table: string;
  /** Column used by the optional `?type=` filter. */
  typeColumn: string;
  /** Zod schema for `{ limit?, type? }` query params. */
  querySchema: ZodType<{ limit?: number; type?: string }>;
  defaultLimit: number;
}

/**
 * Builds the GET handler for `/guests/:id/<subresource>` list routes.
 */
export function createGuestSubresourceHandler(config: GuestSubresourceConfig) {
  return async function GET(
    request: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) {
    const params = await ctx.params;
    try {
      const auth = await requireRole(request, ROLES.FRONT_DESK);
      if (!auth.authenticated) return auth.error!;
      const supabase = await createServerSupabaseClient();

      const { searchParams } = request.nextUrl;
      const queryParams: Record<string, string> = {};
      for (const key of ["limit", "type"]) {
        const v = searchParams.get(key);
        if (v !== null) queryParams[key] = v;
      }
      const parsed = config.querySchema.safeParse(queryParams);
      if (!parsed.success) {
        return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
      }

      let query = supabase
        .from(config.table)
        .select("*")
        .eq("guest_id", params.id)
        .order("created_at", { ascending: false })
        .limit(parsed.data.limit ?? config.defaultLimit);

      if (parsed.data.type) query = query.eq(config.typeColumn, parsed.data.type);

      const { data, error } = await query;
      if (error) return rpcErrorResponse(error, `${config.table}.list`);
      return NextResponse.json({ data: data || [] });
    } catch (err) {
      logger.error({ err: String(err), table: config.table }, "[guest-subresource] unhandled");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
