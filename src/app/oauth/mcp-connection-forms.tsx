"use client";

import { useEffect, useState } from "react";

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
  const { value, failed } = useConnectionData<{ connections: { id: string; client: { name: string } }[] }>("connections");
  if (failed) return <p className="mt-5 text-sm" role="alert">MCP connections are unavailable. Reload to try again.</p>;
  if (!value) return <p className="mt-5 text-sm" role="status">Loading MCP connections…</p>;
  if (!value.connections.length) return <p className="mt-5 text-sm">You have no active MCP connections.</p>;
  return <ul className="mt-6 divide-y divide-[#aaa99e]">
    {value.connections.map(connection => <li key={connection.id} className="flex items-center justify-between gap-4 py-4 text-sm">
      <strong>{connection.client.name}</strong>
      <form method="post" action={api + "disconnect"}>
        <input type="hidden" name="connection" value={connection.id} />
        <button className="border border-[#aaa99e] px-4 py-2">Revoke</button>
      </form>
    </li>)}
  </ul>;
}
