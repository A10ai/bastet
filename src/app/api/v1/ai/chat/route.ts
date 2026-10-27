import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { processChat } from "@/lib/ai-chat";
import { validateBody, formatZodErrors, aiChatSchema } from "@/lib/validation";
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // requireRole, not requireAuth: an active staff account and a completed
    // second factor are required. Front desk floor because the answers are
    // built from bookings and guest records (the same floor as guest PII).
    const auth = await requireRole(req, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    // Anthropic spend guard: 10 messages per minute per user
    const rl = await rateLimit(`ai-chat:${auth.userId}`, RATE_LIMITS.AI_ENDPOINT);
    if (!rl.allowed) return rateLimitResponse(rl, "AI chat limit reached. Try again in a minute.");
    const body = await req.json();

    const validation = validateBody(aiChatSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const { message } = validation.data;

    const supabase = await createServerSupabaseClient();
    const response = await processChat(message, supabase);

    return NextResponse.json({ data: response });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
