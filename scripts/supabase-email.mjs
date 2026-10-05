// Operator tooling only. Supabase sends auth emails through Resend SMTP;
// the application never needs the Resend key.
export function resendSmtpSettings({ apiKey, fromEmail, senderName, currentRateLimit }) {
  if (typeof apiKey !== 'string' || !/^re_[A-Za-z0-9_-]+$/.test(apiKey)) {
    throw new Error('Set RESEND_API_KEY in the selected operations environment file.');
  }
  fromEmail = typeof fromEmail === 'string' ? fromEmail.trim().toLowerCase() : '';
  if (fromEmail.length > 254 || !/^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(fromEmail)) {
    throw new Error('Set RESEND_FROM_EMAIL to an address on a verified Resend domain.');
  }
  if (typeof senderName !== 'string' || !senderName.trim() || senderName.length > 128 || /[\r\n]/.test(senderName)) {
    throw new Error('Provide a sender name of 1–128 characters without line breaks.');
  }
  return {
    smtp_host: 'smtp.resend.com',
    smtp_port: '465',
    smtp_user: 'resend',
    smtp_pass: apiKey,
    smtp_admin_email: fromEmail,
    smtp_sender_name: senderName.trim(),
    // Lift the built-in provider's two-per-hour limit, preserving higher limits.
    rate_limit_email_sent: Math.max(30, Number.isInteger(currentRateLimit) ? currentRateLimit : 0),
  };
}

async function requestJson(fetcher, url, options, action) {
  let response;
  try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error(`${action} failed. Check network access and retry.`); }
  if (!response.ok) {
    // Provider error bodies can contain credentials; never print them.
    throw new Error(`${action} failed (HTTP ${response.status}). Check the project, token permissions, and provider configuration.`);
  }
  try { return await response.json(); }
  catch { throw new Error(`${action} returned an invalid response.`); }
}

export async function configureResendEmail({ token, projectRef, apiKey, fromEmail, senderName, fetcher = fetch }) {
  if (!token || !/^[a-z0-9]{20}$/.test(projectRef || '')) {
    throw new Error('Configure the hosted Supabase project and SUPABASE_ACCESS_TOKEN in the local environment files first.');
  }
  // Validate all operator inputs before contacting providers.
  const smtp = resendSmtpSettings({ apiKey, fromEmail, senderName });
  const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const current = await requestJson(fetcher, endpoint, { headers }, 'Reading Supabase auth configuration');
  if (current.hook_send_email_enabled) {
    throw new Error('An active Supabase Send Email hook overrides SMTP. Review that hook before switching providers.');
  }

  const domainName = smtp.smtp_admin_email.split('@')[1];
  let after;
  let domain;
  do {
    const url = new URL('https://api.resend.com/domains');
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    const page = await requestJson(fetcher, url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } }, 'Reading Resend domains');
    if (!Array.isArray(page.data)) throw new Error('Resend returned an invalid domain list.');
    domain = page.data.find(item => item.name?.toLowerCase() === domainName);
    if (domain || !page.has_more) break;
    const cursor = page.data.at(-1)?.id;
    if (!cursor || cursor === after) throw new Error('Resend returned an invalid domain cursor.');
    after = cursor;
  } while (true);
  if (!domain || domain.status !== 'verified' || (domain.capabilities?.sending && domain.capabilities.sending !== 'enabled')) {
    throw new Error('The sender domain must be verified and enabled for sending in Resend. Supabase was not changed.');
  }

  smtp.rate_limit_email_sent = resendSmtpSettings({ apiKey, fromEmail, senderName, currentRateLimit: current.rate_limit_email_sent }).rate_limit_email_sent;
  await requestJson(fetcher, endpoint, { method: 'PATCH', headers, body: JSON.stringify(smtp) }, 'Saving Supabase Resend SMTP configuration');
  const saved = await requestJson(fetcher, endpoint, { headers }, 'Verifying Supabase SMTP configuration');
  for (const name of ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_admin_email', 'smtp_sender_name', 'rate_limit_email_sent']) {
    if (String(saved[name]) !== String(smtp[name])) throw new Error('Supabase SMTP settings did not match after saving. Check configuration before sending email.');
  }
  if (saved.hook_send_email_enabled) throw new Error('A Send Email hook became active during setup. Check configuration before sending email.');
  return { projectRef, fromEmail: smtp.smtp_admin_email, senderName: smtp.smtp_sender_name, hourlyLimit: smtp.rate_limit_email_sent };
}
