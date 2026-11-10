"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { mailConnectionLabel, mailProviders, type MailConnectionList, type MailProvider } from "@/studio/connected-mail";

const endpoint = "/api/studio/mail-connections";
const providers = Object.keys(mailProviders) as MailProvider[];

export function StudioProfile() {
  const { userEmail } = useWorkspace();
  const [state, setState] = useState<MailConnectionList | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await apiFetch<MailConnectionList>(endpoint, { signal });
    if (!signal?.aborted) setState(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const returned = new URL(window.location.href).searchParams.get("mail") === "return";
    if (returned) window.history.replaceState(null, "", "/dashboard/profile");
    void refresh(controller.signal).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message);
    });
    return () => controller.abort();
  }, [refresh]);

  async function change(key: string, action: Record<string, unknown>) {
    setBusy(key);
    setError("");
    try {
      const result = await apiFetch<{ redirectUrl?: string }>(endpoint, { method: "POST", body: JSON.stringify(action) });
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
      await refresh().catch(() => {});
    } finally { setBusy(""); }
  }

  async function check() {
    setBusy("refresh");
    setError("");
    try { await refresh(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(""); }
  }

  async function signOut() {
    setBusy("sign-out");
    const { error } = await createClient().auth.signOut();
    if (error) { setError(error.message); setBusy(""); }
    else window.location.assign("/login");
  }

  return <div className="studio-page studio-settings">
    <header className="studio-page-heading"><div><span className="studio-eyebrow">YOUR ROBYN ACCOUNT</span><h1>Profile.</h1><p>Manage the mail accounts connected to your workstation.</p></div></header>
    <div className="studio-settings-layout"><div className="studio-settings-main">
      <section className="studio-setting-section"><h2>Your account</h2><p>{userEmail}</p><button type="button" className="studio-button" disabled={Boolean(busy)} onClick={() => void signOut()}>Sign out</button></section>
      <section className="studio-setting-section" aria-label="Connected mail">
        <h2>Connected mail</h2>
        <p>Authorize Gmail or Microsoft 365 with Composio. Choose a connected mailbox when briefing Robyn to search mail or save a draft for your review.</p>
        {!state && !error && <p role="status">Checking your connections…</p>}
        {state && !state.workstationReady && <p>Give Robyn a first brief to start your shared workstation, then return here to connect mail. <Link href="/dashboard">Open Projects</Link></p>}
        {state?.workstationReady && providers.map(provider => <div key={provider} className="studio-form">
          <h3>{mailProviders[provider].name}</h3>
          {state.connections.filter(connection => connection.provider === provider).map(connection =>
            <div className="studio-action-row" key={connection.id}>
              <span>{mailConnectionLabel(connection)} · {connection.status === "active" ? "Connected" : connection.status === "pending" ? "Awaiting sign-in" : "Needs reconnection"}</span>
              <button type="button" className="studio-button" disabled={Boolean(busy)} onClick={() => void change(connection.id, { action: "disconnect", connectionId: connection.id })}>
                {busy === connection.id ? "Disconnecting…" : "Disconnect"}<span className="sr-only"> {mailConnectionLabel(connection)}</span>
              </button>
            </div>)}
          <div className="studio-action-row">
            <button type="button" className="studio-button" disabled={Boolean(busy)} onClick={() => void change(provider, { action: "connect", provider })}>
              {busy === provider ? "Opening sign-in…" : `Connect ${mailProviders[provider].name}`}
            </button>
            {state.connections.some(connection => connection.provider === provider && connection.status === "active") && <a className="studio-button" href={mailProviders[provider].draftsUrl} target="_blank" rel="noreferrer">Open {mailProviders[provider].name} Drafts ↗</a>}
          </div>
        </div>)}
        <button type="button" className="studio-button" disabled={Boolean(busy)} onClick={() => void check()}>{busy === "refresh" ? "Checking…" : "Refresh connections"}</button>
        {error && <p className="studio-error" role="alert">{error}</p>}
      </section>
    </div></div>
  </div>;
}
