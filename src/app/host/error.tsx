"use client";
import { Button } from "@/components/ui/button";

export default function HostError({ reset }: { reset: () => void }) {
  return <div className="space-y-4 p-6"><h1 className="text-xl font-semibold">Host is unavailable</h1>
    <p className="text-sm text-muted-foreground" role="alert">Host data or permissions could not be loaded. Please retry.</p>
    <Button variant="outline" onClick={reset}>Retry</Button></div>;
}
