import { StudioShell } from "@/components/studio/StudioShell";

// The fleet routes share the Studio shell. The per-agent workspace has its own layout.
export default function FleetLayout({ children }: { children: React.ReactNode }) {
  return <StudioShell>{children}</StudioShell>;
}
