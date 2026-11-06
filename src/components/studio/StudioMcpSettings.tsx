"use client";

import { useState } from "react";
import Link from "next/link";

export function StudioMcpSettings({ endpoint }: { endpoint?: string }) {
  const [copyStatus, setCopyStatus] = useState("");

  async function copyServerUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("Server URL copied.");
    } catch {
      setCopyStatus("Select and copy the server URL above.");
    }
  }

  return <section id="external-mcp" className="studio-setting-section studio-mcp-settings" aria-labelledby="external-mcp-title">
    <h2 id="external-mcp-title">External MCP</h2>
    <p>MCP gives ChatGPT and other compatible AI apps one connection to your private Studio and its Crafts. You approve each connection in Robyn.</p>
    {endpoint ? <>
      <div className="studio-mcp-server">
        <div>
          <p><strong>Server URL</strong></p>
          <p><a href={endpoint} target="_blank" rel="noreferrer">{endpoint}</a></p>
        </div>
        <button type="button" className="studio-button" onClick={() => void copyServerUrl(endpoint)}>Copy server URL</button>
      </div>
      <p role="status">{copyStatus}</p>
      <h3>Connect in ChatGPT</h3>
      <ol>
        <li>In <a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">ChatGPT web</a>, choose <strong>Plugins → Add → Add custom MCP server</strong>.</li>
        <li>Name the server <strong>Robyn</strong>, paste the server URL, and choose <strong>OAuth</strong>. Review the warning and select <strong>Create as a plugin</strong>.</li>
        <li>Choose <strong>Connect Robyn</strong>. Sign in with your invited Robyn email if prompted, then approve access in Robyn.</li>
        <li>In a <strong>Work</strong> chat, select <strong>@Robyn</strong> and try asking it to list your Crafts.</li>
      </ol>
      <h3>How it works</h3>
      <p>A connected app can find your Studio projects and files, run commands on your Studio workstation, and save new revisions. You can also give Robyn a brief and have it handle the work as a job.</p>
      <p>Direct Craft commands are available with a $0 Studio AI allowance. Robyn jobs require available AI allowance.</p>
    </> : <p>Setup is available when this Studio has an HTTPS MCP endpoint.</p>}
    <p className="studio-mcp-connections"><Link href="/oauth/connections">Manage MCP connections</Link> to review connected apps or revoke their access.</p>
  </section>;
}
