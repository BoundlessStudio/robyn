-- Durable per-agent provisioning state; never store plaintext Inkbox keys here.
create table if not exists public.agent_inkbox_identities (
  agent37_id text primary key references public.agents(agent37_id) on delete cascade,
  handle text not null unique,
  identity_id uuid,
  email_address text,
  owner_email text not null,
  allowed_phone text,
  plugin_installed boolean not null default false,
  restart_pending boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'provisioning', 'ready', 'error')),
  step text not null default 'Identity queued',
  last_error text,
  lease_token uuid,
  lease_until timestamptz not null default '1970-01-01T00:00:00Z',
  updated_at timestamptz not null default now()
);

alter table public.agent_inkbox_identities enable row level security;
revoke all on public.agent_inkbox_identities from anon, authenticated;
grant select, insert, update, delete on public.agent_inkbox_identities to service_role;
