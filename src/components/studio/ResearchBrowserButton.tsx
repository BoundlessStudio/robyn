import Link from "next/link";
import { research } from "@/studio/specialists/research";
import { AppIcon } from "./AppIcon";
export function ResearchBrowserButton(){return <Link className="studio-button" href="/dashboard/research"><AppIcon app={research} className="research-button-icon"/>Research’s browser ↗</Link>;}
