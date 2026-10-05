"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invitationTokens } from "@/lib/invite-session";
import { Button } from "@/components/ui/button";

export default function AcceptInvitationPage() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const tokens = invitationTokens(window.location.hash);
    // Clear tokens before creating the PKCE browser client so it won't auto-detect an implicit flow.
    window.history.replaceState(null, "", window.location.pathname);
    if (!tokens) { setFailed(true); return; }
    void (async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.setSession(tokens);
        if (error) { setFailed(true); return; }
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !data.user) { setFailed(true); return; }
        window.location.replace("/reset-password");
      } catch { setFailed(true); }
    })();
  }, []);
  return <main className="mx-auto max-w-sm space-y-4 p-8">
    <h1 className="text-2xl font-semibold">Set up your account</h1>
    {failed ? <><p className="text-sm text-muted-foreground" role="alert">That invitation is invalid or has expired. Sign in or request a password reset.</p>
      <Button asChild variant="outline"><Link href="/login">Sign in</Link></Button></> :
      <p className="text-sm text-muted-foreground" role="status">Verifying your invitation…</p>}
  </main>;
}
