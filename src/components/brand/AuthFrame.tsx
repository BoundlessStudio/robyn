import Link from "next/link";
import type { ReactNode } from "react";
import { BrandWordmark } from "./BrandWordmark";

export function AuthFrame({ children }: { children: ReactNode }) {
  return <main className="brand-auth">
    <section className="brand-auth-story" aria-label="Robyn Creative Studio">
      <Link href="/" aria-label="Robyn, home"><BrandWordmark /></Link>
      <div className="brand-auth-bird" aria-hidden="true">
        {/* A still from the same original sculpture used on the homepage. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/robin-ascii.svg" alt="" width="600" height="540" />
      </div>
      <p className="brand-auth-thought">A little space.<br /><em>Endless possibility.</em></p>
      <span className="brand-auth-edition">ONE IMAGINATION. AN ENTIRE STUDIO.</span>
    </section>
    <section className="brand-auth-content"><div className="brand-auth-form">
      <Link className="brand-auth-home" href="/" aria-label="Robyn, home"><BrandWordmark /></Link>
      {children}
    </div></section>
  </main>;
}
