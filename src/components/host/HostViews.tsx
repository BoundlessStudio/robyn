"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HostWorkspaceControls } from "@/components/host/HostWorkspaceControls";
import type { HostBillingFlag, HostConfiguration, HostOverview, HostPage, HostTenantDetails, HostTenantSummary } from "@/lib/host-types";

const FLAGS: Record<HostBillingFlag, string> = {
  wallet_missing: "Wallet unavailable", balance_empty: "Balance empty or negative", auto_top_up_error: "Automatic top-up error",
  usage_sync_behind: "Usage reconciliation behind", payment_review: "Payment needs review",
};

export function hostMoney(micros: number | string | null): string {
  if (micros === null) return "Unavailable";
  const amount = BigInt(micros);
  const cents = ((amount < 0n ? -amount : amount) + 5000n) / 10000n;
  return `${amount < 0n ? "-" : ""}$${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : "Unavailable";

function useHostRead<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(null); setLoading(true);
    void (async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(response.status === 403 ? "Host access has been removed or is unavailable for this account." :
          response.status === 401 ? "Your session has expired. Sign in again." : body.error?.message ?? "Host data is unavailable.");
        if (!controller.signal.aborted) setData(body as T);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Host data is unavailable.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [endpoint, revision]);
  return { data, error, loading, refresh: () => setRevision((value) => value + 1) };
}

function Header({ title, description, loading, refresh }: { title: string; description: string; loading: boolean; refresh: () => void }) {
  return <header className="flex flex-wrap items-start justify-between gap-3">
    <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
    <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button>
  </header>;
}

function ReadState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <p className="text-sm text-muted-foreground" role="status">Loading Host data…</p>;
  if (error) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive" role="alert">{error}</p>;
  return null;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-lg border bg-card p-4"><h2 className="font-medium">{title}</h2>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

function BillingFlags({ flags }: { flags: HostBillingFlag[] }) {
  return flags.length ? <div className="flex flex-wrap gap-1">{flags.map((flag) => <span key={flag} className="rounded border bg-secondary px-2 py-1 text-xs">{FLAGS[flag]}</span>)}</div> :
    <span className="text-xs text-muted-foreground">No recorded billing flags</span>;
}

function Table({ headings, children, empty }: { headings: string[]; children: React.ReactNode; empty?: string }) {
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm">
    <thead className="bg-secondary/50"><tr>{headings.map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{heading}</th>)}</tr></thead>
    <tbody className="divide-y">{empty ? <tr><td colSpan={headings.length} className="px-3 py-6 text-muted-foreground">{empty}</td></tr> : children}</tbody>
  </table></div>;
}

function Cell({ children }: { children: React.ReactNode }) { return <td className="px-3 py-3 align-top">{children}</td>; }

function Pagination({ data, change, label }: { data: HostPage<unknown>; change: (page: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  return <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <p className="text-muted-foreground">{data.total.toLocaleString()} {label.toLowerCase()} · Page {data.page} of {pages}</p>
    <div className="flex gap-2"><Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => change(data.page - 1)}>Previous</Button>
      <Button size="sm" variant="outline" disabled={data.page >= pages} onClick={() => change(data.page + 1)}>Next</Button></div>
  </nav>;
}

function Property({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid gap-1 py-2 sm:grid-cols-2"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words text-sm">{value}</dd></div>;
}

export function HostOverviewView() {
  const { data, error, loading, refresh } = useHostRead<HostOverview>("/api/host/overview");
  return <>
    <Header title="Host overview" description="Operational visibility across Robyn tenants." loading={loading} refresh={refresh} />
    <ReadState loading={loading} error={error} />
    {data && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Tenants" value={data.tenant_count} /><Metric label="Agents" value={data.agent_count} />
        <Metric label="Recorded tenant balances · USD" value={hostMoney(data.balance_micros)} /><Metric label="Tenants with billing flags" value={data.attention_count} />
      </div>
      {data.tenant_count === 0 && <p className="text-sm text-muted-foreground">No tenant workspaces have been created yet.</p>}
      {data.wallet_missing_count > 0 && <p role="status" className="text-sm text-muted-foreground">{data.wallet_missing_count} tenant wallets are unavailable and excluded from the balance total.</p>}
      <Panel title="Billing attention"><dl className="divide-y">
        <Property label="Wallet unavailable" value={data.wallet_missing_count} />
        {Object.entries(data.billing_flags).map(([flag, count]) => <Property key={flag} label={FLAGS[flag as HostBillingFlag]} value={count} />)}
      </dl><Button asChild variant="outline"><Link href="/host/tenants">View tenants</Link></Button></Panel>
      <p className="text-xs text-muted-foreground">Read at {dateTime(data.generated_at)}. Reconciliation dates and configuration indicators do not establish scheduler or service health.</p>
    </>}
  </>;
}

export function HostTenantsView() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { data, error, loading, refresh } = useHostRead<HostPage<HostTenantSummary>>(`/api/host/tenants?q=${encodeURIComponent(query)}&page=${currentPage}`);
  return <>
    <Header title="Tenants" description="Each workspace is a tenant, with its own members, agents, and wallet." loading={loading} refresh={refresh} />
    <form className="flex max-w-xl gap-2" onSubmit={(event) => { event.preventDefault(); setQuery(input.trim()); setCurrentPage(1); }}>
      <Label htmlFor="host-tenant-search" className="sr-only">Search tenants</Label>
      <Input id="host-tenant-search" placeholder="Workspace name, ID, or owner email" value={input} maxLength={200} onChange={(event) => setInput(event.target.value)} />
      <Button variant="outline" type="submit"><Search />Search</Button>
    </form>
    <ReadState loading={loading} error={error} />
    {data && <>
      <Table headings={["Workspace", "Owner", "Created", "Members", "Agents", "Balance · USD", "Billing flags"]} empty={!data.items.length ? "No tenants match this search." : undefined}>
        {data.items.map((tenant) => <tr key={tenant.id}>
          <Cell><Link href={`/host/tenants/${tenant.id}`} className="font-medium underline-offset-4 hover:underline">{tenant.name}</Link><p className="mt-1 font-mono text-xs text-muted-foreground">{tenant.id}</p></Cell>
          <Cell>{tenant.owner?.display_name ?? "Unavailable"}<p className="text-xs text-muted-foreground">{tenant.owner?.email ?? ""}</p></Cell>
          <Cell>{dateTime(tenant.created_at)}</Cell><Cell>{tenant.member_count}</Cell><Cell>{tenant.agent_count} / {tenant.agent_limit}</Cell>
          <Cell>{hostMoney(tenant.balance_micros)}</Cell><Cell><BillingFlags flags={tenant.billing_flags} /></Cell>
        </tr>)}
      </Table><Pagination data={data} change={setCurrentPage} label="Tenants" />
    </>}
  </>;
}

export function HostTenantView({ id }: { id: string }) {
  const [pages, setPages] = useState({ member: 1, agent: 1, ledger: 1 });
  const { data, error, loading, refresh } = useHostRead<HostTenantDetails>(`/api/host/tenants/${id}?member_page=${pages.member}&agent_page=${pages.agent}&ledger_page=${pages.ledger}`);
  const changePage = (key: keyof typeof pages, value: number) => setPages((previous) => ({ ...previous, [key]: value }));
  return <>
    <Link href="/host/tenants" className="text-sm text-muted-foreground hover:underline">← Tenants</Link>
    <Header title={data?.tenant.name ?? "Tenant details"} description="Workspace operations and recorded billing information." loading={loading} refresh={refresh} />
    <ReadState loading={loading} error={error} />
    {data && <>
      <BillingFlags flags={data.tenant.billing_flags} />
      <HostWorkspaceControls key={id} tenant={data.tenant} onChanged={refresh} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Workspace"><dl className="divide-y">
          <Property label="Workspace ID" value={data.tenant.id} /><Property label="Created" value={dateTime(data.tenant.created_at)} />
          <Property label="Owner" value={data.tenant.owner?.display_name ?? "Unavailable"} /><Property label="Owner email" value={data.tenant.owner?.email ?? "Unavailable"} />
          <Property label="Members" value={data.tenant.member_count} /><Property label="Agents / limit" value={`${data.tenant.agent_count} / ${data.tenant.agent_limit}`} />
        </dl></Panel>
        <Panel title="Wallet">{data.wallet ? <dl className="divide-y">
          <Property label="Balance · USD" value={hostMoney(data.wallet.balance_micros)} />
          <Property label="Saved payment method" value={data.wallet.has_payment_method ? "Present" : "None"} />
          <Property label="Automatic top-up" value={data.wallet.auto_top_up_enabled ? "Enabled" : "Disabled"} />
          <Property label="Top-up amount" value={hostMoney(data.wallet.auto_top_up_amount_micros)} />
          <Property label="Top-up threshold" value={hostMoney(data.wallet.auto_top_up_threshold_micros)} />
          <Property label="Reconciled through · UTC date" value={data.wallet.usage_synced_through ?? "Not yet reconciled"} />
          <Property label="Automatic top-up error" value={data.wallet.auto_top_up_error ?? "None recorded"} />
        </dl> : <p className="text-sm text-muted-foreground">Wallet data is unavailable.</p>}</Panel>
      </div>
      <Panel title="Pending automatic payments">
        {!data.pending_payments.length ? <p className="text-sm text-muted-foreground">No unfinished automatic payments.</p> : data.pending_payments.map((payment) =>
          <div key={payment.created_at} className="space-y-1 text-sm"><p>{hostMoney(payment.amount_micros)} USD · Created {dateTime(payment.created_at)}</p>
            <p className={payment.needs_review ? "text-destructive" : "text-muted-foreground"}>{payment.needs_review ? "Needs operator review — unfinished for more than 23 hours." : "Pending confirmation."}</p></div>)}
      </Panel>
      <Panel title="Members"><Table headings={["Name", "Email", "Role", "Joined"]} empty={!data.members.items.length ? "No members on this page." : undefined}>
        {data.members.items.map((member) => <tr key={member.user_id}><Cell>{member.display_name ?? "Unavailable"}</Cell><Cell>{member.email ?? "Unavailable"}</Cell><Cell>{member.role}</Cell><Cell>{dateTime(member.created_at)}</Cell></tr>)}
      </Table><Pagination data={data.members} change={(value) => changePage("member", value)} label="Members" /></Panel>
      <Panel title="Agent metadata"><p className="text-xs text-muted-foreground">Status and resources are database snapshots. This view does not contact agents.</p>
        <Table headings={["Agent", "Status snapshot", "Template", "Resources", "Assigned user"]} empty={!data.agents.items.length ? "No agents on this page." : undefined}>
          {data.agents.items.map((agent) => <tr key={agent.id}>
            <Cell>{agent.name ?? "Unnamed agent"}<p className="font-mono text-xs text-muted-foreground">{agent.id}</p></Cell>
            <Cell>{agent.status ?? "Unavailable"}</Cell><Cell>{agent.template ?? "Unavailable"}</Cell>
            <Cell>{agent.cpu === null || agent.memory === null || agent.disk === null ? "Unavailable" : `${agent.cpu} vCPU · ${agent.memory} GB RAM · ${agent.disk} GB disk`}</Cell>
            <Cell><span className="font-mono text-xs">{agent.assigned_user_id ?? "Unassigned"}</span></Cell>
          </tr>)}
        </Table><Pagination data={data.agents} change={(value) => changePage("agent", value)} label="Agents" />
      </Panel>
      <Panel title="Ledger entries"><Table headings={["Recorded", "Kind", "Amount · USD"]} empty={!data.ledger.items.length ? "No ledger entries on this page." : undefined}>
        {data.ledger.items.map((entry) => <tr key={entry.id}><Cell>{dateTime(entry.created_at)}</Cell><Cell>{entry.kind}</Cell><Cell>{hostMoney(entry.amount_micros)}</Cell></tr>)}
      </Table><Pagination data={data.ledger} change={(value) => changePage("ledger", value)} label="Entries" /></Panel>
      <p className="text-xs text-muted-foreground">Read at {dateTime(data.generated_at)}. Usage can settle after the reconciliation date advances.</p>
    </>}
  </>;
}

export function HostConfigurationView() {
  const { data, error, loading, refresh } = useHostRead<HostConfiguration>("/api/host/configuration");
  return <>
    <Header title="Configuration" description="Current application defaults and integration configuration." loading={loading} refresh={refresh} />
    <ReadState loading={loading} error={error} />
    {data && <>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Branding"><dl className="divide-y"><Property label="Application name" value={data.branding.appName} /><Property label="Logo" value={data.branding.logoUrl || "Hidden"} /></dl></Panel>
        <Panel title="New agent defaults"><dl className="divide-y">
          <Property label="Template" value={data.default_agent.template} />
          <Property label="Resources" value={`${data.default_agent.cpu} vCPU · ${data.default_agent.memory} GB RAM · ${data.default_agent.disk} GB disk`} />
          <Property label="Managed monthly allowance" value={`$${data.default_agent.monthlyCapUsd.toFixed(2)} USD`} />
        </dl></Panel>
      </div>
      <Panel title="Agent catalog"><Table headings={["Type", "Template", "Description"]} empty={!data.agent_types.length ? "No agent types configured." : undefined}>
        {data.agent_types.map((type) => <tr key={type.id}><Cell>{type.label}{type.recommended && <span className="ml-2 text-xs text-muted-foreground">Recommended</span>}</Cell><Cell>{type.template}</Cell><Cell>{type.description}</Cell></tr>)}
      </Table></Panel>
      <Panel title="Signup policy"><dl className="divide-y"><Property label="Registration" value="Open" /><Property label="Email verification" value="Disabled by application setup" /></dl>
        <p className="text-xs text-muted-foreground">{data.signup_policy.source}</p></Panel>
      <Panel title="Integrations"><dl className="divide-y">{data.integrations.map((integration) => <Property key={integration.name} label={integration.name} value={integration.configured ? "Configured" : "Missing"} />)}</dl>
        <p className="text-xs text-muted-foreground">These indicators report configuration presence. Service connectivity and scheduler execution are managed externally. Credentials are managed in Doppler.</p></Panel>
    </>}
  </>;
}
