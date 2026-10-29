import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = { title: "Beta administration · Robyn", robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="beta-admin">{children}</div>;
}
