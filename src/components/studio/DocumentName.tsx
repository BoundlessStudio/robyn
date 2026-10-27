"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { AssetSummary } from "@/studio/assets";

export function DocumentName({ asset, onSaved }: { asset: AssetSummary; onSaved: (asset: AssetSummary) => void }) {
  const [editing, setEditing] = useState(false), [value, setValue] = useState(asset.name);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { setValue(asset.name); setEditing(false); setError(""); }, [asset.id, asset.name]);
  function cancel() { if (busy) return; setEditing(false); setValue(asset.name); setError(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy || !value.trim()) return;
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ asset: AssetSummary }>(`/api/studio/assets/${asset.id}`, { method: "PATCH", body: JSON.stringify({ name: value.trim() }) });
      onSaved(result.asset); setEditing(false);
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  return <div className="document-name">
    {editing ? <form onSubmit={save}><input aria-label="File name" value={value} onChange={event => setValue(event.target.value)} maxLength={160} autoFocus disabled={busy} onKeyDown={event => { if (event.key === "Escape") cancel(); }}/><button aria-label="Save file name" disabled={busy || !value.trim()}><Check size={15}/></button><button type="button" aria-label="Cancel file rename" disabled={busy} onClick={cancel}><X size={15}/></button></form> : <button aria-label={`Rename file: ${asset.name}`} title="Rename file" onClick={() => setEditing(true)}><span>{asset.name}</span><Pencil size={12}/></button>}
    {error && <p role="alert" className="studio-error">{error}</p>}
  </div>;
}
