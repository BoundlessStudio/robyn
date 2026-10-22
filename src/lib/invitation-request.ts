export interface InvitationRequest { email: string; craft: string; consent: true }

export function parseInvitationRequest(input: unknown): InvitationRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Please enter your email address.");
  const value = input as Record<string, unknown>;
  if (typeof value.website === "string" && value.website.trim()) throw new Error("This request could not be accepted.");
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
  if (value.consent !== true) throw new Error("Please agree to receive an email about your invitation.");
  const craft = typeof value.craft === "string" ? value.craft.trim() : "";
  if (craft.length > 280) throw new Error("Please keep your creative interests under 280 characters.");
  return { email, craft, consent: true };
}
