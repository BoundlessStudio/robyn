"use client";

import { useRouter } from "next/navigation";
import { ProfileDialog } from "@/components/ProfileDialog";
import { useWorkspace } from "@/components/WorkspaceProvider";

// Retain old /profile bookmarks; normal profile editing opens over the current page.
export function ProfileView() {
  const router = useRouter();
  const { setProfile } = useWorkspace();
  return <ProfileDialog onClose={() => router.replace("/dashboard")} onSaved={setProfile} />;
}
