import { BookOpen, Bot, Brain, Code2, Compass, FlaskConical, Heart, Leaf, Music2, Rocket, Shield, Sparkles } from "lucide-react";
import { isAgentIcon } from "@/lib/agent-profile-input";
import { cn } from "@/lib/utils";

const ICONS = { bot: Bot, brain: Brain, sparkles: Sparkles, book: BookOpen, code: Code2, flask: FlaskConical, leaf: Leaf, compass: Compass, heart: Heart, shield: Shield, rocket: Rocket, music: Music2 };

export function AgentIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const id = isAgentIcon(icon) ? icon : "bot";
  const Icon = ICONS[id];
  return <span data-agent-icon={id} aria-hidden="true" className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground", className)}><Icon className="h-[60%] w-[60%]" /></span>;
}
