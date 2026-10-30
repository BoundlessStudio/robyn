import Link from "next/link";
import { Globe } from "lucide-react";
export function ResearchBrowserButton({projectId}:{projectId:string}){return <Link className="studio-button" href={`/dashboard/projects/${projectId}/research`}><Globe size={15} aria-hidden="true"/>Robyn’s browser ↗</Link>;}
