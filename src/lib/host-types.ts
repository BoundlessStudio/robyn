export type HostBillingFlag = "wallet_missing" | "balance_empty" | "auto_top_up_error" | "usage_sync_behind" | "payment_review";

export interface HostPerson {
  user_id: string;
  email: string | null;
  display_name: string | null;
}

export interface HostPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface HostTenantSummary {
  id: string;
  name: string;
  created_at: string;
  owner: HostPerson | null;
  member_count: number;
  agent_count: number;
  agent_limit: number;
  pending_agent_count: number;
  balance_micros: number | null;
  billing_flags: HostBillingFlag[];
}

export interface HostOverview {
  generated_at: string;
  tenant_count: number;
  agent_count: number;
  balance_micros: string | null;
  wallet_missing_count: number;
  attention_count: number;
  billing_flags: Record<Exclude<HostBillingFlag, "wallet_missing">, number>;
}

export interface HostMember extends HostPerson {
  role: "admin" | "member";
  created_at: string;
}

export interface HostAgent {
  id: string;
  name: string | null;
  status: string | null;
  template: string | null;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  assigned_user_id: string | null;
  created_at: string;
}

export interface HostWallet {
  balance_micros: number;
  auto_top_up_enabled: boolean;
  auto_top_up_amount_micros: number;
  auto_top_up_threshold_micros: number;
  auto_top_up_error: string | null;
  usage_synced_through: string | null;
  has_payment_method: boolean;
}

export interface HostLedgerEntry {
  id: string;
  amount_micros: number;
  kind: "payment" | "coupon" | "usage" | "refund";
  created_at: string;
}

export interface HostTenantDetails {
  tenant: HostTenantSummary;
  generated_at: string;
  wallet: HostWallet | null;
  members: HostPage<HostMember>;
  agents: HostPage<HostAgent>;
  ledger: HostPage<HostLedgerEntry>;
  pending_payments: { amount_micros: number; created_at: string; needs_review: boolean }[];
}

export interface HostCoupon {
  code: string;
  workspace_id: string;
  amount_micros: number;
  expires_at: string;
}

export interface HostConfiguration {
  branding: { appName: string; logoUrl: string };
  default_agent: { template: string; cpu: number; memory: number; disk: number; monthlyCapUsd: number };
  agent_types: { id: string; template: string; label: string; description: string; recommended?: boolean }[];
  signup_policy: { registration: "open"; email_verification: false; source: string };
  integrations: { name: string; configured: boolean }[];
}
