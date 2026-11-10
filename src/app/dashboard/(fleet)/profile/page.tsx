import type { Metadata } from "next";
import { mailcraftBrowserBundle } from "@/studio/mailcraft-browser";
import { StudioProfile } from "@/components/studio/StudioProfile";

export const metadata: Metadata = { title: "Profile · Robyn", referrer: "no-referrer" };

export default function Page() {
  return <StudioProfile mailcraftBundle={mailcraftBrowserBundle()} />;
}
