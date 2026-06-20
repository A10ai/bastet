import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/api-auth";
import { apiError, handleDbError } from "@/lib/api-error";

const ALLOWED_TABLES = [
  "properties",
  "buildings",
  "apartment_types",
  "apartments",
  "bookings",
  "booking_channels",
  "guests",
  "guest_preferences",
  "staff",
  "housekeeping_tasks",
  "maintenance_requests",
  "invoices",
  "payments",
  "expenses",
  "rates",
  "currency_rates",
  "demand_forecasts",
  "pricing_decisions",
  "apartment_amenities",
  "booking_addons",
  "booking_extras",
  "booking_status_history",
  "check_in_records",
  "cleaning_checklists",
  "cleaning_checklist_items",
  "daily_revenue_snapshots",
  "guest_communications",
  "guest_documents",
  "guest_loyalty",
  "guest_stays",
  "inventory_items",
  "inventory_transactions",
  "maintenance_parts",
  "notification_templates",
  "notifications",
  "property_policies",
  "rate_overrides",
  "review_responses",
  "reviews",
  "room_inspections",
  "staff_certifications",
  "staff_schedules",
  "supplier_orders",
  "suppliers",
  "workflows",
];

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["owner", "admin"]);
  if (!auth.authenticated) return auth.error!;

  try {
    const supabase = createAdminClient();
    const { searchParams } = request.nextUrl;
    const table = searchParams.get("table");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const search = searchParams.get("search") || "";
    const sortCol = searchParams.get("sort") || "created_at";
    const sortDir = searchParams.get("dir") === "asc" ? true : false;
    const perPage = 25;

    // If no table specified, return table list with counts
    if (!table) {
      const counts: Record<string, number> = {};
      for (const t of ALLOWED_TABLES) {
        const { count, error } = await supabase
          .from(t)
          .select("*", { count: "exact", head: true });
        if (!error) {
          counts[t] = count || 0;
        }
      }
      return NextResponse.json({ data: counts, tables: ALLOWED_TABLES });
    }

    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json(
        { error: `Table '${table}' is not allowed` },
        { status: 400 }
      );
    }

    // Get total count
    const countQuery = supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    const { count: totalCount } = await countQuery;

    // Get column info from first row
    const { data: sampleRow } = await supabase
      .from(table)
      .select("*")
      .limit(1)
      .maybeSingle();
    const columns = sampleRow ? Object.keys(sampleRow) : [];

    // Build query with pagination
    let query = supabase
      .from(table)
      .select("*")
      .range((page - 1) * perPage, page * perPage - 1);

    // Try to sort, fallback to no sort if column doesn't exist
    if (columns.includes(sortCol)) {
      query = query.order(sortCol, { ascending: sortDir });
    } else if (columns.includes("created_at")) {
      query = query.order("created_at", { ascending: false });
    }

    // Apply search across text-like columns
    if (search && columns.length > 0) {
      const textCols = columns.filter(
        (c) => !["id", "created_at", "updated_at"].includes(c)
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
      data: data || [],
      columns,
      total: totalCount || 0,
      page,
      perPage,
      totalPages: Math.ceil((totalCount || 0) / perPage),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["owner", "admin"]);
  if (!auth.authenticated) return auth.error!;

  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { table, row } = body;

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return NextResponse.json(
        { error: "Invalid or missing table" },
        { status: 400 }
      );
    }

    // Remove id if empty (let DB auto-generate)
    const insertData = { ...row };
    if (!insertData.id || insertData.id === "") {
      delete insertData.id;
    }

    const { data, error } = await supabase
      .from(table)
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return handleDbError(error, "admin-db-insert");
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, ["owner", "admin"]);
  if (!auth.authenticated) return auth.error!;

  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { table, id, updates } = body;

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return NextResponse.json(
        { error: "Invalid or missing table" },
        { status: 400 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { error: "Row id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from(table)
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return handleDbError(error, "admin-db-update");
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, ["owner", "admin"]);
  if (!auth.authenticated) return auth.error!;

  try {
    const supabase = createAdminClient();
    const { searchParams } = request.nextUrl;
    const table = searchParams.get("table");
    const id = searchParams.get("id");

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return NextResponse.json(
        { error: "Invalid or missing table" },
        { status: 400 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { error: "Row id is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from(table).delete().eq("id", id);

    if (error) {
      return handleDbError(error, "admin-db-delete");
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
