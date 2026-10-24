import { createClient } from "@/lib/supabase/server";
import { emailLinkResponse } from "@/lib/email-link-flow";

async function handle(request: Request) {
  const supabase = await createClient();
  return emailLinkResponse(request, {
    verify: async (tokenHash, type) => !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error,
    exchangeCode: async (code) => !(await supabase.auth.exchangeCodeForSession(code)).error,
    hasSession: async () => Boolean((await supabase.auth.getUser()).data.user),
  });
}

export const GET = handle;
export const POST = handle;
