import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { passed, verified_by, notes } = body;

    const { data: task } = await supabase
      .from("housekeeping_tasks")
      .select("id, status, apartment_id")
      .eq("id", params.id)
      .single();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status !== "completed") {
      return NextResponse.json(
        { error: `Cannot verify task with status: ${task.status}. Must be completed.` },
        { status: 400 }
      );
    }

    if (passed) {
      // Verification passed
      const { data, error } = await supabase
        .from("housekeeping_tasks")
        .update({
          status: "verified",
          verified_by: verified_by || null,
          verified_at: new Date().toISOString(),
          notes: notes ? (task as Record<string, unknown>).notes ? `${(task as Record<string, unknown>).notes}\nVerification: ${notes}` : `Verification: ${notes}` : undefined,
        })
        .eq("id", params.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ data });
    } else {
      // Verification failed — issue found
      const updateData: Record<string, unknown> = {
        status: "issue_found",
        verified_by: verified_by || null,
        verified_at: new Date().toISOString(),
      };
      if (notes) {
        updateData.notes = notes;
      }

      const { data, error } = await supabase
        .from("housekeeping_tasks")
        .update(updateData)
        .eq("id", params.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Set apartment back to cleaning
      await supabase
        .from("apartments")
        .update({ status: "cleaning" })
        .eq("id", task.apartment_id);

      return NextResponse.json({ data });
    }
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
