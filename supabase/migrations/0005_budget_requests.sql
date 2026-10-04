-- Requests are review-only: creating a request never changes the Agent37 budget.
create table if not exists public.agent_budget_requests (
  id uuid primary key default gen_random_uuid(),
  agent37_id text not null references public.agents(agent37_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null check (char_length(requester_name) <= 320),
  amount_micros bigint not null check (amount_micros > 0 and amount_micros <= 9007199254740991),
  note text not null default '' check (char_length(note) <= 1000),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{1,64}$'),
  created_at timestamptz not null default now(),
  unique (agent37_id, requester_id, idempotency_key)
);

create index if not exists agent_budget_requests_agent_date
  on public.agent_budget_requests (agent37_id, created_at desc);

alter table public.agent_budget_requests enable row level security;
revoke all on public.agent_budget_requests from public, anon, authenticated;
grant select, insert on public.agent_budget_requests to service_role;
