// Pure setup helpers also used by the regression tests. No credentials are logged here.
export const INKBOX_PORT = 8765;
export const INKBOX_PLUGIN_REF = "753a623bee16f0f56299a6465ddf4fd902b6c38b";

export function normalizeInkboxPhone(value: string): string | null {
  const phone = value.trim().replace(/[\s().-]/g, "");
  if (!phone) return null;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Enter a phone number with its country code, such as +14165550123.");
  return phone;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function inkboxInstallCommand(handle: string, publicUrl: string, scopedKey: string): string {
  if (!/^robyn-[a-f0-9]{24}$/.test(handle)) throw new Error("Invalid identity handle");
  if (!/^https:\/\/[a-z0-9-]+\.agent37\.app\/?$/.test(publicUrl)) throw new Error("Invalid Inkbox webhook URL");
  const sdkHook = "/usr/local/lib/hermes/hermes-agent/venv/bin/python -c 'import inkbox' 2>/dev/null || uv pip install --python /usr/local/lib/hermes/hermes-agent/venv/bin/python 'inkbox>=0.7.6,<1.0.0' 'aiohttp>=3.9' 'segno>=1.5'";
  const script = [
    "set -e",
    "mkdir -p ~/.agent37/hooks ~/.hermes && touch ~/.agent37/hooks/post-restart.sh",
    `grep -qF 'import inkbox' ~/.agent37/hooks/post-restart.sh || cat >> ~/.agent37/hooks/post-restart.sh <<'INKBOX_SDK_HOOK'\n${sdkHook}\nINKBOX_SDK_HOOK`,
    sdkHook,
    `[ -d ~/.hermes/plugins/inkbox ] || hermes plugins install inkbox-ai/hermes-agent-plugin --ref ${INKBOX_PLUGIN_REF} --enable </dev/null >/dev/null`,
    "touch ~/.hermes/.env && sed -i '/^INKBOX_PUBLIC_URL=/d' ~/.hermes/.env",
    `printf '%s\\n' ${shellQuote(`INKBOX_PUBLIC_URL=${publicUrl}`)} >> ~/.hermes/.env`,
    "hermes config set display.platforms.inkbox.show_reasoning false >/dev/null",
    `printf '%s' ${shellQuote(scopedKey)} | hermes inkbox bootstrap --identity ${shellQuote(handle)} --api-key-stdin --voice-ai --rotate-signing-key`,
  ].join("\n");
  // Bound remote work too: a lost exec response must not leave an installer running indefinitely.
  return `timeout 150 sh -c ${shellQuote(script)}`;
}

export function bootstrapConfigured(result: { exit_code: number; stdout: string; truncated: boolean }): boolean {
  if (result.exit_code !== 0 || result.truncated) return false;
  try {
    const json = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
    return json.status === "configured";
  } catch {
    return false;
  }
}
