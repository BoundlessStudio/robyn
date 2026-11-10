"use client";

import { ArrowUpRight, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { mailConnectionLabel, mailProviders, type MailConnection, type MailConnectionList, type MailProvider } from "@/studio/connected-mail";

import { MailcraftFrame } from "./MailcraftFrame";

const endpoint = "/api/studio/mail-connections";
const providers = Object.keys(mailProviders) as MailProvider[];

export function StudioProfile({ mailcraftBundle = null }: { mailcraftBundle?: string | null } = {}) {
  const { userEmail } = useWorkspace();
  const [state, setState] = useState<MailConnectionList | null>(null);
  const [opened, setOpened] = useState<MailConnection | null>(null);
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

  if (opened && mailcraftBundle) return <div className="studio-page">
    <button type="button" className="studio-button" onClick={() => setOpened(null)}>Back to Profile</button>
    <MailcraftFrame key={opened.id} bundle={mailcraftBundle} connection={opened} />
  </div>;

  return <div className="studio-page studio-settings">
    <header className="studio-page-heading"><div><span className="studio-eyebrow">YOUR ROBYN ACCOUNT</span><h1>Profile.</h1><p>Manage the mail accounts connected to your workstation.</p></div></header>
    <div className="studio-settings-layout"><div className="studio-settings-main">
      <section className="studio-setting-section"><h2>Your account</h2><p>{userEmail}</p><button type="button" className="studio-button" disabled={Boolean(busy)} onClick={() => void signOut()}>Sign out</button></section>
      <section className="studio-setting-section studio-mail-connections" aria-labelledby="connected-mail-heading">
        <div className="studio-mail-header">
          <div>
            <h2 id="connected-mail-heading">Connected mail</h2>
            <p>Connect a mailbox so Robyn can search email and save drafts for review. You choose the mailbox for each brief.</p>
          </div>
          {(Boolean(state?.connections.length) || error) && <button type="button" className="studio-button" disabled={Boolean(busy)} onClick={() => void check()}>
            <RefreshCw size={13} aria-hidden="true" />{busy === "refresh" ? "Checking…" : "Refresh connections"}
          </button>}
        </div>
        {!state && !error && <p role="status" className="studio-mail-message">Checking mailbox connections…</p>}
        {state && !state.workstationReady && <p className="studio-note">
          Your shared workstation starts with your first brief. Once it’s ready, return here to connect mail. <Link href="/dashboard">Open Projects</Link>
        </p>}
        {mailcraftBundle && state?.workstationReady && !state.connections.some(connection => connection.status === "active")
          && <p className="studio-mail-message">Connect Gmail or Microsoft 365 to open MailCraft.</p>}
        {state?.workstationReady && <div className="studio-mail-grid">
          {providers.map(provider => <MailProviderCard key={provider} provider={provider} busy={busy}
            connections={state.connections.filter(connection => connection.provider === provider)}
            openMailcraft={mailcraftBundle ? setOpened : undefined}
            connect={() => void change(provider, { action: "connect", provider })}
            disconnect={connectionId => void change(connectionId, { action: "disconnect", connectionId })} />)}
        </div>}
        {error && <p className="studio-error studio-mail-message" role="alert">{error}</p>}
      </section>
    </div></div>
  </div>;
}

const connectionStatus = {
  active: "Connected",
  pending: "Sign-in pending",
  unavailable: "Reconnect needed",
} as const;

function MailProviderCard({ provider, connections, busy, connect, disconnect, openMailcraft }: {
  provider: MailProvider;
  connections: MailConnection[];
  busy: string;
  connect: () => void;
  disconnect: (connectionId: string) => void;
  openMailcraft?: (connection: MailConnection) => void;
}) {
  const { name, draftsUrl } = mailProviders[provider];
  const active = connections.filter(connection => connection.status === "active").length;
  const pending = connections.some(connection => connection.status === "pending");
  const status = active ? "active" : pending ? "pending" : connections.length ? "unavailable" : "empty";
  const label = active > 1 ? `${active} connected` : status === "empty" ? "Not connected" : connectionStatus[status];

  const draftsLink = <a className="studio-button" href={draftsUrl} target="_blank" rel="noreferrer"
    aria-label={`Open ${name} Drafts`}>
    Open drafts <ArrowUpRight size={13} aria-hidden="true" />
  </a>;

  return <div className="studio-mail-provider" role="group" aria-label={name}>
    <header className="studio-mail-provider-heading">
      <h3>{name}</h3>
      <span className="studio-mail-status" data-state={status}>{label}</span>
    </header>
    {pending && <p>Finish sign-in, then refresh connections.</p>}
    {connections.length > 0 && <ul className="studio-mail-accounts">
      {connections.map(connection => {
        const action = connection.status === "active" ? "Disconnect" : connection.status === "pending" ? "Cancel sign-in" : "Remove";
        return <li key={connection.id} className="studio-mail-account">
          {connections.length > 1 && <span>{mailConnectionLabel(connection)} · {connectionStatus[connection.status]}</span>}
          {openMailcraft && connection.status === "active" && <button type="button" className="studio-button primary"
            disabled={Boolean(busy)} onClick={() => openMailcraft(connection)}>
            Open in MailCraft
          </button>}
          {connections.length === 1 && connection.status === "active" && draftsLink}
          <button type="button" className="studio-button" disabled={Boolean(busy)}
            aria-label={`${action} ${connections.length === 1 ? name : mailConnectionLabel(connection)}`} onClick={() => disconnect(connection.id)}>
            {busy === connection.id ? "Working…" : action}
          </button>
        </li>;
      })}
    </ul>}
    <div className="studio-mail-actions">
      {!pending && <button type="button" className={active ? "studio-button" : "studio-button primary"} disabled={Boolean(busy)} onClick={connect}>
        {active > 0 && <Plus size={13} aria-hidden="true" />}
        {busy === provider ? "Opening sign-in…" : active ? "Add another account" : `Connect ${name}`}
      </button>}
      {active > 0 && connections.length > 1 && draftsLink}
    </div>
  </div>;
}
