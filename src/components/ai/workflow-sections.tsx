"use client";

import { useState } from "react";
import { } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, Play, Loader2, Plus, ChevronDown, ChevronRight, Brain, Zap, User, Activity, Search, X } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  step_number: number;
  title: string;
  action_type: string;
  action_params: Record<string, unknown>;
  requires_approval: boolean;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  executed_at: string | null;
  result: Record<string, unknown> | null;
}

export interface Workflow {
  id: string;
  title: string;
  description: string | null;
  source: string;
  source_id: string | null;
  status: string;
  priority: string;
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

export interface WorkflowStats {
  total: number;
  by_status: Record<string, number>;
  completed_this_week: number;
  avg_completion_hours: number | null;
  approval_rate: number | null;
}

// ---------------------------------------------------------------------------
// Source badge config
// ---------------------------------------------------------------------------

export const SOURCE_CONFIG: Record<string, { label: string; color: string; icon: typeof Brain }> = {
  ai_brain: { label: "AI Brain", color: "bg-purple-400/10 text-purple-400 border-purple-400/20", icon: Brain },
  automation: { label: "Automation", color: "bg-cyan-400/10 text-cyan-400 border-cyan-400/20", icon: Zap },
  manual: { label: "Manual", color: "bg-text-secondary/10 text-text-secondary border-brand-border", icon: User },
  event: { label: "Event", color: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20", icon: Activity },
  anomaly: { label: "Anomaly", color: "bg-amber-400/10 text-amber-400 border-amber-400/20", icon: Search },
};

export const PRIORITY_CONFIG: Record<string, string> = {
  urgent: "bg-status-error/10 text-status-error border-status-error/20",
  high: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  normal: "bg-text-secondary/10 text-text-secondary border-brand-border",
  low: "bg-brand-bg text-text-muted border-brand-border",
};

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-status-warning/10 text-status-warning" },
  in_progress: { label: "In Progress", color: "bg-brand-accent-muted text-brand-accent" },
  awaiting_approval: { label: "Awaiting Approval", color: "bg-amber-400/10 text-amber-400" },
  approved: { label: "Approved", color: "bg-status-info/10 text-status-info" },
  completed: { label: "Completed", color: "bg-status-success/10 text-status-success" },
  failed: { label: "Failed", color: "bg-status-error/10 text-status-error" },
  cancelled: { label: "Cancelled", color: "bg-text-secondary/10 text-text-secondary" },
};

// ---------------------------------------------------------------------------
// Step Status Icons
// ---------------------------------------------------------------------------

export function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="w-4 h-4 text-status-success" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-status-error" />;
    case "in_progress":
      return <Loader2 className="w-4 h-4 text-brand-accent animate-spin" />;
    case "skipped":
      return <X className="w-4 h-4 text-text-muted" />;
    default:
      return <Clock className="w-4 h-4 text-text-muted" />;
  }
}

// ---------------------------------------------------------------------------
// Step Progress Indicator
// ---------------------------------------------------------------------------

export function StepProgress({ steps, currentStep }: { steps: WorkflowStep[]; currentStep: number }) {
  return (
    <div className="flex items-center gap-0.5" role="progressbar" aria-valuenow={currentStep} aria-valuemax={steps.length}>
      {steps.map((step, i) => {
        const isActive = i === currentStep && step.status !== "completed" && step.status !== "failed";
        return (
          <div key={i} className="flex items-center">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all",
                step.status === "completed"
                  ? "bg-status-success/20 border-status-success text-status-success"
                  : step.status === "failed"
                  ? "bg-status-error/20 border-status-error text-status-error"
                  : step.status === "skipped"
                  ? "bg-brand-bg border-brand-border text-text-muted"
                  : isActive
                  ? "bg-cyan-400/20 border-cyan-400 text-cyan-400"
                  : "bg-brand-bg border-brand-border text-text-muted"
              )}
              title={`Step ${i + 1}: ${step.title} (${step.status})`}
            >
              {step.status === "completed" ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : step.status === "failed" ? (
                <XCircle className="w-3.5 h-3.5" />
              ) : (
                i + 1
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "w-4 h-0.5 mx-0.5",
                  step.status === "completed" ? "bg-status-success" : "bg-brand-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workflow Card
// ---------------------------------------------------------------------------

export function WorkflowCard({
  workflow,
  onApprove,
  onReject,
  onExecute,
  loading,
}: {
  workflow: Workflow;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onExecute: (id: string) => void;
  loading: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const source = SOURCE_CONFIG[workflow.source] || SOURCE_CONFIG.manual;
  const SourceIcon = source.icon;
  const isApprovalNeeded = workflow.status === "awaiting_approval";
  const canExecute =
    workflow.status === "approved" ||
    workflow.status === "in_progress" ||
    (workflow.status === "pending" && !workflow.steps[workflow.current_step]?.requires_approval);

  return (
    <div
      className={cn(
        "border rounded-xl bg-brand-card transition-colors",
        isApprovalNeeded
          ? "border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.06)]"
          : "border-brand-border"
      )}
    >
      {/* Header */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className={cn("text-[10px] border", source.color)}>
                <SourceIcon className="w-3 h-3 mr-1" />
                {source.label}
              </Badge>
              <Badge className={cn("text-[10px] border", PRIORITY_CONFIG[workflow.priority] || PRIORITY_CONFIG.normal)}>
                {workflow.priority}
              </Badge>
              <Badge className={cn("text-[10px]", STATUS_CONFIG[workflow.status]?.color || "")}>
                {STATUS_CONFIG[workflow.status]?.label || workflow.status}
              </Badge>
            </div>
            <h4 className="text-sm font-semibold text-text-primary truncate">{workflow.title}</h4>
            {workflow.description && (
              <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{workflow.description}</p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <StepProgress steps={workflow.steps} currentStep={workflow.current_step} />
            <span className="text-[10px] text-text-muted">
              {workflow.current_step}/{workflow.total_steps} steps
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-brand-border">
          <div className="flex items-center gap-2">
            {isApprovalNeeded && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onApprove(workflow.id)}
                  disabled={loading === workflow.id}
                >
                  {loading === workflow.id ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3 h-3 mr-1" />
                  )}
                  Approve
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onReject(workflow.id)}
                  disabled={loading === workflow.id}
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Reject
                </Button>
              </>
            )}
            {canExecute && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onExecute(workflow.id)}
                disabled={loading === workflow.id}
              >
                {loading === workflow.id ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Play className="w-3 h-3 mr-1" />
                )}
                Execute Step {workflow.current_step + 1}
              </Button>
            )}
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse step details" : "Expand step details"}
          >
            {expanded ? "Hide" : "Steps"}
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Expanded Step Details */}
      {expanded && (
        <div className="px-5 pb-4 pt-0 space-y-2">
          {workflow.steps.map((step, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border",
                step.status === "completed"
                  ? "bg-status-success/5 border-status-success/20"
                  : step.status === "failed"
                  ? "bg-status-error/5 border-status-error/20"
                  : step.status === "in_progress"
                  ? "bg-cyan-400/5 border-cyan-400/20"
                  : "bg-brand-bg/50 border-brand-border"
              )}
            >
              <div className="flex-shrink-0 mt-0.5">
                <StepStatusIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-primary">
                    Step {step.step_number}
                  </span>
                  <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-brand-bg">
                    {step.action_type}
                  </span>
                  {step.requires_approval && (
                    <span className="text-[10px] text-amber-400 px-1.5 py-0.5 rounded bg-amber-400/10">
                      approval required
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary mt-0.5">{step.title}</p>
                {step.executed_at && (
                  <p className="text-[10px] text-text-muted mt-1">
                    Executed {timeAgo(step.executed_at)}
                  </p>
                )}
                {step.result && (
                  <pre className="text-[10px] text-text-muted mt-1 font-mono bg-brand-bg rounded p-1.5 overflow-x-auto">
                    {JSON.stringify(step.result, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}

          {/* Outcome section for completed workflows */}
          {workflow.status === "completed" && (
            <div className="pt-2 border-t border-brand-border">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Duration</p>
              <p className="text-xs text-text-secondary">
                Created {timeAgo(workflow.created_at)}
                {workflow.completed_at && ` -- Completed ${timeAgo(workflow.completed_at)}`}
              </p>
              {workflow.outcome_notes && (
                <>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider mt-2 mb-1">Outcome</p>
                  <p className="text-xs text-text-secondary">{workflow.outcome_notes}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Workflow Modal
// ---------------------------------------------------------------------------

export function CreateWorkflowModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description: string;
    priority: string;
    steps: Array<{ title: string; action_type: string; action_params: Record<string, unknown>; requires_approval: boolean }>;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [steps, setSteps] = useState<
    Array<{ title: string; action_type: string; requires_approval: boolean }>
  >([{ title: "", action_type: "custom", requires_approval: false }]);

  if (!open) return null;

  const addStep = () => {
    setSteps([...steps, { title: "", action_type: "custom", requires_approval: false }]);
  };

  const removeStep = (i: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, idx) => idx !== i));
  };

  const updateStep = (i: number, field: string, value: string | boolean) => {
    const updated = [...steps];
    updated[i] = { ...updated[i], [field]: value };
    setSteps(updated);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (steps.some((s) => !s.title.trim())) return;

    onCreate({
      title: title.trim(),
      description: description.trim(),
      priority,
      steps: steps.map((s) => ({
        title: s.title,
        action_type: s.action_type,
        action_params: s.action_type === "custom" ? { note: s.title } : {},
        requires_approval: s.requires_approval,
      })),
    });

    // Reset form
    setTitle("");
    setDescription("");
    setPriority("normal");
    setSteps([{ title: "", action_type: "custom", requires_approval: false }]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 bg-brand-card border border-brand-border rounded-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" role="dialog" aria-label="Create workflow">
        <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">Create Workflow</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block" htmlFor="wf-title">Title</label>
            <input
              id="wf-title"
              className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
              placeholder="Workflow title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block" htmlFor="wf-desc">Description</label>
            <textarea
              id="wf-desc"
              className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-cyan-400/50 resize-none"
              placeholder="What does this workflow accomplish?"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Priority</label>
            <div className="flex gap-2">
              {["low", "normal", "high", "urgent"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize",
                    priority === p
                      ? PRIORITY_CONFIG[p]
                      : "bg-brand-bg border-brand-border text-text-muted hover:text-text-secondary"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">Steps</label>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-brand-bg border border-brand-border">
                  <span className="text-[10px] font-bold text-text-muted mt-2 w-4 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 space-y-2">
                    <input
                      className="w-full bg-brand-card border border-brand-border rounded px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
                      placeholder="Step title"
                      value={step.title}
                      onChange={(e) => updateStep(i, "title", e.target.value)}
                    />
                    <div className="flex items-center gap-3">
                      <select
                        className="bg-brand-card border border-brand-border rounded px-2 py-1 text-[11px] text-text-secondary focus:outline-none"
                        value={step.action_type}
                        onChange={(e) => updateStep(i, "action_type", e.target.value)}
                      >
                        <option value="custom">Manual Step</option>
                        <option value="send_notification">Send Notification</option>
                        <option value="update_rate">Update Rate</option>
                        <option value="create_housekeeping">Create Housekeeping</option>
                        <option value="create_maintenance">Create Maintenance</option>
                        <option value="update_apartment_status">Update Apartment Status</option>
                        <option value="emit_event">Emit Event</option>
                        <option value="update_booking">Update Booking</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-brand-border"
                          checked={step.requires_approval}
                          onChange={(e) => updateStep(i, "requires_approval", e.target.checked)}
                        />
                        Requires approval
                      </label>
                    </div>
                  </div>
                  {steps.length > 1 && (
                    <button
                      onClick={() => removeStep(i)}
                      className="text-text-muted hover:text-status-error mt-1.5"
                      aria-label={`Remove step ${i + 1}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addStep}
              className="mt-2 flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add step
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-brand-border flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || steps.some((s) => !s.title.trim())}
          >
            <Plus className="w-3 h-3 mr-1" />
            Create Workflow
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
