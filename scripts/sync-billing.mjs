#!/usr/bin/env node
if (!process.env.NEXT_PUBLIC_SITE_URL || !process.env.BILLING_CRON_SECRET) {
  console.error('Configure NEXT_PUBLIC_SITE_URL and BILLING_CRON_SECRET first.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(new URL('/api/billing/sync', process.env.NEXT_PUBLIC_SITE_URL), {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.BILLING_CRON_SECRET}` }, signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) throw new Error(`Billing sweep failed (${response.status}). Check the server configuration and upstream availability.`);
    const { synced } = await response.json();
    console.log(`Reconciled billing for ${synced} workspace(s).`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
