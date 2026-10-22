"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { publicSiteOrigin, safeNextPath } from "@/lib/site-url";
import { OrbitMark } from "@/components/home/Artwork";

export default function LoginPage() {
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "auth") setMessage("That invitation or reset link has expired. Sign in or request a new password link.");
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || busy) return;
    setBusy(true); setMessage("");
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "").trim();
    try {
      const supabase = createClient();
      if (reset) {
        const callback = new URL("/auth/callback", publicSiteOrigin(window.location.origin));
        callback.searchParams.set("next", "/reset-password");
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback.toString() });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: String(fields.get("password") ?? "") });
        if (error) throw error;
        window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get("next")));
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "We couldn’t sign you in. Please try again."); }
    finally { setBusy(false); }
  }

  return <main className="grid min-h-screen bg-[#f4f0e7] text-[#20221f] lg:grid-cols-2" style={{ fontFamily: '"Space Grotesk Variable",sans-serif' }}>
    <section className="relative hidden overflow-hidden bg-[#2448e6] p-14 text-[#f4f0e7] lg:flex lg:flex-col lg:justify-between"><Link href="/" className="text-4xl font-semibold tracking-[-.09em]">robyn<span className="ml-2 text-[#dafa43]">✳</span></Link><OrbitMark className="absolute -right-28 top-16 w-[440px] text-[#dafa43]" /><h1 className="relative text-[5.8vw] leading-[.95] tracking-[-.06em]">Your next<br />great idea<br /><em style={{ fontFamily: '"Instrument Serif",Georgia,serif' }}>starts here.</em></h1><span className="text-[10px] tracking-widest">ONE IMAGINATION. AN ENTIRE STUDIO.</span></section>
    <section className="flex flex-col justify-center px-7 py-14 sm:px-14"><div className="mx-auto w-full max-w-sm"><Link href="/" className="mb-14 inline-flex items-center gap-2 text-xs">← Back to Robyn</Link><span className="block text-[10px] tracking-widest">YOUR PRIVATE CREATIVE STUDIO</span><h2 className="mt-4 text-4xl font-medium tracking-[-.06em]">{reset ? "A fresh start." : "Welcome back."}</h2><p className="mb-9 mt-4 text-sm leading-6">{reset ? "We’ll send a password reset link to your email." : "Sign in with the account from your pilot invitation."}</p>
      {!configured && <p role="status" className="mb-6 border border-[#c9c5bb] p-4 text-xs leading-6">The studio isn’t connected yet. Sign-in will be available when the pilot opens.</p>}
      {sent ? <div role="status" className="space-y-5"><p className="text-sm leading-6">If that email has an account, a password reset link is on its way. Check your inbox.</p><button type="button" className="text-sm underline underline-offset-4" onClick={() => { setSent(false); setReset(false); }}>Back to sign in</button></div> : <form onSubmit={submit} className="space-y-6">
        <div><label htmlFor="email" className="mb-2 block text-xs">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@your-world.com" className="w-full border-b border-[#aaa99e] bg-transparent py-3 text-sm outline-offset-4" /></div>
        {!reset && <div><div className="mb-2 flex justify-between"><label htmlFor="password" className="text-xs">Password</label><button type="button" onClick={() => { setReset(true); setMessage(""); }} className="text-[10px] underline underline-offset-4">Forgot password?</button></div><input id="password" name="password" type="password" autoComplete="current-password" required className="w-full border-b border-[#aaa99e] bg-transparent py-3 text-sm outline-offset-4" /></div>}
        {message && <p role="alert" className="text-xs leading-5 text-red-800">{message}</p>}
        <button type="submit" disabled={!configured || busy} className="flex w-full items-center justify-between bg-[#20221f] px-5 py-4 text-sm text-[#f4f0e7] disabled:opacity-50">{busy ? "One moment…" : reset ? "Send reset link" : "Enter the studio"}<ArrowRight size={19} /></button>
        {reset && <button type="button" onClick={() => { setReset(false); setMessage(""); }} className="text-xs underline underline-offset-4">Back to sign in</button>}
      </form>}
      <div className="mt-12 border-t border-[#c9c5bb] pt-6"><p className="text-xs">A little space for your next big idea.</p><Link href="/#invitation" className="mt-3 inline-flex items-center gap-3 text-xs text-[#2448e6]">Request a pilot invitation <ArrowUpRight size={15} /></Link></div>
    </div></section>
  </main>;
}
