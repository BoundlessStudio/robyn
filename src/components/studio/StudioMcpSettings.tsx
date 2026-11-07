"use client";

import { useState } from "react";
import Link from "next/link";

const chatGPTIcon = "/brand/robyn-chatgpt.png";

function ChatGPTSetup({ endpoint }: { endpoint: string }) {
  const [copyStatus, setCopyStatus] = useState<{ label: string; message: string }>();
  const copyFields = [
    { label: "Name", value: "Robyn", action: "Copy name" },
    {
      label: "Description", optional: true,
      value: "Manage projects, find and save files, and run Crafts in your private Robyn Studio.",
      action: "Copy description",
    },
    {
      label: "Connection", value: endpoint, action: "Copy server URL",
      hint: <>Choose <strong>Server URL</strong> and paste this address.</>,
    },
  ];

  async function copyField(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus({ label, message: "Copied to clipboard." });
    } catch {
      setCopyStatus({ label, message: "Clipboard unavailable. Select and copy the value above." });
    }
  }

  return <>
    <h3>Connect in ChatGPT</h3>
    <p>In <a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">ChatGPT web</a>, open <strong>Plugins</strong>, select <strong>+</strong>, then choose <strong>Add custom MCP server</strong>. Fill in the fields in this order.</p>
    <div className="studio-mcp-fields">
      <div className="studio-mcp-field">
        <div className="studio-mcp-icon">
          <img src={chatGPTIcon} alt="" width={40} height={40} />
          <div>
            <h4>Icon <span>(optional)</span></h4>
            <p>Download this PNG and upload it using <strong>+</strong> in the Icon field.</p>
          </div>
        </div>
        <a className="studio-button" href={chatGPTIcon} download>Download icon</a>
      </div>
      {copyFields.map(({ label, optional, hint, value, action }) => <div key={label} className="studio-mcp-field">
        <div>
          <h4>{label}{optional && <span> (optional)</span>}</h4>
          {hint && <p>{hint}</p>}
          <p className="studio-mcp-value">{value}</p>
          <p className="studio-mcp-copy-status" role="status">{copyStatus?.label === label ? copyStatus.message : ""}</p>
        </div>
        <button type="button" className="studio-button" onClick={() => void copyField(label, value)}>{action}</button>
      </div>)}
      <div className="studio-mcp-field">
        <div>
          <h4>Authentication</h4>
          <p>Choose <strong>OAuth</strong>.</p>
        </div>
      </div>
      <details className="studio-mcp-oauth">
        <summary>Advanced OAuth settings</summary>
        <p>Use the settings ChatGPT discovers. If asked for a client setup method, choose <strong>Dynamic Client Registration</strong>.</p>
      </details>
    </div>
    <ol>
      <li>Review the warning, select <strong>I understand and want to continue</strong>, then select <strong>Create as a plugin</strong>.</li>
      <li>Choose <strong>Connect Robyn</strong>. Sign in with your invited Robyn email if prompted, then approve access in Robyn.</li>
      <li>In a <strong>Work</strong> chat, select <strong>@Robyn</strong> and try asking it to list your Crafts.</li>
    </ol>
  </>;
}

export function StudioMcpSettings({ endpoint }: { endpoint?: string }) {
  return <section id="external-mcp" className="studio-setting-section studio-mcp-settings" aria-labelledby="external-mcp-title">
    <h2 id="external-mcp-title">External MCP</h2>
    <p>MCP gives ChatGPT and other compatible AI apps one connection to your private Studio and its Crafts. You approve each connection in Robyn.</p>
    {endpoint ? <>
      <ChatGPTSetup endpoint={endpoint} />
      <h3>How it works</h3>
      <p>A connected app can find your Studio projects and files, run commands on your Studio workstation, and save new revisions. You can also give Robyn a brief and have it handle the work as a job.</p>
      <p>Direct Craft commands are available with a $0 Studio AI allowance. Robyn jobs require available AI allowance.</p>
    </> : <p>Setup is available when this Studio has an HTTPS MCP endpoint.</p>}
    <p className="studio-mcp-connections"><Link href="/oauth/connections">Manage MCP connections</Link> to review connected apps or revoke their access.</p>
  </section>;
}
