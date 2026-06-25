import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createHousekeepingTaskSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
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
      `)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);
    if (priority) query = query.eq("priority", priority);
    if (apartmentId) query = query.eq("apartment_id", apartmentId);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    if (date) query = query.eq("scheduled_date", date);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
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
