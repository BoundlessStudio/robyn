"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { publicSiteOrigin, safeNextPath } from "@/lib/site-url";
import { AuthFrame } from "@/components/brand/AuthFrame";
import { DesktopStudioGate } from "@/components/studio/DesktopStudioGate";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  useEffect(() => {
    setReady(true);
    if (new URLSearchParams(window.location.search).get("error") === "auth") setMessage("That link has expired or has already been opened. Use the newest email, or request a fresh sign-in link below. If you haven’t accepted your invitation yet, open your invitation email first.");
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !configured || busy) return;
    setBusy(true); setMessage("");
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "").trim();
    try {
      const supabase = createClient();
      const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: new URL(next, publicSiteOrigin(window.location.origin)).toString() },
      });
      // Give the same response for an uninvited address without creating an account.
      if (error && !["otp_disabled", "signup_disabled", "user_not_found"].includes(error.code ?? "")) throw error;
      setSent(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "We couldn’t sign you in. Please try again."); }
    finally { setBusy(false); }
  }

  return <DesktopStudioGate><AuthFrame>
    <Link href="/" className="mb-14 inline-flex items-center gap-2 text-xs">← Back to Robyn</Link><span className="block text-[10px] tracking-widest">YOUR PRIVATE CREATIVE STUDIO</span><h1 className="mt-4 text-4xl font-medium tracking-[-.06em]">{sent ? "Check your inbox." : "Welcome back."}</h1><p className="mb-9 mt-4 text-sm leading-6">{sent ? "One little link. Your whole creative world." : "Enter the email from your invitation. We’ll send a link to open your studio—no password needed."}</p>
      <p className="mb-6 text-xs leading-6">A desktop studio. Bring your keyboard, mouse and a little room to create.</p>
      {!configured && <p role="status" className="mb-6 border border-[#c9c5bb] p-4 text-xs leading-6">The studio isn’t connected yet. Sign-in will be available when the pilot opens.</p>}
      {sent ? <div role="status" className="space-y-5"><p className="text-sm leading-6">If you’ve been invited, a sign-in link is on its way. Check your inbox and junk folder. Each link works once.</p><button type="button" className="text-sm underline underline-offset-4" onClick={() => { setSent(false); setMessage(""); }}>Use another email or request a new link</button></div> : <form method="post" onSubmit={submit} className="space-y-6">
        <div><label htmlFor="email" className="mb-2 block text-xs">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@your-world.com" className="w-full border-b border-[#aaa99e] bg-transparent py-3 text-sm outline-offset-4" /></div>
        {message && <p role="alert" className="text-xs leading-5 text-red-800">{message}</p>}
        <button type="submit" disabled={!ready || !configured || busy} className="flex w-full items-center justify-between bg-[#1b2a20] px-5 py-4 text-sm text-[#f3f1e8] disabled:opacity-50">{busy ? "Sending your link…" : "Email me a sign-in link"}<ArrowRight size={19} /></button>
      </form>}
      <div className="mt-12 border-t border-[#c9c5bb] pt-6"><p className="text-xs">A little space for your next big idea.</p><Link href="/#invitation" className="brand-accent mt-3 inline-flex items-center gap-3 text-xs">Request a pilot invitation <ArrowUpRight size={15} /></Link></div>
  </AuthFrame></DesktopStudioGate>;
}
