"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Monitor } from "lucide-react";
import { BrandWordmark } from "@/components/brand/BrandWordmark";

const desktopQuery = "(min-width: 1200px) and (hover: hover) and (pointer: fine)";

/** A presentation boundary. Authentication and ownership stay on the server. */
export function DesktopStudioGate({ children }: { children: ReactNode }) {
  const notice = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(desktopQuery);
    const update = () => {
      setSupported(media.matches);
      if (media.matches) {
        setOpened(true);
        notice.current?.close();
      } else if (!notice.current?.open) {
        notice.current?.showModal();
      }
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return <>
    <dialog ref={notice} className="desktop-required" aria-labelledby="desktop-required-title" aria-describedby="desktop-required-description" onCancel={event => event.preventDefault()}>
      <div className="desktop-required-content">
        <Link href="/" className="desktop-required-wordmark" aria-label="Robyn, home"><BrandWordmark /></Link>
        <img className="desktop-required-bird" src="/brand/robin-ascii.svg" alt="" width="600" height="540" />
        <span className="desktop-required-eyebrow"><Monitor size={16} aria-hidden="true" /> A LITTLE MORE ROOM TO CREATE</span>
        <h1 id="desktop-required-title">Open on<br /><em>desktop.</em></h1>
        <p id="desktop-required-description">Robyn’s creative studio currently works only on a desktop or laptop with a keyboard and mouse. Your ideas deserve room to spread their wings.</p>
        <p className="desktop-required-hint">Already on a computer? Widen this browser window to continue.</p>
        <Link className="desktop-required-link" href="/">Explore Robyn <ArrowUpRight size={20} /></Link>
        <span className="desktop-required-footnote">You can explore the studio and request an invitation on your phone.</span>
      </div>
    </dialog>
    {/* Never unmount an opened editor merely because its window became narrow. */}
    {opened && <div className="desktop-studio-content" inert={!supported} aria-hidden={!supported}>{children}</div>}
    <noscript><p className="desktop-required-noscript">Open Robyn on a desktop or laptop with JavaScript enabled. <a href="/">Explore Robyn</a></p></noscript>
  </>;
}
