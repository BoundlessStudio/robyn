// Trusted operator tooling only; this module is never imported by the web app.
export const DEFAULT_HOST_EMAIL = 'master@rgbknights.com';
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export const HOST_INVITE_TEMPLATE = '<h2>Set up your Robyn account</h2><p>You have been invited to Robyn. Choose your password to continue.</p><p><a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=invite">Set password</a></p>';

export async function configureHostInvitation({ token, projectRef, origin, fetcher = fetch }) {
  if (!token || !projectRef) throw new Error('Host invitation setup requires SUPABASE_ACCESS_TOKEN in the selected operations config.');
  const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const currentResponse = await fetcher(endpoint, { headers });
  if (!currentResponse.ok) throw new Error('Could not read Supabase invitation configuration. Check the operations token.');
  const current = await currentResponse.json();
  const allowed = [...new Set([...String(current.uri_allow_list || '').split(',').filter(Boolean), `${origin}/**`])];
  const allowResponse = await fetcher(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ uri_allow_list: allowed.join(',') }) });
  if (!allowResponse.ok) throw new Error('Could not configure the Supabase invitation redirect. No invitation was requested.');
  const response = await fetcher(endpoint, { method: 'PATCH', headers, body: JSON.stringify({
    mailer_subjects_invite: 'Set up your Robyn account',
    mailer_templates_invite_content: HOST_INVITE_TEMPLATE,
  }) });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const message = String(failure.message || '');
    // Supabase free projects with the default SMTP provider prohibit custom templates.
    // Their default invitation verifies the token upstream and redirects with a URL fragment.
    if (response.status === 400 && message.includes('Email template modification is not available for free tier projects using the default email provider')) return 'standard';
    throw new Error('Could not configure the Supabase invitation template. No invitation was requested.');
  }
  return 'token_hash';
}

export async function bootstrapHost(db, { email = DEFAULT_HOST_EMAIL, origin, reviewedUserId, configureInvite }) {
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Provide a valid Host email address.');
  if (reviewedUserId && !UUID.test(reviewedUserId)) throw new Error('Provide the reviewed Supabase user UUID.');
  const { error: tableError } = await db.from('host_admins').select('user_id').limit(1);
  if (tableError) throw new Error('Apply the Host database migration before bootstrapping the account.');

  let existing;
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users) throw new Error('Could not look up the Host account. No invitation was requested.');
    existing = data.users.find((user) => user.email?.toLowerCase() === email);
    if (existing || data.users.length < 1000) break;
  }
  if (existing) {
    const { data, error } = await db.from('host_admins').select('user_id').eq('user_id', existing.id).maybeSingle();
    if (error) throw new Error('Could not check existing Host permissions.');
    if (data) return { userId: existing.id, invited: false, alreadyGranted: true };
    if (!reviewedUserId || reviewedUserId !== existing.id) {
      throw new Error(`An account already exists for ${email} without Host permission. Review its identity before using --reviewed-user-id ${existing.id}. No access was granted.`);
    }
    const { error: grantError } = await db.from('host_admins').upsert({ user_id: existing.id }, { onConflict: 'user_id' });
    if (grantError) throw new Error('Could not grant Host permission to the reviewed account.');
    return { userId: existing.id, invited: false, alreadyGranted: false };
  }
  if (reviewedUserId) throw new Error('The reviewed account does not match an existing account for this email.');
  const parsedOrigin = new URL(origin);
  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) throw new Error('Provide the application origin for the invitation.');
  const invitationMode = await configureInvite();
  const callback = new URL(invitationMode === 'standard' ? '/auth/invite' : '/auth/callback', origin);
  if (invitationMode !== 'standard') callback.searchParams.set('next', '/reset-password');
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: callback.toString() });
  if (error || !data?.user) throw new Error('Could not create the Host invitation. Check Supabase SMTP, email rate limits, and account state before retrying.');
  if (data.user.email?.toLowerCase() !== email || !UUID.test(data.user.id)) throw new Error('The invitation returned an unexpected account. Host access was not granted.');
  const { error: grantError } = await db.from('host_admins').upsert({ user_id: data.user.id }, { onConflict: 'user_id' });
  if (grantError) throw new Error(`The invitation was created but its Host grant failed. Review account ${data.user.id}, then resume with --reviewed-user-id ${data.user.id}.`);
  return { userId: data.user.id, invited: true, alreadyGranted: false, invitationMode: invitationMode || 'token_hash' };
}
