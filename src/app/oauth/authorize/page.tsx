import type { Metadata } from "next";
import { AuthFrame } from "@/components/brand/AuthFrame";
import { ConsentForm } from "../mcp-connection-forms";

export const metadata: Metadata = { title: "Connect to Robyn", referrer: "strict-origin" };

export default async function AuthorizePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const fields = new URLSearchParams();
  const keys = ["client_id", "redirect_uri", "state", "resource", "scope", "response_type", "code_challenge", "code_challenge_method"];
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value.length <= 2048) fields.set(key, value);
    else if (value !== undefined) return <AuthFrame><p>Open a fresh connection from your MCP client.</p></AuthFrame>;
  }
  return <AuthFrame>
    <h1 className="text-4xl font-medium tracking-[-.06em]">Connect to Robyn</h1>
    <ConsentForm fields={fields.toString()} />
  </AuthFrame>;
}
