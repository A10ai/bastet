import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isUniqueViolation } from "@/lib/db-errors";
import { requireRole, ROLES } from "@/lib/api-auth";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createHousekeepingTaskSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ROLES.ALL_STAFF);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const priority = searchParams.get("priority");
    const apartmentId = searchParams.get("apartment_id");
    const assignedTo = searchParams.get("assigned_to");
    const date = searchParams.get("date");

    let query = supabase
      .from("housekeeping_tasks")
      .select(`
        *,
        apartment:apartments(id, number, floor, building:buildings(id, name, code)),
        assigned_staff:staff!housekeeping_tasks_assigned_to_fkey(id, first_name, last_name, role)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);
    if (priority) query = query.eq("priority", priority);
    if (apartmentId) query = query.eq("apartment_id", apartmentId);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    if (date) query = query.eq("scheduled_date", date);

    const pagination = parsePagination(searchParams);
    query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data, meta: paginationMeta(pagination, count, (data || []).length) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ROLES.MANAGEMENT);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(createHousekeepingTaskSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const {
      apartment_id,
      type,
      priority = "normal",
      scheduled_date,
      assigned_to,
      notes,
    } = validated;

    // Get property_id from apartment
    const { data: apartment } = await supabase
      .from("apartments")
      .select("property_id")
      .eq("id", apartment_id)
      .single();

    if (!apartment) {
      return NextResponse.json({ error: "Apartment not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("housekeeping_tasks")
      .insert({
        property_id: apartment.property_id,
        apartment_id,
        type,
        status: assigned_to ? "assigned" : "pending",
        priority,
        scheduled_date,
        assigned_to: assigned_to || null,
        notes: notes || null,
      })
      .select(`
        *,
        apartment:apartments(id, number, floor, building:buildings(id, name, code)),
        assigned_staff:staff!housekeeping_tasks_assigned_to_fkey(id, first_name, last_name, role)
      `)
      .single();

    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "An open checkout clean for this unit and date already exists" },
        { status: 409 }
      );
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAudit(supabase, {
      action: "housekeeping.create",
      category: "housekeeping",
      resource_type: "housekeeping_task",
      resource_id: data?.id,
      description: `Created housekeeping task ${data?.type || type} for apartment ${apartment_id}`,
      new_data: body,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
