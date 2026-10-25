"use client";
import { Markdown } from "@/components/Markdown";
import type { AssetRef } from "@/studio/assets";

export interface SourceCredit {ref:AssetRef;name:string;provenance:Record<string,unknown>}
export function SourceCredits({credits}:{credits?:SourceCredit[]}) {
  if(!credits?.length)return null;
  function download(){
    const text=credits!.map(credit=>`${credit.name}\n${credit.provenance.attribution??`Generated with ${credit.provenance.provider} · ${credit.provenance.service??""}` }\nExact source revision: ${credit.ref.revisionId}`).join("\n\n")+"\n\nIdentify changes made to licensed sources in the delivered work.\n";
    const url=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="source-credits.txt";link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="source-provenance" aria-label="Linked source credits"><h3>Linked source credits</h3><p>Include the applicable credits when publishing or exporting work that uses these sources.</p><button className="studio-button" onClick={download}>Download source credits</button>{credits.map(credit=><details key={credit.ref.revisionId}><summary>{credit.name}</summary><SourceProvenance provenance={credit.provenance}/></details>)}</section>;
}

function link(value: unknown) { try { const url = new URL(String(value)); return url.protocol === "https:" ? url.href : null; } catch { return null; } }
export function SourceProvenance({ provenance: p }: { provenance?: Record<string, unknown> }) {
  if (!p?.provider) return null;
  const source = link(p.sourceUrl), license = link(p.licenseUrl);
  return <section className="source-provenance" aria-label="Source and rights"><h3>Source & rights</h3><dl>
    <dt>Provider</dt><dd>{String(p.provider)}</dd>
    {p.creator ? <><dt>Creator</dt><dd>{String(p.creator)}</dd></> : null}
    {p.sourceId ? <><dt>Source ID</dt><dd>{String(p.sourceId)}</dd></> : null}
    {p.service ? <><dt>Generation service</dt><dd>{String(p.service)}</dd></> : null}
    {p.model ? <><dt>Model</dt><dd>{String(p.model)}</dd></> : null}
    {p.acquiredAt ? <><dt>Acquired</dt><dd>{String(p.acquiredAt)}</dd></> : null}
    {license && <><dt>License</dt><dd><a href={license} target="_blank" rel="noreferrer">{String(p.license ?? "License terms")} ↗</a></dd></>}
    {source && <><dt>Source page</dt><dd><a href={source} target="_blank" rel="noreferrer">View source and credit ↗</a></dd></>}
    {p.provider === "perflo" && <><dt>Reported cost</dt><dd>{typeof p.actualMicros === "number" ? `$${p.actualMicros / 1_000_000}` : "Pending provider report; reservation retained"}</dd></>}
  </dl>{p.attribution ? <><Markdown content={String(p.attribution)}/><p>Keep this credit and license with delivery, and identify changes. A copy is included in rights/attribution.txt.</p></> : null}
    {p.prompt ? <details><summary>Generation prompt and settings</summary><Markdown content={String(p.prompt)}/><pre>{JSON.stringify(p.settings ?? {}, null, 2)}</pre></details> : null}
  </section>;
}
