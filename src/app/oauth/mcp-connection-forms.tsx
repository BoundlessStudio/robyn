"use client";

import { useEffect, useState } from "react";
import { CONNECTED_MAIL_SETTINGS_HREF } from "@/studio/connected-mail";

const api = "/api/studio/mcp-oauth/";

function useConnectionData<T>(path: string): { value?: T; failed?: boolean } {
  const [state, setState] = useState<{ path: string; value?: T; failed?: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    fetch(api + path, { signal: controller.signal, cache: "no-store" })
      .then(response => {
        if (!response.ok) throw new Error("Connection unavailable");
        return response.json() as Promise<T>;
      })
      .then(value => { if (!controller.signal.aborted) setState({ path, value }); })
      .catch(() => { if (!controller.signal.aborted) setState({ path, failed: true }); });
    return () => controller.abort();
  }, [path]);
  return state?.path === path ? state : {};
}

export function ConsentForm({ fields }: { fields: string }) {
  const { value: consent, failed } = useConnectionData<{ client: string; host: string; email?: string }>("consent?" + fields);
  if (failed) return <p className="mt-5 text-sm leading-6" role="alert">Open a fresh connection from your MCP client and sign in with your invited Robyn account.</p>;
  if (!consent) return <p className="mt-5 text-sm" role="status">Loading the connection request…</p>;
  return <>
    <p className="mt-5 text-sm leading-6"><strong>{consent.client}</strong> at <strong>{consent.host}</strong> wants to access your Studio as {consent.email}.</p>
    <ul className="my-6 list-disc space-y-2 pl-5 text-sm leading-6">
      <li>Find and create projects, and edit their names and briefs.</li>
      <li>Read and download saved files, import attachments you share with the client, and rename library assets.</li>
      <li>Run Craft commands, check their results, and save new library revisions.</li>
      <li>View and stop Robyn jobs. Start jobs when your Studio AI allowance permits.</li>
    </ul>
    <form method="post" action={api + "authorize"} className="flex flex-wrap gap-3">
      {[...new URLSearchParams(fields)].map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <button name="decision" value="allow" className="bg-[#1b2a20] px-5 py-3 text-sm text-[#f3f1e8]">Connect</button>
      <button name="decision" value="deny" className="border border-[#aaa99e] px-5 py-3 text-sm">Deny</button>
    </form>
    <p className="mt-6 text-xs leading-5">Connect only clients you trust. You can revoke access in <a className="underline" href="/oauth/connections">MCP connections</a>.</p>
  </>;
}

export function Connections() {
  const { value, failed } = useConnectionData<{
    connections: { id: string; client: { name: string }; mailboxes: (MailboxChoice & { active: boolean })[] }[];
    mailboxes: MailboxChoice[];
    mailboxesUnavailable: boolean;
  }>("connections");
  if (failed) return <p className="mt-5 text-sm" role="alert">MCP connections are unavailable. Reload to try again.</p>;
  if (!value) return <p className="mt-5 text-sm" role="status">Loading MCP connections…</p>;
  if (!value.connections.length) return <p className="mt-5 text-sm">You have no active MCP connections.</p>;
  return <>
    <p className="mt-5 text-sm leading-6">Choose which linked mailboxes each client can read through MailCraft. Manage linked accounts in <a className="underline" href={CONNECTED_MAIL_SETTINGS_HREF}>Studio settings</a>.</p>
    {value.mailboxesUnavailable && <p className="mt-3 text-sm" role="status">Linked mailbox status is temporarily unavailable.</p>}
    <ul className="mt-6 divide-y divide-[#aaa99e]">
      {value.connections.map(connection => {
        const choices = new Map(value.mailboxes.map(mailbox => [mailbox.mailConnectionId, { ...mailbox, active: true, allowed: false }]));
        for (const mailbox of connection.mailboxes) choices.set(mailbox.mailConnectionId, { ...mailbox, allowed: true });
        return <li key={connection.id} className="py-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <strong>{connection.client.name}</strong>
            <form method="post" action={api + "disconnect"}>
              <input type="hidden" name="connection" value={connection.id} />
              <button className="border border-[#aaa99e] px-4 py-2">Revoke connection</button>
            </form>
          </div>
          <h2 className="mt-4 text-sm font-medium">MailCraft read access</h2>
          {choices.size === 0 && !value.mailboxesUnavailable && <p className="mt-2 text-xs">Link Gmail or Microsoft 365 in Studio settings to choose a mailbox.</p>}
          {choices.size > 0 && <ul className="mt-2 space-y-2">
            {[...choices.values()].map(mailbox => <li key={mailbox.mailConnectionId} className="flex flex-wrap items-center justify-between gap-2">
              <span>{mailbox.label} <small className="ml-1">{mailbox.allowed ? mailbox.active ? "Allowed" : "Unavailable" : "Private"}</small></span>
              <form method="post" action={api + "mailbox"}>
                <input type="hidden" name="connection" value={connection.id} />
                <input type="hidden" name="mailConnectionId" value={mailbox.mailConnectionId} />
                <button name="decision" value={mailbox.allowed ? "remove" : "allow"} className="border border-[#aaa99e] px-3 py-1.5"
                  aria-label={`${mailbox.allowed ? "Remove access to" : "Allow reads from"} ${mailbox.label} for ${connection.client.name}`}>
                  {mailbox.allowed ? "Remove access" : "Allow reads"}
                </button>
              </form>
            </li>)}
          </ul>}
        </li>;
      })}
    </ul>
  </>;
}

type MailboxChoice = { mailConnectionId: string; label: string };
