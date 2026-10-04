"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { UserProfile } from "@/lib/types";
import { MAX_DISPLAY_NAME_LENGTH, MAX_PHONE_NUMBER_LENGTH, validateUserProfilePatch } from "@/lib/user-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Mounted on demand by both the account menu and the workspace Members page.
export function ProfileDialog({ endpoint = "/api/profile", title = "Your profile", onClose, onSaved, onReturnFocus }: {
  endpoint?: string; title?: string; onClose: () => void; onSaved: (profile: UserProfile) => void; onReturnFocus?: () => void;
}) {
  const fieldId = useId();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const changed = profile && (displayName.trim() !== profile.display_name || (phoneNumber.trim() || null) !== profile.phone_number);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(null); setProfile(null);
    apiFetch<{ profile: UserProfile }>(endpoint)
      .then(({ profile: next }) => {
        if (cancelled) return;
        setProfile(next); setDisplayName(next.display_name); setPhoneNumber(next.phone_number ?? "");
      })
      .catch((error) => { if (!cancelled) setLoadError((error as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint, reload]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !profile || !changed) return;
    setSaveError(null);
    try {
      // Send only changed fields so an untouched contact detail cannot overwrite a newer value.
      const patch = validateUserProfilePatch({
        ...(displayName.trim() !== profile.display_name ? { display_name: displayName } : {}),
        ...((phoneNumber.trim() || null) !== profile.phone_number ? { phone_number: phoneNumber } : {}),
      });
      inFlight.current = true; setBusy(true);
      const { profile: saved } = await apiFetch<{ profile: UserProfile }>(endpoint, { method: "PATCH", body: JSON.stringify(patch) });
      onSaved(saved); toast.success("Profile saved"); onClose();
    } catch (error) { setSaveError((error as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !inFlight.current) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={onReturnFocus ? (event) => { event.preventDefault(); onReturnFocus(); } : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Manage the name and contact details used across workspaces.</DialogDescription>
        </DialogHeader>
        {loading ? <p role="status" className="text-sm text-muted-foreground">Loading profile…</p> : loadError ? (
          <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>Retry profile</Button></div>
        ) : profile && (
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-email`}>Email address <span className="font-normal text-muted-foreground">(read-only)</span></Label>
              <Input id={`${fieldId}-email`} type="email" value={profile.email} readOnly aria-readonly="true" className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-name`}>Display name</Label>
              <Input id={`${fieldId}-name`} autoFocus autoComplete="name" value={displayName} required maxLength={MAX_DISPLAY_NAME_LENGTH}
                disabled={busy} onChange={(event) => setDisplayName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-phone`}>Phone number <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id={`${fieldId}-phone`} type="tel" autoComplete="tel" value={phoneNumber} placeholder="+1 416 555 0123"
                maxLength={MAX_PHONE_NUMBER_LENGTH} disabled={busy} onChange={(event) => setPhoneNumber(event.target.value)} />
            </div>
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy || !displayName.trim() || !changed}>{busy ? "Saving…" : "Save changes"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
