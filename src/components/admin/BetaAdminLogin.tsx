"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { apiFetch } from "@/lib/api";

export function BetaAdminLogin() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      await apiFetch("/api/admin/session", { method: "POST", body: JSON.stringify({ username: fields.get("username"), password: fields.get("password") }) });
      window.location.assign("/admin/beta-requests");
    } catch (error) { setError((error as Error).message); setPending(false); }
  }
  return <main className="beta-login">
    <Link href="/" className="beta-wordmark" aria-label="Robyn, home"><BrandWordmark /></Link>
    <span className="beta-eyebrow"><LockKeyhole size={14} aria-hidden="true" /> PRIVATE ADMINISTRATION</span>
    <h1>A little room<br /><em>for the next wave.</em></h1>
    <p>Sign in to review beta requests and invite creators into Robyn.</p>
    <form onSubmit={submit} aria-label="Admin sign in">
      <label htmlFor="admin-username">Username</label><input id="admin-username" name="username" autoComplete="username" required maxLength={80} disabled={pending} />
      <label htmlFor="admin-password">Password</label><input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={pending} />
      {error && <p role="alert" className="beta-error">{error}</p>}
      <button className="beta-primary" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
    <span className="beta-footnote">Robyn’s private beta · Invitation only</span>
  </main>;
}
