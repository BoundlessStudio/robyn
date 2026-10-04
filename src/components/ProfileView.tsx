"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import type { UserProfile } from "@/lib/types";
import { MAX_DISPLAY_NAME_LENGTH, MAX_PHONE_NUMBER_LENGTH, validateUserProfilePatch } from "@/lib/user-profile";

export function ProfileView() {
  const { profile, setProfile } = useWorkspace();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [phoneNumber, setPhoneNumber] = useState(profile.phone_number ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = displayName.trim() !== profile.display_name || (phoneNumber.trim() || null) !== profile.phone_number;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !changed) return;
    setError(null);
    setBusy(true);
    try {
      const patch = validateUserProfilePatch({ display_name: displayName, phone_number: phoneNumber });
      const { profile: saved } = await apiFetch<{ profile: UserProfile }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setProfile(saved);
      setDisplayName(saved.display_name);
      setPhoneNumber(saved.phone_number ?? "");
      toast.success("Profile saved");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-sm text-muted-foreground">Manage your name and contact details across your workspaces.</p>
      </div>
      <form onSubmit={save} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email address <span className="font-normal text-muted-foreground">(read-only)</span></Label>
          <Input id="profile-email" type="email" value={profile.email} readOnly aria-readonly="true"
            className="bg-muted text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-display-name">Display name</Label>
          <Input id="profile-display-name" autoComplete="name" value={displayName}
            onChange={(event) => setDisplayName(event.target.value)} required maxLength={MAX_DISPLAY_NAME_LENGTH} disabled={busy} />
          <p className="text-sm text-muted-foreground">Defaults to your email address until you choose a name.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-phone">Phone number <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="profile-phone" type="tel" autoComplete="tel" value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+1 416 555 0123"
            maxLength={MAX_PHONE_NUMBER_LENGTH} disabled={busy} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || !displayName.trim() || !changed}>
          {busy ? "Saving..." : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
