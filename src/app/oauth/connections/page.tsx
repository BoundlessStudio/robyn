import type { Metadata } from "next";
import { AuthFrame } from "@/components/brand/AuthFrame";
import { Connections } from "../mcp-connection-forms";

export const metadata: Metadata = { title: "MCP connections · Robyn", referrer: "strict-origin" };

export default function ConnectionsPage() {
  return <AuthFrame>
    <a href="/dashboard" className="mb-8 inline-block text-xs">← Back to Studio</a>
    <h1 className="text-4xl font-medium tracking-[-.06em]">MCP connections</h1>
    <Connections />
  </AuthFrame>;
}
