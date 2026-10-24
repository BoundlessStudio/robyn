import mark from "@/config/robin-mark.json";

/** A right-facing companion to the homepage's left-facing ASCII robin. */
export function RobinMark({ className = "" }: { className?: string }) {
  return <svg className={`robin-mark ${className}`} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <g transform="translate(64 0) scale(-1 1)">
    <path d={mark.feet} stroke="var(--robin-legs, #1b2a20)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d={mark.body} fill="var(--robin-body, #1b2a20)" />
    <path d={mark.breast} fill={mark.rust} />
    <path d={mark.feather} fill="var(--robin-wing, #7c846c)" />
    <circle cx="21" cy="18" r="2.4" fill={mark.paper} />
    <circle cx="21.5" cy="18" r="1.1" fill={mark.ink} />
    </g>
  </svg>;
}
