/**
 * The Claude model used by the AI brain and the assistant chat.
 *
 * One place to change it, overridable per environment with ANTHROPIC_MODEL.
 * Model ids retire; a hard-coded retired id made every brain cycle fail with
 * a 404 from the API (found by the load/ops test on 18 Oct 2026).
 */
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
