export interface Shape {
  label: string;
  cpu: number;
  memory: number;
  diskMin: number;
  diskMax: number;
}

export const SHAPE_PRESETS: Shape[] = [
  { label: "Standard · 2 vCPU / 4 GB", cpu: 2, memory: 4, diskMin: 2, diskMax: 12 },
  { label: "Pro · 4 vCPU / 8 GB", cpu: 4, memory: 8, diskMin: 2, diskMax: 20 },
  { label: "Max · 8 vCPU / 16 GB", cpu: 8, memory: 16, diskMin: 2, diskMax: 40 },
  { label: "Ultra · 16 vCPU / 32 GB", cpu: 16, memory: 32, diskMin: 2, diskMax: 80 },
];

export const DEFAULT_AGENT = {
  template: "agent37-hermes",
  cpu: 2,
  memory: 4,
  disk: 6,
  monthlyCapUsd: 5,
} as const;

export interface AgentTypeOption {
  id: string;
  template: string;
  label: string;
  description: string;
  recommended?: boolean;
}

// The agent types offered on the create screen. This is the curated catalog —
// branded cards, in your control. Hermes runs on Agent37's stock image, so this
// app needs no Docker at all. To offer your OWN image, build and register it as a
// workspace template (https://github.com/agent37-platform/custom-agent-image), then
// add an entry here whose `template` is that template's name.
export const AGENT_TYPES: AgentTypeOption[] = [
  {
    id: "hermes",
    template: "agent37-hermes",
    label: "Hermes",
    description: "General agent: chat, browsing, code, files.",
    recommended: true,
  },
];

export const AGENT_TEMPLATES = AGENT_TYPES.map((a) => a.template);

// Labels for the "open in new tab" buttons; any port not listed here falls back
// to "Port {n}".
export const PORT_LABELS: Record<number, string> = {
  9119: "Dashboard",
  7681: "Terminal",
  8080: "Files",
  18789: "OpenClaw",
};

// The web-app ports each stock image serves (docs/agents-api/urls). The API no
// longer reports per-instance ports — every port is reachable at a preview URL,
// nothing is declared — so the openable set is derived from the template. Custom
// images build on the Hermes base, so unknown templates get the Hermes set.
const HERMES_APP_PORTS = [9119, 7681, 8080];
const OPENCLAW_APP_PORTS = [18789, 7681, 8080];
export function templateAppPorts(template?: string | null): number[] {
  return template === "agent37-openclaw" ? OPENCLAW_APP_PORTS : HERMES_APP_PORTS;
}
