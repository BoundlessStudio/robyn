"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
export function InvitationForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (status !== "success") return;
    confirmation.current?.focus({ preventScroll: true });
    confirmation.current?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [status]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const data = new FormData(event.currentTarget);
    setStatus("sending"); setMessage("");
    try {
      const response = await fetch("/api/invite-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, craft: data.get("craft"), website: data.get("website"), consent: data.get("consent") === "on" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Your request could not be saved. Please try again.");
      setStatus("success"); setMessage("Your request is saved. We’ll email you when a place in the pilot is available.");
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "We couldn’t reach the studio. Please try again."); }
  }
  return <div className="invitation-form-wrap">
    {status === "success" ? <div ref={confirmation} className="invite-success" role="status" tabIndex={-1}><Check size={32} /><h3>You’re on the list.</h3><p>{message}</p><button type="button" className="flight-link" onClick={() => { setStatus("idle"); setEmail(""); setMessage(""); }}>Use another email <ArrowRight size={18} /></button></div> :
      <form className="invitation-form" method="post" onSubmit={submit}>
        <p>We’re inviting individual creators into Robyn’s desktop studio. Leave your email to request a place.</p>
        <label htmlFor="invite-email">Your email</label>
        <input id="invite-email" type="email" name="email" placeholder="you@your-world.com" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="invite-craft">What do you love making? <span>(optional)</span></label>
        <input id="invite-craft" type="text" name="craft" placeholder="Things that don’t exist yet…" maxLength={280} />
        <div className="form-trap" aria-hidden="true"><label htmlFor="invite-website">Website</label><input id="invite-website" name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
        <label className="consent-label"><input type="checkbox" name="consent" required /><span>Email me about my invitation. Read the <Link href="/privacy">privacy note</Link>.</span></label>
        <button type="submit" className="invite-submit" disabled={!ready || status === "sending"}>{status === "sending" ? "Saving your request…" : "Request an invite"}<ArrowUpRight size={24} aria-hidden="true" /></button>
        <p className={`form-message ${status === "error" ? "is-error" : ""}`} role={status === "error" ? "alert" : "status"}>{message || "A personal studio. Yours to make something with."}</p>
        <noscript><p>Please enable JavaScript to request your invitation.</p></noscript>
      </form>}
  </div>;
}


