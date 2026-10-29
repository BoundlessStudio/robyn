import { createInterface } from "node:readline/promises";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { hashBetaPassword } from "../src/lib/beta-password";

async function main() {
  // Node's --env-file may select a different private environment file.
  try { loadEnvFile(".env.local"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const username = process.argv[2] ?? "admin";
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(username)) throw new Error("Use a username of at most 80 letters, numbers, dots, underscores or hyphens.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configure Supabase and apply migrations through 0026 through the checksummed setup runner first.");

  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    // Redirected stdin keeps automation and shell history free of a password argument.
    // A TTY disables echo while reading the password.
    if (process.stdin.isTTY) {
      reader.close();
      process.stdout.write("Admin password: ");
      process.stdin.setRawMode(true); process.stdin.resume();
    }
    const password = process.stdin.isTTY ? await new Promise<string>((resolve, reject) => {
      let value = "";
      const input = (chunk: Buffer) => {
        for (const character of chunk.toString()) {
          if (character === "\u0003") { process.stdin.off("data", input); reject(new Error("Cancelled.")); return; }
          if (character === "\r" || character === "\n") { process.stdin.off("data", input); resolve(value); return; }
          if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
          else if (character >= " " && value.length < 257) value += character;
        }
      };
      process.stdin.on("data", input);
    }) : await reader.question("");
    const hash = await hashBetaPassword(password);
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await db.rpc("configure_beta_admin", { p_username: username, p_password_hash: hash });
    if (error) {
      const detail = error.message.split(password).join("[redacted]").split(hash).join("[redacted]").split(key).join("[redacted]");
      throw new Error(`The admin account could not be configured (${error.code}): ${detail}`);
    }
    process.stdout.write(`\nAdmin account configured: ${username}. Previous admin sessions were revoked. Open /admin/login.\n`);
  } finally {
    if (process.stdin.isTTY) { process.stdin.setRawMode(false); process.stdin.pause(); }
    reader.close();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Admin configuration failed."); process.exitCode = 1; });
