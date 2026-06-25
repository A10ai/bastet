import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import {
  getAutomations,
  runAutomation,
  runAllAutomations,
} from "@/lib/automations-engine";
import { validateBody, formatZodErrors, automationSchema } from "@/lib/validation";

/**
 * GET /api/v1/ai/automations
 * Returns all automations with their status and metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const automations = getAutomations();
    return NextResponse.json({ data: automations });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/ai/automations
 * Trigger a specific automation or run all enabled automations.
 *
 * Body: { automation_id: string }       — run a specific automation
 * Body: { action: "run_all" }           — run all enabled automations
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(automationSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    // Run all enabled automations
    if (validated.action === "run_all") {
      const results = await runAllAutomations(supabase);
      const automations = getAutomations();
      return NextResponse.json({
        data: {
          automations,
          run_results: results,
        },
      });
    }

    // Run a specific automation
    if (validated.automation_id) {
      const results = await runAutomation(validated.automation_id, supabase);
      const automations = getAutomations();
      return NextResponse.json({
        data: {
          automations,
          run_results: [
            {
              automation_id: validated.automation_id,
              results,
            },
          ],
        },
      });
    }

    return NextResponse.json(
      { error: "Provide either { automation_id } or { action: \"run_all\" }" },
      { status: 400 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
