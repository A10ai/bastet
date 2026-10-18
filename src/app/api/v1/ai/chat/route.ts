import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { processChat } from "@/lib/ai-chat";
import { validateBody, formatZodErrors, aiChatSchema } from "@/lib/validation";
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
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

    const supabase = createServerSupabaseClient();
    const response = await processChat(message, supabase);

    return NextResponse.json({ data: response });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
