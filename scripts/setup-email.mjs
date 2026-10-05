#!/usr/bin/env node
import { branding } from '../src/config/branding.ts';
import { configureResendEmail } from './supabase-email.mjs';

try {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm run email:setup -- [--config dev|stg|prd]\nConfigures Supabase Auth to deliver email through Resend SMTP.\nRequires SUPABASE_ACCESS_TOKEN, RESEND_API_KEY, and RESEND_FROM_EMAIL in the matching .env.ops.* file.\nRESEND_FROM_NAME optionally overrides the sender name from src/config/branding.ts.\nVerifies the sender domain and preserves signup policy, templates, and redirects. No email is sent.');
  } else {
    if (args.length) throw new Error('Unknown option. Run npm run email:setup -- --help.');
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://unconfigured.invalid');
    if (!/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.protocol !== 'https:') {
      throw new Error('Set NEXT_PUBLIC_SUPABASE_URL to the selected hosted Supabase project in the runtime environment file.');
    }
    const result = await configureResendEmail({
      token: process.env.SUPABASE_ACCESS_TOKEN,
      projectRef: url.hostname.split('.')[0],
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL,
      senderName: process.env.RESEND_FROM_NAME || branding.appName,
    });
    console.log(`Resend SMTP verified for Supabase project ${result.projectRef}.\nSender: ${result.senderName} <${result.fromEmail}>\nAuth email limit: ${result.hourlyLimit}/hour. Resend plan quotas also apply.\nNo application deployment is needed for this Supabase configuration change.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Email setup failed. No credentials were logged.');
  process.exitCode = 1;
}
