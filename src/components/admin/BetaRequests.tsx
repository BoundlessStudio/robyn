"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, LogOut, RefreshCw, Search, Send } from "lucide-react";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { betaStatuses, type BetaAction, type BetaRequest, type BetaRequestList, type BetaStatus } from "@/lib/beta-requests";

const labels: Record<BetaStatus, string> = { requested: "Requested", invited: "Invited", joined: "Joined", declined: "Declined" };
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const pendingEmail = (row: BetaRequest) => row.send_state === "sending" || row.send_state === "uncertain";

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers } });
  if (response.status === 401) { window.location.assign("/admin/login"); throw new Error("Sign in to beta administration."); }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "This request could not be completed.");
  return body;
}

export function BetaRequests() {
  const [data, setData] = useState<BetaRequestList | null>(null);
  const [status, setStatus] = useState<BetaStatus | "all">("all");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const actionLock = useRef(false);
  const operations = useRef(new Map<string, { action: BetaAction; id: string }>());

  const load = useCallback(async (quiet = false) => {
    const version = ++sequence.current;
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ status, q: search, page: String(page) });
      const result = await adminFetch<BetaRequestList>(`/api/admin/beta-requests?${params}`);
      if (mounted.current && version === sequence.current) {
        if (page > 0 && page * 50 >= result.total) setPage(Math.max(0, Math.ceil(result.total / 50) - 1));
        setData(result); setError("");
      }
    } catch (error) { if (mounted.current && version === sequence.current) setError((error as Error).message); }
    finally { if (mounted.current && version === sequence.current) setLoading(false); }
  }, [status, search, page]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++sequence.current; }; }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && !actionLock.current) void load(true); }, 30000);
    return () => { window.clearInterval(timer); ++sequence.current; };
  }, [load]);

  async function act(row: BetaRequest, action: BetaAction) {
    if (actionLock.current || loading) return;
    actionLock.current = true; setBusy(row.id); setError(""); setNotice("");
    let operation = operations.current.get(row.id);
    if (!operation || operation.action !== action) { operation = { action, id: crypto.randomUUID() }; operations.current.set(row.id, operation); }
    try {
      const result = await adminFetch<{ request: BetaRequest }>(`/api/admin/beta-requests/${row.id}`, { method: "POST", body: JSON.stringify({ action, operationId: operation.id }) });
      operations.current.delete(row.id);
      setNotice(action === "check" ? pendingEmail(result.request) ? "This email is still unconfirmed. Its original attempt is preserved. Contact the operator to reconcile the provider record." : "Invitation status checked." : action === "decline" ? `Request from ${row.email} declined.` : action === "reopen" ? `Request from ${row.email} reopened.` : `Invitation email sent to ${row.email}.`);
      await load(true);
    } catch (error) {
      const message = (error as Error).message;
      // Keep the same identity when a browser reply is lost. A fresh list may
      // expose a definite provider failure, allowing the next explicit attempt.
      await load(true);
      setError(message);
    } finally { actionLock.current = false; setBusy(null); }
  }

  useEffect(() => {
    for (const row of data?.requests ?? []) if (row.send_state === "failed") operations.current.delete(row.id);
  }, [data]);

  async function signOut() {
    if (actionLock.current) return;
    actionLock.current = true; setBusy("logout");
    try { await adminFetch("/api/admin/session", { method: "DELETE", body: "{}" }); window.location.assign("/admin/login"); }
    catch (error) { setError((error as Error).message); actionLock.current = false; setBusy(null); }
  }
  function searchRequests(event: FormEvent) { event.preventDefault(); setPage(0); setSearch(draftSearch.trim()); }
  const total = data?.total ?? 0;

  return <main className="beta-console">
    <header className="beta-header"><Link href="/" className="beta-wordmark" aria-label="Robyn, home"><BrandWordmark /></Link><span><LockKeyhole size={13} aria-hidden="true" /> BETA ADMINISTRATION</span><button type="button" onClick={signOut} disabled={busy !== null || loading}><LogOut size={15} aria-hidden="true" /> Sign out</button></header>
    <div className="beta-title"><div><span className="beta-eyebrow">MAKE ROOM FOR NEW IMAGINATIONS</span><h1>Beta requests<span>.</span></h1><p>Review creative interests, send invitations and see who has joined.</p></div><span className="beta-private"><LockKeyhole size={14} aria-hidden="true" /> Invitation only</span></div>
    <section className="beta-counts" aria-label="Beta request totals">{betaStatuses.map(key => <button type="button" key={key} disabled={busy !== null} aria-pressed={status === key} onClick={() => { setStatus(key); setPage(0); }}><span>{labels[key]}</span><strong>{data?.counts[key] ?? "—"}</strong>{key === "joined" && <Check size={19} aria-hidden="true" />}</button>)}</section>
    <section className="beta-list" aria-label="Beta requests">
      <div className="beta-toolbar"><div className="beta-filters"><label htmlFor="beta-status">Status</label><select id="beta-status" disabled={busy !== null} value={status} onChange={event => { setStatus(event.target.value as BetaStatus | "all"); setPage(0); }}><option value="all">All requests</option>{betaStatuses.map(key => <option key={key} value={key}>{labels[key]}</option>)}</select></div><form className="beta-search" onSubmit={searchRequests}><label htmlFor="beta-search" className="beta-sr-only">Search email</label><Search size={16} aria-hidden="true" /><input id="beta-search" type="search" placeholder="Search email…" value={draftSearch} maxLength={254} onChange={event => setDraftSearch(event.target.value)} /><button type="submit" disabled={busy !== null}>Search</button></form><button type="button" onClick={() => void load()} disabled={loading || busy !== null}><RefreshCw size={15} aria-hidden="true" /> Refresh</button></div>
      {error && <p role="alert" className="beta-error">{error}</p>}{notice && <p role="status" className="beta-notice">{notice}</p>}
      <div className="beta-table-scroll" aria-busy={loading}><table><caption className="beta-sr-only">Requests for access to the private beta</caption><thead><tr><th scope="col">Creator</th><th scope="col">Status</th><th scope="col">Requested</th><th scope="col">Invitation</th><th scope="col">Joined</th><th scope="col">Actions</th></tr></thead><tbody>
        {data?.requests.map(row => <tr key={row.id}><td><strong className="beta-email">{row.email}</strong><p className="beta-craft">{row.craft || "No creative interests added."}</p><small className="beta-consent">Consent: {row.consent_version}</small></td><td><span className={`beta-badge ${row.status}`}>{labels[row.status]}</span>{pendingEmail(row) && <small className="beta-send-state">{row.send_state === "sending" ? "Checking email…" : "Email outcome uncertain"}</small>}{row.send_state === "failed" && <small className="beta-send-state">Last email failed</small>}</td><td><time dateTime={row.created_at}>{formatDate(row.created_at)}</time></td><td>{row.last_invited_at ? <><time dateTime={row.last_invited_at}>{formatDate(row.last_invited_at)}</time><small className="beta-send-state">{row.invite_count} {row.invite_count === 1 ? "email" : "emails"} sent</small></> : "—"}</td><td>{row.joined_at ? <time dateTime={row.joined_at}>{formatDate(row.joined_at)}</time> : "—"}</td><td><div className="beta-actions">
          {pendingEmail(row) ? <button type="button" onClick={() => void act(row, "check")} disabled={busy !== null || loading} aria-label={`Check status for ${row.email}`}>Check status</button> : row.status === "requested" ? <><button type="button" className="beta-primary" onClick={() => void act(row, "invite")} disabled={busy !== null || loading} aria-label={`Invite ${row.email}`}><Send size={13} aria-hidden="true" />{busy === row.id ? "Sending…" : "Invite"}</button><button type="button" onClick={() => void act(row, "decline")} disabled={busy !== null || loading} aria-label={`Decline ${row.email}`}>Decline</button></> : row.status === "invited" ? <button type="button" onClick={() => void act(row, "resend")} disabled={busy !== null || loading} aria-label={`Resend invitation to ${row.email}`}><Send size={13} aria-hidden="true" />{busy === row.id ? "Sending…" : "Resend invitation"}</button> : row.status === "declined" ? <button type="button" onClick={() => void act(row, "reopen")} disabled={busy !== null || loading} aria-label={`Reopen ${row.email}`}>Reopen</button> : <span className="beta-joined"><Check size={15} aria-hidden="true" /> In the studio</span>}
        </div></td></tr>)}
        {!loading && data?.requests.length === 0 && <tr><td colSpan={6} className="beta-empty">{search || status !== "all" ? "No requests match these filters." : "A little quiet for now. New beta requests will appear here."}</td></tr>}
        {loading && !data && <tr><td colSpan={6} className="beta-empty">Loading beta requests…</td></tr>}
      </tbody></table></div>
      <footer className="beta-pagination"><span>{total ? `${page * 50 + 1}–${Math.min((page + 1) * 50, total)} of ${total}` : "0 requests"}</span><div><button type="button" onClick={() => setPage(value => value - 1)} disabled={page === 0 || loading || busy !== null}><ArrowLeft size={14} aria-hidden="true" /> Previous</button><button type="button" onClick={() => setPage(value => value + 1)} disabled={(page + 1) * 50 >= total || loading || busy !== null}>Next <ArrowRight size={14} aria-hidden="true" /></button></div></footer>
    </section>
    <p className="beta-footnote">Joined status updates after a confirmed sign-in. This page refreshes every 30 seconds.</p>
  </main>;
}
