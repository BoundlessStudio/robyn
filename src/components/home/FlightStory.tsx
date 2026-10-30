"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowDownRight, ArrowUpRight, Monitor } from "lucide-react";
import { AsciiRobin, type FlightState } from "./AsciiRobin";
import { InvitationForm } from "./InvitationForm";
import { craftTour, studioTour } from "./craft-tour";
import { CraftArtwork } from "./CraftArtwork";

const chapters = [{ id: "an-idea", label: "Meet Robyn" }, ...studioTour.map(app => ({ id: app.id, label: app.name })), { id: "invitation", label: "Your invitation" }];

export function FlightStory() {
  const storyRef = useRef<HTMLElement>(null);
  const flight = useRef<FlightState>({ progress: 0, pointer: 0, paused: false, reduced: false, craft: "intro", scene: 0 });
  const [chapter, setChapter] = useState(0);
  const [reduced, setReduced] = useState(false);
  const currentApp = studioTour[chapter - 1];

  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 900px)");
    const preference = () => { flight.current.reduced = media.matches; setReduced(media.matches); };
    preference(); media.addEventListener("change", preference);
    const panels = Array.from(story.querySelectorAll<HTMLElement>(".flight-chapter"));
    let raf = 0;
    const readScroll = () => {
      raf = 0;
      const rect = story.querySelector<HTMLElement>(".flight-panels")!.getBoundingClientRect();
      const readingLine = narrow.matches ? story.querySelector<HTMLElement>(".flight-sticky")!.getBoundingClientRect().bottom + 16 : 0;
      const offset = Math.max(0, readingLine - rect.top);
      const panelIndex = Math.max(0, panels.findLastIndex(panel => panel.offsetTop <= offset));
      const panel = panels[panelIndex];
      const scene = Math.min(chapters.length - 1, panelIndex + Math.min(1, (offset - panel.offsetTop) / panel.offsetHeight));
      const index = Math.round(scene);
      flight.current.progress = scene / (chapters.length - 1);
      flight.current.scene = scene;
      flight.current.craft = studioTour[index - 1]?.id ?? "intro";
      story.style.setProperty("--flight-progress", String(flight.current.progress));
      setChapter(index);
    };
    const queueRead = () => { if (!raf) raf = requestAnimationFrame(readScroll); };
    window.addEventListener("scroll", queueRead, { passive: true });
    window.addEventListener("resize", queueRead);
    readScroll();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", queueRead); window.removeEventListener("resize", queueRead); media.removeEventListener("change", preference); };
  }, []);

  return <section ref={storyRef} className={`flight-story ${reduced ? "flight-still" : ""}`} data-chapter={chapter} aria-label="A bird’s-eye tour of the creative studio" onPointerMove={event => {
    if (event.pointerType === "mouse") flight.current.pointer = (event.clientX / window.innerWidth - .5) * 2;
  }} onPointerLeave={() => { flight.current.pointer = 0; }}>
    <div className="flight-sticky">
      <div className="bird-stage">
        <div className="flight-grid" aria-hidden="true" />
        <div className="flight-ring ring-one" aria-hidden="true" /><div className="flight-ring ring-two" aria-hidden="true" />
        <AsciiRobin flight={flight} />
      </div>
      <div className="bird-caption" aria-hidden="true"><span className="bird-caption-number">{String(Math.min(chapter, studioTour.length)).padStart(2, "0")}</span><div><span>{currentApp ? `ROBYN × ${currentApp.name}` : chapter === 0 ? "YOUR IMAGINATION. ONE CREATIVE COLLABORATOR." : "A LITTLE ROOM FOR YOUR NEXT BIG IDEA."}</span><small>{currentApp ? currentApp.tagline : "One Robyn. Real creative tools. Your direction."}</small></div></div>
      <div className="flight-controls">
        <nav aria-label="Creative tools">{chapters.map((item, i) => <a key={item.id} href={`#${item.id}`} aria-label={`${String(i).padStart(2, "0")} ${item.label}`} aria-current={chapter === i ? "step" : undefined} title={item.label}><span>{i === chapters.length - 1 ? "↗" : String(i).padStart(2, "0")}</span></a>)}</nav>
        <label className="mobile-tour-select"><span>FOLLOW THE BIRD</span><select aria-label="Choose a studio chapter" value={chapters[chapter].id} onChange={event => {
          const target = document.getElementById(event.target.value);
          target?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" });
          window.history.replaceState(null, "", `#${event.target.value}`);
        }}>{chapters.map((item, i) => <option key={item.id} value={item.id}>{String(i).padStart(2, "0")} / {item.label}</option>)}</select></label>
        <span className="tour-progress">{chapters[chapter].label}</span>
      </div>
    </div>
    <svg className="craft-ink-filter" width="0" height="0" aria-hidden="true"><defs><filter id="craft-paper-ink" colorInterpolationFilters="sRGB"><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncR type="linear" slope=".808" intercept=".106" /><feFuncG type="linear" slope=".745" intercept=".165" /><feFuncB type="linear" slope=".737" intercept=".125" /></feComponentTransfer></filter></defs></svg>
    <div className="flight-panels">
      <section className="flight-chapter chapter-idea" id="an-idea" aria-labelledby="idea-heading">
        <div className="chapter-copy"><span className="flight-kicker">AN AI CREATIVE STUDIO WITH A MIND OF YOUR OWN.</span><h1 id="idea-heading">Ideas<br />have<br /><em>wings.</em><svg className="heading-star" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 0v40M0 20h40M6 6l28 28M6 34L34 6" /></svg></h1><p>One Robyn. {craftTour.length} real creative tools.<br />Research with Chrome and Brave Search.<br />A world of your making.</p><a className="flight-link" href={`#${studioTour[0].id}`}>Follow the bird <ArrowDownRight size={21} /></a><a className="hero-invite" href="#invitation">Request an invite <ArrowUpRight size={14} /></a><span className="desktop-note"><Monitor size={14} aria-hidden="true" /> A desktop studio. Explore it anywhere.</span></div>
        <span className="hero-marginal">ONE COLLABORATOR / EVERY CREATIVE TOOL</span>
      </section>
      {studioTour.map((app, i) => <section key={app.id} className="flight-chapter craft-chapter" id={app.id} aria-labelledby={`${app.id}-heading`}>
        <div className="chapter-copy">
          <span className="flight-kicker">{String(i + 1).padStart(2, "0")} / ROBYN <span>× {app.name}</span></span>
          <h2 id={`${app.id}-heading`}>{app.story.lines.join(" ")}<br /><em>{app.story.accent}</em></h2>
          <p>{app.story.copy}</p>
          <CraftArtwork appId={app.id} name={app.name} number={i + 1} nearby={Math.abs(i + 1 - chapter) <= 1} onInspect={open => { flight.current.paused = open; }} />
          <a className="flight-link craft-next" href={`#${studioTour[i + 1]?.id ?? "invitation"}`}>{studioTour[i + 1] ? `Next, ${studioTour[i + 1].name}` : "Make room for your imagination"}<ArrowDown size={16} /></a>
        </div>
      </section>)}
      <section className="flight-chapter chapter-invitation" id="invitation" aria-labelledby="invitation-heading"><div className="chapter-copy"><span className="flight-kicker">ROBYN BRINGS IT ALL TOGETHER.</span><h2 id="invitation-heading">Bring your<br /><em>strange ideas.</em></h2><InvitationForm /><p className="pilot-note">The private studio currently works only on desktop and laptop computers with a keyboard and mouse. Explore the tools and request your invitation on any device.</p></div></section>
    </div>
  </section>;
}
