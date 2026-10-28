import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, ROLES, roleAtLeast, type AuthContext } from "@/lib/api-auth";
import { getActivePropertyId } from "@/lib/api-property";
import { handleDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, databaseActionSchema } from "@/lib/validation";

/**
 * Generic table browser/editor for the admin console.
 *
 * SECURITY: this runs on the service-role client (no RLS), so the route
 * itself enforces what RLS would:
 *  - "property" tables are always filtered by the caller's active property,
 *    and inserts are stamped with it;
 *  - "self" (properties) only ever exposes the caller's own property row;
 *  - "global" tables (no property column) are readable by admins but only
 *    owners may change them, since a change affects every property;
 *  - write: false tables are read-only here: their writes go through routes
 *    with business rules (bookings, the folio ledger, guests).
 * Staff, payments and anything without a property key are not exposed at
 * all; staff go through /api/v1/admin/users. Secret and PII columns are
 * redacted on read and refused on write.
 */
type Scope = "property" | "self" | "global";
interface TablePolicy {
  scope: Scope;
  write: boolean;
}

const TABLES: Record<string, TablePolicy> = {
  properties: { scope: "self", write: true },
  buildings: { scope: "property", write: true },
  apartment_types: { scope: "property", write: true },
  apartments: { scope: "property", write: true },
  housekeeping_tasks: { scope: "property", write: true },
  maintenance_requests: { scope: "property", write: true },
  expenses: { scope: "property", write: true },
  rates: { scope: "property", write: true },
  demand_forecasts: { scope: "property", write: true },
  pricing_decisions: { scope: "property", write: true },
  workflows: { scope: "property", write: true },
  bookings: { scope: "property", write: false },
  guests: { scope: "property", write: false },
  invoices: { scope: "property", write: false },
  booking_channels: { scope: "global", write: true },
  currency_rates: { scope: "global", write: true },
};
const ALLOWED_TABLES = Object.keys(TABLES);

/** Never returned, never written through this route. */
const REDACTED_COLUMNS = new Set([
  "passport_number",
  "passport_number_enc",
  "id_document_number",
  "api_connection",
  "api_key",
  "api_secret",
  "password",
  "password_hash",
]);
/** Set by the database or by this route, never by the caller. */
const PROTECTED_COLUMNS = new Set(["id", "property_id", "created_at", "updated_at"]);

function redact(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = REDACTED_COLUMNS.has(k) ? (v == null ? null : "[redacted]") : v;
  return out;
}

function cleanWrite(data: Record<string, unknown> | undefined): { ok: true; data: Record<string, unknown> } | { ok: false; column: string } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (REDACTED_COLUMNS.has(k) || PROTECTED_COLUMNS.has(k)) {
      if (k === "id" && (v === "" || v == null)) continue;
      return { ok: false, column: k };
    }
    if (!/^[a-z_][a-z0-9_]*$/.test(k)) return { ok: false, column: k };
    out[k] = v;
  }
  return { ok: true, data: out };
}

/** Strip PostgREST filter syntax from a free-text search term. */
function cleanSearch(raw: string): string {
  return raw.replace(/[,()*%\\:."']/g, " ").trim().slice(0, 100);
}

type Db = ReturnType<typeof createAdminClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

function scoped(query: Query, policy: TablePolicy, propertyId: string): Query {
  if (policy.scope === "property") return query.eq("property_id", propertyId);
  if (policy.scope === "self") return query.eq("id", propertyId);
  return query;
}

function canWrite(policy: TablePolicy, auth: AuthContext): boolean {
  if (!policy.write) return false;
  return policy.scope === "global" ? roleAtLeast(auth.role, "owner") : true;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ADMIN);
  if (!auth.authenticated) return auth.error!;

  try {
    const propertyId = await getActivePropertyId(request);
    if (!propertyId) return bad("No property access", 403);
    const supabase: Db = createAdminClient();
    const { searchParams } = request.nextUrl;
    const table = searchParams.get("table");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const search = cleanSearch(searchParams.get("search") || "");
    const sortCol = searchParams.get("sort") || "created_at";
    const sortDir = searchParams.get("dir") === "asc" ? true : false;
    const perPage = 25;

    // If no table specified, return table list with counts
    if (!table) {
      const counts: Record<string, number> = {};
      for (const t of ALLOWED_TABLES) {
        const { count, error } = await scoped(supabase.from(t).select("*", { count: "exact", head: true }), TABLES[t], propertyId);
        if (!error) {
          counts[t] = count || 0;
        }
      }
      return NextResponse.json({ data: counts, tables: ALLOWED_TABLES });
    }

    const policy = TABLES[table];
    if (!policy) return bad(`Table '${table}' is not allowed`);

    const { count: totalCount } = await scoped(supabase.from(table).select("*", { count: "exact", head: true }), policy, propertyId);

    // Get column info from first row
    const { data: sampleRow } = await scoped(supabase.from(table).select("*"), policy, propertyId).limit(1).maybeSingle();
    const columns = sampleRow ? Object.keys(sampleRow) : [];

    let query = scoped(supabase.from(table).select("*"), policy, propertyId).range((page - 1) * perPage, page * perPage - 1);

    if (columns.includes(sortCol)) {
      query = query.order(sortCol, { ascending: sortDir });
    } else if (columns.includes("created_at")) {
      query = query.order("created_at", { ascending: false });
    }

    // Search across a few text-like columns (never the redacted ones)
    if (search && columns.length > 0) {
      const textCols = columns.filter(
        (c) => !["id", "created_at", "updated_at", "property_id"].includes(c) && !REDACTED_COLUMNS.has(c)
      );
      if (textCols.length > 0) {
        const orFilter = textCols
          .slice(0, 5)
          .map((c) => `${c}.ilike.%${search}%`)
          .join(",");
        try {
          query = query.or(orFilter);
        } catch {
          // If or filter fails (non-text columns), skip search
        }
      }
    }

    const { data, error } = await query;
    if (error) {
      return handleDbError(error, "admin-db-query");
    }

    return NextResponse.json({
      data: ((data || []) as Record<string, unknown>[]).map(redact),
      columns,
      total: totalCount || 0,
      page,
      perPage,
      totalPages: Math.ceil((totalCount || 0) / perPage),
      writable: canWrite(policy, auth),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function audit(supabase: Db, auth: AuthContext, propertyId: string, action: string, table: string, id: string | undefined, data?: Record<string, unknown>) {
  await logAudit(supabase, {
    user_id: auth.userId,
    user_email: auth.email,
    action: `admin.database.${action}`,
    category: "settings",
    resource_type: table,
    resource_id: id,
    description: `Admin console ${action} on ${table}`,
    new_data: data,
    // Service-role insert: the property cannot be inferred from the session
    metadata: { property_id: propertyId },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ADMIN);
  if (!auth.authenticated) return auth.error!;

  try {
    const propertyId = await getActivePropertyId(request);
    if (!propertyId) return bad("No property access", 403);
    const body = await request.json().catch(() => null);

    const validation = validateBody(databaseActionSchema, body);
    if (!validation.success) {
      return bad(formatZodErrors(validation.error));
    }
    const { table, row } = validation.data;
    const policy = TABLES[table];
    if (!policy) return bad("Invalid or missing table");
    if (!canWrite(policy, auth) || policy.scope === "self") return bad("This table cannot be changed here", 403);

    const clean = cleanWrite(row);
    if (!clean.ok) return bad(`Column '${clean.column}' cannot be set here`);
    const insertData = policy.scope === "property" ? { ...clean.data, property_id: propertyId } : clean.data;

    const supabase: Db = createAdminClient();
    const { data, error } = await supabase.from(table).insert(insertData).select().single();

    if (error) {
      return handleDbError(error, "admin-db-insert");
    }
    await audit(supabase, auth, propertyId, "insert", table, (data as { id?: string } | null)?.id, clean.data);
    return NextResponse.json({ data: redact(data as Record<string, unknown>) }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ADMIN);
  if (!auth.authenticated) return auth.error!;

  try {
    const propertyId = await getActivePropertyId(request);
    if (!propertyId) return bad("No property access", 403);
    const body = await request.json().catch(() => null);

    const validation = validateBody(databaseActionSchema, body);
    if (!validation.success) {
      return bad(formatZodErrors(validation.error));
    }
    const { table, id, updates } = validation.data;
    const policy = TABLES[table];
    if (!policy) return bad("Invalid or missing table");
    if (!canWrite(policy, auth)) return bad("This table cannot be changed here", 403);
    if (!id) return bad("Row id is required");

    const clean = cleanWrite(updates);
    if (!clean.ok) return bad(`Column '${clean.column}' cannot be set here`);
    if (Object.keys(clean.data).length === 0) return bad("Nothing to update");

    const supabase: Db = createAdminClient();
    const { data, error } = await scoped(supabase.from(table).update(clean.data).eq("id", id), policy, propertyId)
      .select()
      .single();

    if (error) {
      return handleDbError(error, "admin-db-update");
    }
    await audit(supabase, auth, propertyId, "update", table, id, clean.data);
    return NextResponse.json({ data: redact(data as Record<string, unknown>) });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ADMIN);
  if (!auth.authenticated) return auth.error!;

  try {
    const propertyId = await getActivePropertyId(request);
    if (!propertyId) return bad("No property access", 403);
    const { searchParams } = request.nextUrl;
    const table = searchParams.get("table");
    const id = searchParams.get("id");

    const policy = table ? TABLES[table] : undefined;
    if (!table || !policy) return bad("Invalid or missing table");
    if (!canWrite(policy, auth) || policy.scope === "self") return bad("This table cannot be changed here", 403);
    if (!id) return bad("Row id is required");

    const supabase: Db = createAdminClient();
    const { error } = await scoped(supabase.from(table).delete().eq("id", id), policy, propertyId);

    if (error) {
      return handleDbError(error, "admin-db-delete");
    }
    await audit(supabase, auth, propertyId, "delete", table, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
