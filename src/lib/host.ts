import "server-only";
import { branding } from "@/config/branding";
import { AGENT_TYPES, DEFAULT_AGENT } from "@/config/agents";
import { requireHostAdmin } from "@/lib/host-auth";
import { ApiError } from "@/lib/http";
import type { HostConfiguration, HostOverview, HostPage, HostTenantDetails, HostTenantSummary } from "@/lib/host-types";

export function hostPageNumber(params: URLSearchParams, key = "page"): number {
  const raw = params.get(key) ?? "1";
  if (!/^[1-9]\d{0,6}$/.test(raw) || Number(raw) > 1000000) {
    throw new ApiError(400, "invalid_page", "Page must be an integer between 1 and 1000000.");
  }
  return Number(raw);
}

function tenantSummary(row: HostTenantSummary): HostTenantSummary {
  return {
    id: row.id, name: row.name, created_at: row.created_at,
    owner: row.owner ? { user_id: row.owner.user_id, email: row.owner.email, display_name: row.owner.display_name } : null,
    member_count: row.member_count, agent_count: row.agent_count, balance_micros: row.balance_micros,
    agent_limit: row.agent_limit, pending_agent_count: row.pending_agent_count,
    billing_flags: row.billing_flags,
  };
}

function page<T, U>(source: HostPage<T>, project: (item: T) => U): HostPage<U> {
  return { items: source.items.map(project), page: source.page, page_size: source.page_size, total: source.total };
}

function checkRead(error: unknown) {
  if (error) throw new ApiError(503, "host_unavailable", "Host data is unavailable. Check the Host database migration and retry.");
}

// The authorization check is in the data layer as well as the page boundary.
export async function readHostOverview(): Promise<HostOverview> {
  const { db } = await requireHostAdmin();
  const { data, error } = await db.rpc("host_overview");
  checkRead(error);
  if (!data) throw new ApiError(503, "host_unavailable", "Host overview is unavailable.");
  const row = data as HostOverview;
  return {
    generated_at: row.generated_at, tenant_count: row.tenant_count, agent_count: row.agent_count,
    balance_micros: row.balance_micros, wallet_missing_count: row.wallet_missing_count, attention_count: row.attention_count,
    billing_flags: {
      balance_empty: row.billing_flags.balance_empty, auto_top_up_error: row.billing_flags.auto_top_up_error,
      usage_sync_behind: row.billing_flags.usage_sync_behind, payment_review: row.billing_flags.payment_review,
    },
  };
}

export async function readHostTenants(params: URLSearchParams): Promise<HostPage<HostTenantSummary>> {
  const { db } = await requireHostAdmin();
  const query = (params.get("q") ?? "").trim();
  if (query.length > 200) throw new ApiError(400, "invalid_query", "Search must be 200 characters or fewer.");
  const { data, error } = await db.rpc("host_tenants", { p_query: query, p_page: hostPageNumber(params) });
  checkRead(error);
  if (!data) throw new ApiError(503, "host_unavailable", "Tenant directory is unavailable.");
  return page(data as HostPage<HostTenantSummary>, tenantSummary);
}

export async function readHostTenant(id: string, params: URLSearchParams): Promise<HostTenantDetails> {
  const { db } = await requireHostAdmin();
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) throw new ApiError(404, "not_found", "Tenant not found.");
  const { data, error } = await db.rpc("host_tenant", {
    p_workspace: id, p_member_page: hostPageNumber(params, "member_page"),
    p_agent_page: hostPageNumber(params, "agent_page"), p_ledger_page: hostPageNumber(params, "ledger_page"),
  });
  checkRead(error);
  if (!data) throw new ApiError(404, "not_found", "Tenant not found.");
  const row = data as HostTenantDetails;
  return {
    tenant: tenantSummary(row.tenant), generated_at: row.generated_at,
    wallet: row.wallet ? {
      balance_micros: row.wallet.balance_micros, auto_top_up_enabled: row.wallet.auto_top_up_enabled,
      auto_top_up_amount_micros: row.wallet.auto_top_up_amount_micros,
      auto_top_up_threshold_micros: row.wallet.auto_top_up_threshold_micros,
      auto_top_up_error: row.wallet.auto_top_up_error, usage_synced_through: row.wallet.usage_synced_through,
      has_payment_method: row.wallet.has_payment_method,
    } : null,
    members: page(row.members, (m) => ({ user_id: m.user_id, email: m.email, display_name: m.display_name, role: m.role, created_at: m.created_at })),
    agents: page(row.agents, (a) => ({ id: a.id, name: a.name, status: a.status, template: a.template,
      cpu: a.cpu, memory: a.memory, disk: a.disk, assigned_user_id: a.assigned_user_id, created_at: a.created_at })),
    ledger: page(row.ledger, (l) => ({ id: l.id, amount_micros: l.amount_micros, kind: l.kind, created_at: l.created_at })),
    pending_payments: row.pending_payments.map((p) => ({ amount_micros: p.amount_micros, created_at: p.created_at, needs_review: p.needs_review })),
  };
}

export async function readHostConfiguration(): Promise<HostConfiguration> {
  await requireHostAdmin();
  return {
    branding: { appName: branding.appName, logoUrl: branding.logoUrl },
    default_agent: { template: DEFAULT_AGENT.template, cpu: DEFAULT_AGENT.cpu, memory: DEFAULT_AGENT.memory,
      disk: DEFAULT_AGENT.disk, monthlyCapUsd: DEFAULT_AGENT.monthlyCapUsd },
    agent_types: AGENT_TYPES.map((a) => ({ id: a.id, template: a.template, label: a.label, description: a.description, recommended: a.recommended })),
    signup_policy: { registration: "open", email_verification: false, source: "Application setup policy; live Supabase auth settings are managed externally." },
    integrations: [
      { name: "Agent37", configured: Boolean(process.env.AGENT37_API_KEY) },
      { name: "Supabase auth", configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
      { name: "Supabase server", configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) },
      { name: "Stripe payments", configured: Boolean(process.env.STRIPE_SECRET_KEY) },
      { name: "Stripe webhook", configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET) },
      { name: "Billing scheduler credential", configured: Boolean(process.env.BILLING_CRON_SECRET) },
      { name: "Inkbox", configured: Boolean(process.env.INKBOX_ADMIN_KEY) },
      { name: "Public site origin", configured: Boolean(process.env.NEXT_PUBLIC_SITE_URL) },
    ],
  };
}
