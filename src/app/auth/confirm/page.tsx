import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AuthFrame } from "@/components/brand/AuthFrame";
import { DesktopStudioGate } from "@/components/studio/DesktopStudioGate";
import { emailLinkFields } from "@/lib/email-link-flow";
import { safeNextPath } from "@/lib/site-url";

// A no-referrer document sends Origin: null for native form POSTs. Preserve the
// origin for CSRF validation while keeping the token-bearing path out of Referer.
export const metadata: Metadata = { title: "Enter your studio · Robyn", referrer: "strict-origin" };

export default async function ConfirmEmailPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const fields = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const link = emailLinkFields(fields);
  if (!link) redirect("/login?error=auth");
  const next = safeNextPath(fields.get("next"));

  return <DesktopStudioGate><AuthFrame>
    <Link href="/" className="mb-14 inline-flex items-center gap-2 text-xs">← Back to Robyn</Link>
    <span className="block text-[10px] tracking-widest">YOUR PRIVATE CREATIVE STUDIO</span>
    <h1 className="mt-4 text-4xl font-medium tracking-[-.06em]">Your studio is waiting.</h1>
    <p className="mb-9 mt-4 text-sm leading-6">Your desktop studio is one click away. No password to remember.</p>
    <form action="/auth/callback" method="post">
      <input type="hidden" name="token_hash" value={link.tokenHash} />
      <input type="hidden" name="type" value={link.type} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="flex w-full items-center justify-between bg-[#1b2a20] px-5 py-4 text-sm text-[#f3f1e8]">Enter your studio <ArrowRight size={19} /></button>
    </form>
    <p className="mt-8 text-xs leading-6">Only continue if you requested this link or received a studio invitation.</p>
    <Link href="/login" className="brand-accent mt-5 inline-block text-xs underline underline-offset-4">Request a fresh sign-in link</Link>
  </AuthFrame></DesktopStudioGate>;
}
