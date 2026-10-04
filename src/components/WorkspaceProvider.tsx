"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { UserProfile, WorkspaceWithRole } from "@/lib/types";
import { apiFetch } from "@/lib/api";

const STORAGE_KEY = "agent37wl_workspace";

interface WorkspaceContextValue {
  userId: string;
  workspaces: WorkspaceWithRole[];
  current: WorkspaceWithRole | null;
  setCurrentId: (id: string) => void;
  refresh: () => Promise<WorkspaceWithRole[]>;
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
  ready: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  initialWorkspaces,
  initialProfile,
  userId,
  children,
}: {
  initialWorkspaces: WorkspaceWithRole[];
  initialProfile: UserProfile;
  userId: string;
  children: React.ReactNode;
}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>(initialWorkspaces);
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [currentId, setCurrentIdState] = useState<string | null>(initialWorkspaces[0]?.id ?? null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && workspaces.some((w) => w.id === stored)) setCurrentIdState(stored);
    } catch { /* Use the first authorized workspace when browser storage is unavailable. */ }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCurrentId = useCallback((id: string) => {
    setCurrentIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const refresh = useCallback(async () => {
    const { workspaces: ws } = await apiFetch<{ workspaces: WorkspaceWithRole[] }>("/api/workspaces");
    setWorkspaces(ws);
    setCurrentIdState((prev) => (prev && ws.some((w) => w.id === prev) ? prev : ws[0]?.id ?? null));
    return ws;
  }, []);

  const current = useMemo(
    () => workspaces.find((w) => w.id === currentId) ?? null,
    [workspaces, currentId]
  );

  return (
    <WorkspaceContext.Provider value={{ userId, workspaces, current, setCurrentId, refresh, profile, setProfile, ready }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
