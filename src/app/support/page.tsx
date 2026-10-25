import Link from "next/link";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { SUPPORT_EMAIL } from "@/config/support";

export const metadata = { title: "Support — Robyn Creative Studio", alternates: { canonical: "/support" } };
export default function SupportPage() {
  return <main className="min-h-screen bg-[#e9e8dc] px-6 py-16 text-[#1b2a20]"><article className="mx-auto max-w-2xl">
    <Link href="/" aria-label="Robyn, home"><BrandWordmark/></Link>
    <h1 className="mt-14 text-4xl font-medium tracking-tight">Help with your studio.</h1>
    <div className="mt-8 space-y-6 text-sm leading-7">
      <p>For pilot access, account recovery, saved work or an uncertain AI charge, email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Support is handled by the pilot operator; there is no guaranteed response time.</p>
      <h2 className="text-xl font-medium">Recover work</h2><p>Include your account email, the project name, what happened, and the job reference shown in Media or Studio health. Keep an editor with unsaved changes open. Retry or reconnect the existing request when its outcome is uncertain. Starting a new request may create separate paid work. Never send passwords, sign-in links, API keys or connected-account tokens.</p>
      <h2 className="text-xl font-medium">Get your files and records</h2><p>Open an asset’s Files panel to download its native master, exports and linked dependencies from the exact saved revision. Keep the relative folder layout when reopening a package. You can request a studio export of your project metadata, revision references, research notebooks and allowance/charge records by email. Support verifies ownership before providing a private export.</p>
      <h2 className="text-xl font-medium">Account access and removal</h2><p>Use the sign-in email link for your invited address. If that inbox is unavailable, contact support; account transfer requires an ownership check. To remove an invitation request or close your studio, email the request from your invited address. Closure is handled by the operator during the pilot, including export, connected-account disconnection and resolution of active work. Workspace deletion is not available inside the app.</p>
      <h2 className="text-xl font-medium">Allowance and charges</h2><p>The Studio AI budget is an allowance limit, not a subscription or a withdrawable cash balance. Pending payments keep their reservation until the actual outcome is known. Contact support to reconcile a disputed charge or discuss any provider credit; a refund is not automatic.</p>
      <h2 className="text-xl font-medium">Supported setup</h2><p>The pilot’s tested baseline is Chromium on a desktop or laptop with a keyboard, fine pointer, hover, and a window at least 1200 CSS pixels wide. Chrome and Edge are the intended browsers; Safari, Firefox and other graphics configurations remain unverified. The public homepage supports small screens; native studio editors require desktop. Narrowing an already-open editor preserves its session.</p>
      <p>For new uploads, a file can be up to 512 MiB and a revision package up to 1 GiB. Acquired media is limited to 256 MiB and ten minutes, with workstation space checked before processing. Saved work remains private. <Link className="underline" href="/privacy">Read how studio data is handled.</Link></p>
    </div>
  </article></main>;
}
