import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashBetaPassword(password: string) {
  if (password.length < 8 || password.length > 256) throw new Error("Use a password between 8 and 256 characters.");
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await derive(password, salt)).toString("hex")}`;
}

// Missing accounts take the same expensive path as an incorrect password.
const dummyHash = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;
export async function verifyBetaPassword(password: string, encoded: string | null) {
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded ?? dummyHash);
  if (!match || password.length > 256) return false;
  const actual = await derive(password, Buffer.from(match[1], "hex"));
  return timingSafeEqual(actual, Buffer.from(match[2], "hex")) && encoded !== null;
}
