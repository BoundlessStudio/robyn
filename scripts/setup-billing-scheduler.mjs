#!/usr/bin/env node

try {
  const { NEXT_PUBLIC_SUPABASE_URL: databaseUrl, NEXT_PUBLIC_SITE_URL: siteUrl, SUPABASE_ACCESS_TOKEN: token, BILLING_CRON_SECRET: secret } = process.env;
  if (!databaseUrl || !siteUrl || !token || !secret) throw new Error('Configure Supabase, site URL, and billing cron credentials first.');
  const site = new URL(siteUrl);
  if (site.protocol !== 'https:') throw new Error('The billing scheduler requires a public HTTPS site URL.');
  const database = new URL(databaseUrl);
  if (!database.hostname.endsWith('.supabase.co')) throw new Error('Expected a hosted Supabase project.');
  const ref = database.hostname.split('.')[0];
  const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
  async function query(sql) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60_000),
    });
    // Provider diagnostics can echo SQL containing credentials. Never print them.
    if (!response.ok) throw new Error(`Scheduler configuration failed (${response.status}). Check project access and installed extensions.`);
    return response.json();
  }
  // Probe before creating extensions or storing deployment-specific secrets.
  await query('select 1 from public.workspace_billing limit 0;');
  await query(`create extension if not exists pg_cron; create extension if not exists pg_net with schema extensions;`);
  await query(`BEGIN;
    do $secrets$ declare existing uuid; begin
      select id into existing from vault.secrets where name = 'robyn_billing_site_url';
      if existing is null then perform vault.create_secret(${literal(site.origin)}, 'robyn_billing_site_url');
      else perform vault.update_secret(existing, ${literal(site.origin)}); end if;
      select id into existing from vault.secrets where name = 'robyn_billing_cron_secret';
      if existing is null then perform vault.create_secret(${literal(secret)}, 'robyn_billing_cron_secret');
      else perform vault.update_secret(existing, ${literal(secret)}); end if;
    end; $secrets$;
    select cron.schedule('robyn-billing-sync', '*/5 * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'robyn_billing_site_url') || '/api/billing/sync',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'robyn_billing_cron_secret')),
        body := '{}'::jsonb, timeout_milliseconds := 300000
      );
    $job$);
    COMMIT;`);
  const jobs = await query("select schedule, active from cron.job where jobname = 'robyn-billing-sync';");
  if (jobs.length !== 1 || !jobs[0].active || jobs[0].schedule !== '*/5 * * * *') throw new Error('Billing schedule verification failed.');
  console.log('Billing reconciliation scheduled every five minutes. Credentials are encrypted in Supabase Vault.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
