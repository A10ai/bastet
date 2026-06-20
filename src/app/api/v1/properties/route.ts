import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .order("name");

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

    const { data, error } = await supabase
      .from("properties")
      .insert(body)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAudit(supabase, {
      action: "property.create",
      category: "settings",
      resource_type: "property",
      resource_id: data?.id,
      description: `Created property ${data?.name || ""}`,
      new_data: body,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Property id is required" },
        { status: 400 }
      );
    }

    const allowedFields = [
      "name",
      "slug",
      "address",
      "city",
      "country",
      "timezone",
      "default_currency",
      "reporting_currency",
      "star_rating",
      "total_apartments",
      "status",
      "phone",
      "email",
      "website",
    ];
    const safeUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        safeUpdates[key] = updates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("properties")
      .update(safeUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAudit(supabase, {
      action: "property.update",
      category: "settings",
      resource_type: "property",
      resource_id: data?.id || id,
      description: `Updated property ${id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
