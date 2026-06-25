/**
 * HospitAI Workflow Engine
 *
 * Turns AI recommendations into executable multi-step actions with
 * human approval checkpoints. Closes the loop from "AI recommends"
 * to "system executes" with full audit trail.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent, type EventType } from "@/lib/event-bus";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import type { BrainDecision } from "@/lib/ai-brain";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  step_number: number;
  title: string;
  action_type:
    | "update_rate"
    | "create_housekeeping"
    | "create_maintenance"
    | "update_apartment_status"
    | "send_notification"
    | "emit_event"
    | "update_booking"
    | "custom";
  action_params: Record<string, unknown>;
  requires_approval: boolean;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  executed_at: string | null;
  result: Record<string, unknown> | null;
}

export interface Workflow {
  id: string;
  property_id: string | null;
  title: string;
  description: string | null;
  source: "ai_brain" | "automation" | "manual" | "event" | "anomaly";
  source_id: string | null;
  status: "pending" | "in_progress" | "awaiting_approval" | "approved" | "completed" | "failed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  steps: WorkflowStep[];
  current_step: number;
  total_steps: number;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  outcome: Record<string, unknown> | null;
  outcome_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkflowInput {
  title: string;
  description?: string;
  source: Workflow["source"];
  source_id?: string;
  property_id?: string;
  priority?: Workflow["priority"];
  steps: Array<{
    title: string;
    action_type: WorkflowStep["action_type"];
    action_params: Record<string, unknown>;
    requires_approval?: boolean;
  }>;
  created_by?: string;
}

export interface WorkflowStats {
  total: number;
  by_status: Record<string, number>;
  completed_this_week: number;
  avg_completion_hours: number | null;
  approval_rate: number | null;
}

// ---------------------------------------------------------------------------
// createWorkflow
// ---------------------------------------------------------------------------

export async function createWorkflow(
  supabase: SupabaseClient,
  input: CreateWorkflowInput
): Promise<Workflow | null> {
  const steps: WorkflowStep[] = input.steps.map((s, i) => ({
    step_number: i + 1,
    title: s.title,
    action_type: s.action_type,
    action_params: s.action_params,
    requires_approval: s.requires_approval ?? false,
    status: "pending" as const,
    executed_at: null,
    result: null,
  }));

  // Determine initial status: if first step requires approval, set awaiting_approval
  const firstStepNeedsApproval = steps.length > 0 && steps[0].requires_approval;
  const initialStatus = firstStepNeedsApproval ? "awaiting_approval" : "pending";

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      title: input.title,
      description: input.description || null,
      source: input.source,
      source_id: input.source_id || null,
      property_id: input.property_id || null,
      priority: input.priority || "normal",
      steps,
      current_step: 0,
      total_steps: steps.length,
      created_by: input.created_by || null,
      status: initialStatus,
    })
    .select("*")
    .single();

  if (error || !data) {
    logger.error({ err: error?.message }, "[Workflow] Failed to create workflow");
    return null;
  }

  const workflow = data as Workflow;

  await logAudit(supabase, {
    action: "workflow_created",
    category: "system",
    resource_type: "workflow",
    resource_id: workflow.id,
    description: `Workflow created: "${input.title}" (${input.source}) with ${steps.length} steps`,
    new_data: {
      source: input.source,
      priority: input.priority || "normal",
      total_steps: steps.length,
      status: initialStatus,
    },
  });

  // Notify staff about workflows that need approval
  if (initialStatus === "awaiting_approval") {
    await createNotification(supabase, {
      title: `Workflow awaiting approval: ${input.title}`,
      message: `A ${input.priority || "normal"} priority workflow from ${input.source} requires your approval. ${steps.length} step${steps.length > 1 ? "s" : ""} planned.`,
      type: "warning",
      category: "system",
      link: "/dashboard/ai/workflows",
    });
  }

  return workflow;
}

// ---------------------------------------------------------------------------
// getWorkflows
// ---------------------------------------------------------------------------

export async function getWorkflows(
  supabase: SupabaseClient,
  options: { status?: string; limit?: number } = {}
): Promise<Workflow[]> {
  const { status, limit = 50 } = options;

  let query = supabase
    .from("workflows")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ err: error.message }, "[Workflow] Failed to fetch workflows");
    return [];
  }

  return (data || []) as Workflow[];
}

// ---------------------------------------------------------------------------
// getWorkflow
// ---------------------------------------------------------------------------

export async function getWorkflow(
  supabase: SupabaseClient,
  id: string
): Promise<Workflow | null> {
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as Workflow;
}

// ---------------------------------------------------------------------------
// approveWorkflow
// ---------------------------------------------------------------------------

export async function approveWorkflow(
  supabase: SupabaseClient,
  id: string,
  approvedBy: string
): Promise<Workflow | null> {
  const workflow = await getWorkflow(supabase, id);
  if (!workflow) return null;

  if (workflow.status !== "awaiting_approval" && workflow.status !== "pending") {
    logger.error({ status: workflow.status }, "[Workflow] Cannot approve workflow in status");
    return null;
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("workflows")
    .update({
      status: "approved",
      approved_by: approvedBy,
      approved_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    logger.error({ err: error?.message }, "[Workflow] Failed to approve workflow");
    return null;
  }

  await logAudit(supabase, {
    action: "workflow_approved",
    category: "system",
    resource_type: "workflow",
    resource_id: id,
    description: `Workflow approved: "${workflow.title}" by ${approvedBy}`,
    new_data: { approved_by: approvedBy, approved_at: now },
  });

  const approved = data as Workflow;

  // If first step doesn't need separate approval, auto-execute it
  if (approved.steps.length > 0 && !approved.steps[0].requires_approval) {
    return await executeNextStep(supabase, id);
  }

  return approved;
}

// ---------------------------------------------------------------------------
// executeNextStep
// ---------------------------------------------------------------------------

export async function executeNextStep(
  supabase: SupabaseClient,
  workflowId: string
): Promise<Workflow | null> {
  const workflow = await getWorkflow(supabase, workflowId);
  if (!workflow) return null;

  // Validate state
  if (
    workflow.status !== "approved" &&
    workflow.status !== "in_progress" &&
    workflow.status !== "pending"
  ) {
    logger.error({ status: workflow.status }, "[Workflow] Cannot execute step in status");
    return null;
  }

  const stepIndex = workflow.current_step;
  if (stepIndex >= workflow.total_steps) {
    logger.error("[Workflow] All steps already executed");
    return null;
  }

  const step = workflow.steps[stepIndex];
  if (!step) return null;

  // Check if this step requires approval and workflow isn't approved
  if (step.requires_approval && workflow.status !== "approved" && workflow.status !== "in_progress") {
    // Set workflow to awaiting_approval
    const { data } = await supabase
      .from("workflows")
      .update({ status: "awaiting_approval", updated_at: new Date().toISOString() })
      .eq("id", workflowId)
      .select("*")
      .single();

    return data as Workflow | null;
  }

  // Mark step as in_progress
  const steps = [...workflow.steps];
  steps[stepIndex] = { ...step, status: "in_progress" };

  await supabase
    .from("workflows")
    .update({
      steps,
      status: "in_progress",
      updated_at: new Date().toISOString(),
    })
    .eq("id", workflowId);

  // Execute the step action
  let result: Record<string, unknown> = {};
  let success = false;

  try {
    result = await executeStepAction(supabase, step);
    success = true;
  } catch (err) {
    result = {
      error: err instanceof Error ? err.message : String(err),
    };
    success = false;
  }

  // Update step with result
  const now = new Date().toISOString();
  steps[stepIndex] = {
    ...steps[stepIndex],
    status: success ? "completed" : "failed",
    executed_at: now,
    result,
  };

  const nextStep = stepIndex + 1;
  const allDone = nextStep >= workflow.total_steps;
  const failed = !success;

  // Determine next status
  let nextStatus: Workflow["status"] = "in_progress";
  if (failed) {
    nextStatus = "failed";
  } else if (allDone) {
    nextStatus = "completed";
  } else if (steps[nextStep]?.requires_approval) {
    nextStatus = "awaiting_approval";
  }

  const updatePayload: Record<string, unknown> = {
    steps,
    current_step: nextStep,
    status: nextStatus,
    updated_at: now,
  };

  if (allDone && success) {
    updatePayload.completed_at = now;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("workflows")
    .update(updatePayload)
    .eq("id", workflowId)
    .select("*")
    .single();

  if (updateErr) {
    logger.error({ err: updateErr.message }, "[Workflow] Failed to update workflow after step execution");
    return null;
  }

  // Audit log the step execution
  await logAudit(supabase, {
    action: success ? "workflow_step_completed" : "workflow_step_failed",
    category: "system",
    resource_type: "workflow",
    resource_id: workflowId,
    description: `Step ${stepIndex + 1}/${workflow.total_steps}: "${step.title}" (${step.action_type}) ${success ? "completed" : "failed"}`,
    new_data: {
      step_number: stepIndex + 1,
      action_type: step.action_type,
      result,
    },
  });

  // If workflow completed, send notification
  if (allDone && success) {
    await createNotification(supabase, {
      title: `Workflow completed: ${workflow.title}`,
      message: `All ${workflow.total_steps} steps executed successfully.`,
      type: "success",
      category: "system",
      link: "/dashboard/ai/workflows",
    });

    await logAudit(supabase, {
      action: "workflow_completed",
      category: "system",
      resource_type: "workflow",
      resource_id: workflowId,
      description: `Workflow "${workflow.title}" completed all ${workflow.total_steps} steps.`,
    });
  }

  // If next step needs approval, notify
  if (nextStatus === "awaiting_approval") {
    await createNotification(supabase, {
      title: `Approval needed: Step ${nextStep + 1} of "${workflow.title}"`,
      message: `Step "${steps[nextStep].title}" requires your approval before execution.`,
      type: "warning",
      category: "system",
      link: "/dashboard/ai/workflows",
    });
  }

  return updated as Workflow;
}

// ---------------------------------------------------------------------------
// executeStepAction — dispatches each action type to its handler
// ---------------------------------------------------------------------------

async function executeStepAction(
  supabase: SupabaseClient,
  step: WorkflowStep
): Promise<Record<string, unknown>> {
  const params = step.action_params;

  switch (step.action_type) {
    case "update_rate": {
      const typeId = params.type_id as string;
      const newRate = params.new_rate as number;
      if (!typeId || typeof newRate !== "number") {
        throw new Error("update_rate requires type_id and new_rate");
      }

      // Get old rate for audit
      const { data: oldType } = await supabase
        .from("apartment_types")
        .select("base_weekly_rate_gbp, name")
        .eq("id", typeId)
        .single();

      const { error } = await supabase
        .from("apartment_types")
        .update({ base_weekly_rate_gbp: newRate })
        .eq("id", typeId);

      if (error) throw new Error(`Failed to update rate: ${error.message}`);

      return {
        type_id: typeId,
        type_name: oldType?.name || "unknown",
        old_rate: oldType?.base_weekly_rate_gbp,
        new_rate: newRate,
      };
    }

    case "create_housekeeping": {
      const { apartment_id, type, priority, scheduled_date, notes } = params as {
        apartment_id?: string;
        type?: string;
        priority?: string;
        scheduled_date?: string;
        notes?: string;
      };

      if (!apartment_id) throw new Error("create_housekeeping requires apartment_id");

      // Get property_id from apartment
      const { data: apt } = await supabase
        .from("apartments")
        .select("property_id, number")
        .eq("id", apartment_id)
        .single();

      if (!apt) throw new Error("Apartment not found");

      const { data: task, error } = await supabase
        .from("housekeeping_tasks")
        .insert({
          property_id: apt.property_id,
          apartment_id,
          type: type || "checkout_clean",
          status: "pending",
          priority: priority || "normal",
          scheduled_date: scheduled_date || new Date().toISOString().split("T")[0],
          notes: notes || null,
        })
        .select("id")
        .single();

      if (error) throw new Error(`Failed to create housekeeping task: ${error.message}`);

      return {
        task_id: task?.id,
        apartment: apt.number,
        type: type || "checkout_clean",
      };
    }

    case "create_maintenance": {
      const { apartment_id, title, description, category, priority } = params as {
        apartment_id?: string;
        title?: string;
        description?: string;
        category?: string;
        priority?: string;
      };

      if (!apartment_id) throw new Error("create_maintenance requires apartment_id");

      const { data: apt } = await supabase
        .from("apartments")
        .select("property_id, number")
        .eq("id", apartment_id)
        .single();

      if (!apt) throw new Error("Apartment not found");

      const { data: req, error } = await supabase
        .from("maintenance_requests")
        .insert({
          property_id: apt.property_id,
          apartment_id,
          title: title || "Maintenance request",
          description: description || null,
          category: category || "general",
          priority: priority || "normal",
          status: "open",
        })
        .select("id")
        .single();

      if (error) throw new Error(`Failed to create maintenance request: ${error.message}`);

      return {
        request_id: req?.id,
        apartment: apt.number,
        category: category || "general",
      };
    }

    case "update_apartment_status": {
      const { apartment_id, status } = params as {
        apartment_id?: string;
        status?: string;
      };

      if (!apartment_id || !status) {
        throw new Error("update_apartment_status requires apartment_id and status");
      }

      const { data: oldApt } = await supabase
        .from("apartments")
        .select("status, number")
        .eq("id", apartment_id)
        .single();

      const { error } = await supabase
        .from("apartments")
        .update({ status })
        .eq("id", apartment_id);

      if (error) throw new Error(`Failed to update apartment status: ${error.message}`);

      return {
        apartment_id,
        apartment: oldApt?.number,
        old_status: oldApt?.status,
        new_status: status,
      };
    }

    case "send_notification": {
      const { title, message, type, category, link } = params as {
        title?: string;
        message?: string;
        type?: string;
        category?: string;
        link?: string;
      };

      if (!title || !message) {
        throw new Error("send_notification requires title and message");
      }

      await createNotification(supabase, {
        title,
        message,
        type: (type as "info" | "success" | "warning" | "error") || "info",
        category: (category as "system") || "system",
        link: link || null,
      });

      return { title, sent: true };
    }

    case "emit_event": {
      const { event_type, source_system, payload } = params as {
        event_type?: string;
        source_system?: string;
        payload?: Record<string, unknown>;
      };

      if (!event_type) throw new Error("emit_event requires event_type");

      const result = await emitEvent(
        event_type as EventType,
        source_system || "workflow_engine",
        payload || {},
        supabase
      );

      return { event_id: result.event_id, handlers_triggered: result.results.length };
    }

    case "update_booking": {
      const { booking_id, status } = params as {
        booking_id?: string;
        status?: string;
      };

      if (!booking_id || !status) {
        throw new Error("update_booking requires booking_id and status");
      }

      const { data: oldBooking } = await supabase
        .from("bookings")
        .select("status")
        .eq("id", booking_id)
        .single();

      const { error } = await supabase
        .from("bookings")
        .update({ status })
        .eq("id", booking_id);

      if (error) throw new Error(`Failed to update booking: ${error.message}`);

      return {
        booking_id,
        old_status: oldBooking?.status,
        new_status: status,
      };
    }

    case "custom": {
      // Manual step -- just mark as done
      return { manual: true, note: params.note || "Manual step completed" };
    }

    default:
      throw new Error(`Unknown action type: ${step.action_type}`);
  }
}

// ---------------------------------------------------------------------------
// cancelWorkflow
// ---------------------------------------------------------------------------

export async function cancelWorkflow(
  supabase: SupabaseClient,
  id: string,
  reason: string
): Promise<Workflow | null> {
  const workflow = await getWorkflow(supabase, id);
  if (!workflow) return null;

  if (workflow.status === "completed" || workflow.status === "cancelled") {
    logger.error({ status: workflow.status }, "[Workflow] Cannot cancel workflow in status");
    return null;
  }

  const now = new Date().toISOString();

  // Mark remaining pending steps as skipped
  const steps = workflow.steps.map((s) =>
    s.status === "pending" ? { ...s, status: "skipped" as const } : s
  );

  const { data, error } = await supabase
    .from("workflows")
    .update({
      status: "cancelled",
      steps,
      outcome_notes: reason,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    logger.error({ err: error.message }, "[Workflow] Failed to cancel workflow");
    return null;
  }

  await logAudit(supabase, {
    action: "workflow_cancelled",
    category: "system",
    resource_type: "workflow",
    resource_id: id,
    description: `Workflow cancelled: "${workflow.title}". Reason: ${reason}`,
    new_data: { reason },
  });

  return data as Workflow;
}

// ---------------------------------------------------------------------------
// recordOutcome — feeds the learning engine
// ---------------------------------------------------------------------------

export async function recordOutcome(
  supabase: SupabaseClient,
  id: string,
  outcome: Record<string, unknown>,
  notes: string
): Promise<Workflow | null> {
  const workflow = await getWorkflow(supabase, id);
  if (!workflow) return null;

  const { data, error } = await supabase
    .from("workflows")
    .update({
      outcome,
      outcome_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    logger.error({ err: error.message }, "[Workflow] Failed to record outcome");
    return null;
  }

  await logAudit(supabase, {
    action: "workflow_outcome_recorded",
    category: "system",
    resource_type: "workflow",
    resource_id: id,
    description: `Outcome recorded for "${workflow.title}": ${notes}`,
    new_data: { outcome, notes },
  });

  return data as Workflow;
}

// ---------------------------------------------------------------------------
// createWorkflowFromBrainDecision
// ---------------------------------------------------------------------------

export async function createWorkflowFromBrainDecision(
  supabase: SupabaseClient,
  decision: BrainDecision,
  mode: "supervised" | "autonomous"
): Promise<Workflow | null> {
  const steps: CreateWorkflowInput["steps"] = [];
  const requiresApproval = mode === "supervised";

  switch (decision.category) {
    case "pricing": {
      // For pricing decisions, create rate update steps for each apartment type
      const { data: types } = await supabase
        .from("apartment_types")
        .select("id, name, base_weekly_rate_gbp");

      if (types && types.length > 0) {
        // Parse percentage from action text (e.g., "Increase rates by 12-18%")
        const match = decision.action.match(/(\d+)(?:-(\d+))?%/);
        const pct = match ? parseInt(match[1], 10) : 10;
        const isIncrease = /increase|raise|boost/i.test(decision.action);
        const multiplier = isIncrease ? 1 + pct / 100 : 1 - pct / 100;

        for (const t of types) {
          const newRate = Math.round(((t as Record<string, any>).base_weekly_rate_gbp || 0) * multiplier * 100) / 100;
          steps.push({
            title: `Adjust ${(t as Record<string, any>).name} rate to ${newRate.toFixed(2)}`,
            action_type: "update_rate",
            action_params: { type_id: (t as Record<string, any>).id, new_rate: newRate },
            requires_approval: requiresApproval,
          });
        }
      }
      break;
    }

    case "maintenance": {
      // Investigation workflow with multiple steps
      const isInvestigation = /investigate|inspect|review/i.test(decision.action);

      if (isInvestigation) {
        steps.push({
          title: "Assign technician for investigation",
          action_type: "send_notification",
          action_params: {
            title: `Investigation needed: ${decision.action}`,
            message: decision.reasoning,
            type: "warning",
            category: "maintenance",
            link: "/dashboard/maintenance",
          },
          requires_approval: requiresApproval,
        });
        steps.push({
          title: "Conduct on-site inspection",
          action_type: "custom",
          action_params: { note: "Inspect units and document findings" },
          requires_approval: false,
        });
        steps.push({
          title: "Resolve findings and update status",
          action_type: "custom",
          action_params: { note: "Create work orders based on inspection results" },
          requires_approval: false,
        });
      } else {
        // Single-step: prioritise or create maintenance
        steps.push({
          title: decision.action,
          action_type: "send_notification",
          action_params: {
            title: `Maintenance action: ${decision.action}`,
            message: decision.reasoning,
            type: "warning",
            category: "maintenance",
            link: "/dashboard/maintenance",
          },
          requires_approval: requiresApproval,
        });
      }
      break;
    }

    case "operations": {
      steps.push({
        title: decision.action,
        action_type: "send_notification",
        action_params: {
          title: `Operations: ${decision.action}`,
          message: decision.reasoning,
          type: "info",
          category: "system",
          link: "/dashboard/housekeeping",
        },
        requires_approval: requiresApproval,
      });
      break;
    }

    case "energy": {
      // Energy decisions typically involve status updates
      steps.push({
        title: decision.action,
        action_type: "send_notification",
        action_params: {
          title: `Energy: ${decision.action}`,
          message: decision.reasoning,
          type: "info",
          category: "system",
          link: "/dashboard/energy",
        },
        requires_approval: requiresApproval,
      });

      if (decision.event_type) {
        steps.push({
          title: "Emit energy event",
          action_type: "emit_event",
          action_params: {
            event_type: decision.event_type,
            source_system: "workflow_engine",
            payload: decision.event_payload || {},
          },
          requires_approval: false,
        });
      }
      break;
    }

    case "guest": {
      steps.push({
        title: decision.action,
        action_type: "send_notification",
        action_params: {
          title: `Guest: ${decision.action}`,
          message: decision.reasoning,
          type: "info",
          category: "guest",
          link: "/dashboard/guests",
        },
        requires_approval: requiresApproval,
      });
      break;
    }

    case "revenue": {
      steps.push({
        title: decision.action,
        action_type: "send_notification",
        action_params: {
          title: `Revenue: ${decision.action}`,
          message: decision.reasoning,
          type: "info",
          category: "pricing",
          link: "/dashboard/ai/revenue",
        },
        requires_approval: requiresApproval,
      });
      break;
    }

    default: {
      steps.push({
        title: decision.action,
        action_type: "custom",
        action_params: { note: decision.reasoning },
        requires_approval: requiresApproval,
      });
    }
  }

  if (steps.length === 0) return null;

  // Map decision confidence to priority
  let priority: Workflow["priority"] = "normal";
  if (decision.confidence >= 90) priority = "high";
  if (decision.confidence >= 95) priority = "urgent";
  if (decision.confidence < 60) priority = "low";

  const workflow = await createWorkflow(supabase, {
    title: decision.action,
    description: decision.reasoning,
    source: "ai_brain",
    source_id: decision.id,
    priority,
    steps,
    created_by: "ai_brain",
  });

  // In autonomous mode with high confidence, auto-approve
  if (workflow && mode === "autonomous" && decision.auto_executable && decision.confidence >= 75) {
    return await approveWorkflow(supabase, workflow.id, "ai_brain_autonomous");
  }

  return workflow;
}

// ---------------------------------------------------------------------------
// getWorkflowStats
// ---------------------------------------------------------------------------

export async function getWorkflowStats(
  supabase: SupabaseClient
): Promise<WorkflowStats> {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [allRes, completedWeekRes] = await Promise.all([
    supabase.from("workflows").select("id, status, created_at, completed_at, approved_by"),
    supabase
      .from("workflows")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", weekAgo),
  ]);

  const workflows = (allRes.data || []) as Array<{
    id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    approved_by: string | null;
  }>;

  const byStatus: Record<string, number> = {};
  for (const w of workflows) {
    byStatus[w.status] = (byStatus[w.status] || 0) + 1;
  }

  // Calculate avg completion time for completed workflows
  const completedWithTimes = workflows.filter((w) => w.status === "completed" && w.completed_at);
  let avgCompletionHours: number | null = null;
  if (completedWithTimes.length > 0) {
    const totalHours = completedWithTimes.reduce((sum, w) => {
      const created = new Date(w.created_at).getTime();
      const completed = new Date(w.completed_at!).getTime();
      return sum + (completed - created) / 3600000;
    }, 0);
    avgCompletionHours = Math.round((totalHours / completedWithTimes.length) * 10) / 10;
  }

  // Approval rate: approved / (approved + cancelled)
  const approved = workflows.filter((w) => w.approved_by).length;
  const cancelled = byStatus["cancelled"] || 0;
  const approvalRate = approved + cancelled > 0 ? Math.round((approved / (approved + cancelled)) * 100) : null;

  return {
    total: workflows.length,
    by_status: byStatus,
    completed_this_week: completedWeekRes.count || 0,
    avg_completion_hours: avgCompletionHours,
    approval_rate: approvalRate,
  };
}
