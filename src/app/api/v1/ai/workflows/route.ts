import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import {
  createWorkflow,
  getWorkflows,
  getWorkflow,
  approveWorkflow,
  executeNextStep,
  cancelWorkflow,
  recordOutcome,
  getWorkflowStats,
} from "@/lib/workflow-engine";
import { validateBody, formatZodErrors, workflowSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;

    const type = searchParams.get("type");

    // Stats endpoint
    if (type === "stats") {
      const stats = await getWorkflowStats(supabase);
      return NextResponse.json({ data: stats });
    }

    // Single workflow
    const id = searchParams.get("id");
    if (id) {
      const workflow = await getWorkflow(supabase, id);
      if (!workflow) {
        return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
      }
      return NextResponse.json({ data: workflow });
    }

    // List workflows
    const status = searchParams.get("status") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const workflows = await getWorkflows(supabase, { status, limit });
    return NextResponse.json({ data: workflows });
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

    const validation = validateBody(workflowSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;
    const { action } = validated;

    switch (action) {
      case "create": {
        const { title, description, source, source_id, priority, steps, created_by } = validated;
        if (!title || !source || !steps || !Array.isArray(steps)) {
          return NextResponse.json(
            { error: "Missing required fields: title, source, steps" },
            { status: 400 }
          );
        }
        const workflow = await createWorkflow(supabase, {
          title,
          description: description ?? undefined,
          source: source ?? undefined,
          source_id: source_id ?? undefined,
          priority,
          steps: steps as Parameters<typeof createWorkflow>[1]["steps"],
          created_by: created_by ?? undefined,
        });
        if (!workflow) {
          return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 });
        }
        return NextResponse.json({ data: workflow }, { status: 201 });
      }

      case "approve": {
        const { id, approved_by } = validated;
        if (!id) {
          return NextResponse.json({ error: "Missing workflow id" }, { status: 400 });
        }
        const workflow = await approveWorkflow(supabase, id, approved_by || "staff");
        if (!workflow) {
          return NextResponse.json({ error: "Failed to approve workflow" }, { status: 400 });
        }
        return NextResponse.json({ data: workflow });
      }

      case "execute_step": {
        const { id } = validated;
        if (!id) {
          return NextResponse.json({ error: "Missing workflow id" }, { status: 400 });
        }
        const workflow = await executeNextStep(supabase, id);
        if (!workflow) {
          return NextResponse.json({ error: "Failed to execute step" }, { status: 400 });
        }
        return NextResponse.json({ data: workflow });
      }

      case "cancel": {
        const { id, reason } = validated;
        if (!id) {
          return NextResponse.json({ error: "Missing workflow id" }, { status: 400 });
        }
        const workflow = await cancelWorkflow(supabase, id, reason || "Cancelled by user");
        if (!workflow) {
          return NextResponse.json({ error: "Failed to cancel workflow" }, { status: 400 });
        }
        return NextResponse.json({ data: workflow });
      }

      case "record_outcome": {
        const { id, outcome, notes } = validated;
        if (!id) {
          return NextResponse.json({ error: "Missing workflow id" }, { status: 400 });
        }
        const workflow = await recordOutcome(supabase, id, outcome || {}, notes || "");
        if (!workflow) {
          return NextResponse.json({ error: "Failed to record outcome" }, { status: 400 });
        }
        return NextResponse.json({ data: workflow });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
