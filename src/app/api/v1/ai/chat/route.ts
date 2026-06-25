import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { processChat } from "@/lib/ai-chat";
import { validateBody, formatZodErrors, aiChatSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authenticated) return auth.error!;
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
