"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Grip, Plus, RotateCcw } from "lucide-react";
import { studioApps } from "@/studio/apps/registry";
import { creativeDirector } from "@/studio/director";
import { Artwork, BloomImage, OrbitMark, Waveform } from "./Artwork";

const campaign = [
  { title: "The identity", app: "vectorcraft", kind: "vector", file: "offscript-identity", copy: "A looping mark with room to become something else. The visual thread that holds the whole campaign together.", dependencies: ["Creative direction"] },
  { title: "The image", app: "photocraft", kind: "image", file: "bloom-study.pcraft", copy: "A familiar flower, an unfamiliar possibility. A sculptural image that sets the mood for an entire creative world.", dependencies: ["Color palette", "Creative direction"] },
  { title: "The poster", app: "designcraft", kind: "layout", file: "creative-issue.designcraft", copy: "The image meets the identity. Expressive type and a confident composition turn the campaign into a piece worth keeping.", dependencies: ["Bloom image", "Identity artwork"] },
  { title: "The website", app: "figcraft", kind: "interface", file: "offscript-site.figcraft", copy: "A digital home for the idea. The same visual language becomes a welcoming, thoughtfully composed interface.", dependencies: ["Identity artwork", "Bloom image", "Manifesto copy"] },
  { title: "The film", app: "filmcraft", kind: "film", file: "offscript-film.fcproj", copy: "A new rhythm, the same world. Imagery, movement, and sound come together in an editable film timeline.", dependencies: ["Bloom image", "Motion study", "Soundtrack"] },
  { title: "The sound", app: "soundcraft", kind: "sound", file: "offscript-soundtrack", copy: "A little texture. A little tension. A soundscape imagined to give the campaign its own pulse.", dependencies: ["Creative direction", "Film timing"] },
  { title: "The story", app: "deckcraft", kind: "slides", file: "offscript-story.deckcraft", copy: "Bring the whole world into the room. An editable presentation connects the original thought with every expression of it.", dependencies: ["Identity artwork", "Campaign imagery", "Manifesto copy"] },
];

const steps = [
  { label: "The brief", title: "Start with a what if.", description: "Tell your Creative Director what you have in mind. A rough thought is a perfectly good beginning.", file: "A new creative direction", note: "“A campaign for people who see things a little differently.”" },
  { label: "The making", title: "Give it a whole team.", description: "Your Director brings in the right specialists. Each works in its own creative application, with your project as the shared reference.", file: "Photo Artist → PhotoCraft", note: "Create a layered image from the campaign’s direction and color palette." },
  { label: "The file", title: "Real work. Real files.", description: "The native master lands in your project library, together with its preview and linked assets. Every saved revision stays available.", file: "bloom-study.pcraft · Revision 1", note: "Editable layers · Linked media packaged · Original preserved" },
  { label: "Your turn", title: "Put your hand in it.", description: "Open the browser editor. Refine a detail, change the composition, or take it somewhere new. Save your own revision.", file: "bloom-study.pcraft · Revision 2", note: "Your edit: a tighter crop and a little more red." },
  { label: "Keep going", title: "Pick up where you left off.", description: "Ask your specialist to continue from your saved revision. The work moves forward with your decisions intact.", file: "bloom-study.pcraft · Revision 3", note: "Photo Artist continues from your exact saved revision." },
];

type Position = { x: number; y: number };

function DraggablePiece({ className, label, children, reset }: { className: string; label: string; children: ReactNode; reset: number }) {
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const drag = useRef<{ id: number; origin: Position; start: Position } | null>(null);
  useEffect(() => { setPosition({ x: 0, y: 0 }); }, [reset]);
  function constrain(x: number, y: number) { return { x: Math.max(-100, Math.min(100, x)), y: Math.max(-80, Math.min(80, y)) }; }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, origin: position, start: { x: event.clientX, y: event.clientY } };
    event.currentTarget.classList.add("is-dragging");
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    drag.current = null;
    event.currentTarget.classList.remove("is-dragging");
  }
  return <button type="button" className={`drag-piece ${className}`} aria-describedby="collage-help" style={{ "--drag-x": `${position.x}px`, "--drag-y": `${position.y}px` } as CSSProperties}
    onPointerDown={start} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
    onPointerMove={event => { const active = drag.current; if (active?.id === event.pointerId) setPosition(constrain(active.origin.x + event.clientX - active.start.x, active.origin.y + event.clientY - active.start.y)); }}
    onKeyDown={event => {
      const offsets: Record<string, Position> = { ArrowLeft: { x: -16, y: 0 }, ArrowRight: { x: 16, y: 0 }, ArrowUp: { x: 0, y: -16 }, ArrowDown: { x: 0, y: 16 } };
      if (event.key === "Escape" || event.key === "Home") { event.preventDefault(); setPosition({ x: 0, y: 0 }); }
      else if (offsets[event.key]) { event.preventDefault(); const offset = offsets[event.key]; setPosition(p => constrain(p.x + offset.x, p.y + offset.y)); }
    }}>
    <span className="sr-only">{label}. </span>{children}
  </button>;
}

function InvitationForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const data = new FormData(event.currentTarget);
    setStatus("sending"); setMessage("");
    try {
      const response = await fetch("/api/invite-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, craft: data.get("craft"), website: data.get("website"), consent: data.get("consent") === "on" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Your request could not be saved. Please try again.");
      setStatus("success"); setMessage("Your request is saved. We’ll email you when a place in the pilot is available.");
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "We couldn’t reach the studio. Please try again."); }
  }
  return <div className="invitation-form-wrap">
    {status === "success" ? <div className="invite-success" role="status"><span><Check size={30} /></span><h3>You’re on the list.</h3><p>{message}</p><button type="button" className="text-link" onClick={() => { setStatus("idle"); setEmail(""); setMessage(""); }}>Use another email <ArrowRight size={18} /></button></div> :
      <form className="invitation-form" onSubmit={submit}>
        <div className="form-heading"><span className="eyebrow">A LITTLE ROOM FOR BIG IDEAS</span><p>We’re inviting individual creators into the first Robyn studio. Leave your email to request a place.</p></div>
        <label htmlFor="invite-email">Your email</label>
        <input id="invite-email" type="email" name="email" placeholder="you@your-world.com" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="invite-craft">What do you love making? <span>(optional)</span></label>
        <input id="invite-craft" type="text" name="craft" placeholder="Films, identities, things that don’t exist yet…" maxLength={280} />
        <div className="form-trap" aria-hidden="true"><label htmlFor="invite-website">Website</label><input id="invite-website" name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
        <label className="consent-label"><input type="checkbox" name="consent" required /><span>Email me about my invitation. Read the <Link href="/privacy">privacy note</Link>.</span></label>
        <button type="submit" className="invite-submit" disabled={status === "sending"}>{status === "sending" ? "Saving your request…" : "Request an invite"}<ArrowUpRight size={23} aria-hidden="true" /></button>
        <p className={`form-message ${status === "error" ? "is-error" : ""}`} role={status === "error" ? "alert" : "status"}>{message || "A personal studio. Yours to make something with."}</p>
      </form>}
  </div>;
}

export function CreativeHomepage() {
  const root = useRef<HTMLElement>(null);
  const [reset, setReset] = useState(0);
  const [selectedArtifact, setSelectedArtifact] = useState(0);
  const [selectedEmployee, setSelectedEmployee] = useState(-1);
  const [selectedStep, setSelectedStep] = useState(0);
  const [motionPaused, setMotionPaused] = useState(false);
  const artifact = campaign[selectedArtifact];
  const campaignApp = studioApps.find(app => app.id === artifact.app)!;
  const employee = selectedEmployee < 0 ? creativeDirector : studioApps[selectedEmployee];
  const role = "employee" in employee ? employee.employee.role : employee.role;
  const step = steps[selectedStep];

  useEffect(() => {
    const element = root.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    element.classList.add("motion-ready");
    const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }, { threshold: .08 });
    element.querySelectorAll(".reveal").forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return <main ref={root} className={`creative-home ${motionPaused ? "motion-paused" : ""}`}>
    <a href="#main-statement" className="skip-link">Skip to content</a>
    <header className="home-nav">
      <Link href="/" className="robyn-wordmark" aria-label="Robyn, home">robyn<span className="brand-asterisk">✳</span></Link>
      <nav aria-label="Main navigation"><a href="#studio">The possibilities</a><a href="#team">Your team</a><a href="#process">The process</a></nav>
      <Link className="sign-in" href="/login">Enter the studio <ArrowUpRight size={17} /></Link>
    </header>

    <section className="home-hero" aria-labelledby="main-statement" onPointerMove={event => {
      if (event.pointerType !== "mouse" || motionPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty("--depth-x", `${(event.clientX - rect.left - rect.width / 2) * .008}px`);
      event.currentTarget.style.setProperty("--depth-y", `${(event.clientY - rect.top - rect.height / 2) * .008}px`);
    }} onPointerLeave={event => { event.currentTarget.style.setProperty("--depth-x", "0px"); event.currentTarget.style.setProperty("--depth-y", "0px"); }}>
      <div className="hero-topline"><span className="eyebrow"><i className="status-dot" /> YOUR PERSONAL AI CREATIVE STUDIO</span><span className="edition-label">AN OPEN INVITATION TO IMAGINE / 001</span></div>
      <h1 id="main-statement"><span>Make something</span><span>only you could</span><em>imagine.</em><svg className="imagine-underline" viewBox="0 0 580 50" fill="none" aria-hidden="true"><path d="M8 32C125 5 369 8 561 24M62 44C214 16 420 22 576 39" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></h1>
      <div className="hero-collage" aria-label="An interactive composition of original creative studies">
        <span className="collage-coordinate">FIG. 01 — A LITTLE POSSIBILITY</span>
        <DraggablePiece className="hero-photo" label="Move the flower art print" reset={reset}><div className="print-mat"><BloomImage priority /><span>OFFSCRIPT — STILL LIFE, REIMAGINED <b>01</b></span></div></DraggablePiece>
        <DraggablePiece className="hero-poster" label="Move the Offscript typographic poster" reset={reset}><div className="hero-poster-inner"><span>A STUDY IN<br />DOING YOUR OWN THING.</span><b>OFF<br /><em>script.</em></b><OrbitMark /><small>NO STRAIGHT LINES REQUIRED. ↗</small></div></DraggablePiece>
        <div className="hero-sound" aria-hidden="true"><span>MAKE A LITTLE NOISE.</span><Waveform /><small>OFFSCRIPT RADIO / 001</small></div>
        <span className="collage-sticker" aria-hidden="true">a good idea<br /><em>starts here ↗</em></span>
      </div>
      <div className="hero-bottom"><div className="hero-intro"><p>Your imagination. An entire creative team.<br />AI specialists, real creative software, and work<br className="desktop-break" /> you can keep making your own.</p><div className="hero-actions"><a href="#invitation" className="round-cta">Request an invite <span><ArrowUpRight size={22} /></span></a><a href="#studio" className="explore-link">Explore the studio <ArrowDown size={16} /></a></div></div><div className="collage-controls"><span id="collage-help"><Grip size={14} /> Make yourself at home. Move things around.<span className="sr-only">Use arrow keys to move a focused art print. Press Escape or Home to reset it.</span></span><button type="button" onClick={() => setReset(r => r + 1)} aria-label="Reset artwork positions"><RotateCcw size={15} /></button></div></div>
      <div className="hero-index"><span>IDEAS DON’T WORK IN STRAIGHT LINES.</span><span>NEITHER DO WE. <ArrowDown size={13} /></span></div>
    </section>

    <div className="creative-ticker" aria-hidden="true"><div><span>A little more curiosity</span><OrbitMark /><span>A lot more possibility</span><OrbitMark /><span>A little more curiosity</span><OrbitMark /><span>A lot more possibility</span><OrbitMark /></div></div>

    <section className="campaign-section section-space" id="studio" aria-labelledby="campaign-title">
      <div className="section-topline reveal"><span className="eyebrow">01 / THE POSSIBILITIES</span><span className="small-note">One brief. A whole creative world.</span></div>
      <div className="campaign-heading reveal"><h2 id="campaign-title">An idea never<br />has to be <em>just one thing.</em></h2><p>Follow a thought across images, identity, motion, sound, and more. Your specialists share the same creative direction. You decide where it goes.</p></div>
      <div className="campaign-stage reveal">
        <div className="campaign-art" key={artifact.kind}><Artwork kind={artifact.kind} /><span className="campaign-art-index">{String(selectedArtifact + 1).padStart(2, "0")} / 07</span></div>
        <div className="campaign-side"><div className="campaign-project"><span className="eyebrow">AN ILLUSTRATIVE CAMPAIGN</span><h3>OFFSCRIPT<span>®</span></h3><p>For people who see things<br />a little differently.</p></div><div className="campaign-detail" aria-live="polite"><span className="eyebrow">{artifact.title}</span><p>{artifact.copy}</p><div className="made-by"><span style={{ background: campaignApp.color }}>{campaignApp.monogram}</span><div><b>{campaignApp.employee.role}</b><small>{campaignApp.name}</small></div></div><span className="dependency-label">BUILDS ON</span><div className="dependency-list">{artifact.dependencies.map(dep => <span key={dep}>{dep}</span>)}</div></div><span className="case-note">Concept artwork, showing how a connected project can take shape.</span></div>
      </div>
      <div className="campaign-tabs" aria-label="Explore campaign artifacts">{campaign.map((item, i) => <button key={item.kind} type="button" aria-pressed={selectedArtifact === i} onClick={() => setSelectedArtifact(i)}><span>{String(i + 1).padStart(2, "0")}</span>{item.title}<ArrowUpRight size={16} /></button>)}</div>
    </section>

    <section className="team-section section-space" id="team" aria-labelledby="team-title">
      <div className="section-topline reveal"><span className="eyebrow">02 / YOUR CREATIVE COMPANY</span><span className="small-note">A Director. {studioApps.length} specialists. Your vision.</span></div>
      <div className="team-heading reveal"><h2 id="team-title">Big studio energy.<br /><em>Entirely yours.</em></h2><div><p>A team with different obsessions.<br />All working toward your next idea.</p><span className="team-browse-note">MEET YOUR PEOPLE <ArrowDown size={15} /></span></div></div>
      <div className="team-layout reveal"><div className="team-roster" aria-label="Creative employee roster">
        <button type="button" className={`employee-row director-row ${selectedEmployee === -1 ? "selected" : ""}`} onClick={() => setSelectedEmployee(-1)} aria-pressed={selectedEmployee === -1}><span className="employee-number">00</span><span className="employee-role">Creative Director</span><span className="employee-app">THE BIG PICTURE</span><ArrowUpRight size={18} /></button>
        {studioApps.map((app, i) => <button key={app.id} type="button" className={`employee-row ${selectedEmployee === i ? "selected" : ""}`} onClick={() => setSelectedEmployee(i)} aria-pressed={selectedEmployee === i}><span className="employee-number">{String(i + 1).padStart(2, "0")}</span><span className="employee-role">{app.employee.role}</span><span className="employee-app">{app.name}</span><ArrowUpRight size={18} /></button>)}
      </div><div className="employee-feature" style={{ "--employee-color": employee.color } as CSSProperties}><div className="employee-art" key={employee.id}>{selectedEmployee < 0 ? <div className="director-art"><div className="director-orbits"><OrbitMark /></div><span className="director-art-copy">See the<br /><em>whole picture.</em></span><span className="artwork-footnote">MANY TALENTS. ONE CREATIVE DIRECTION.</span></div> : <Artwork kind={studioApps[selectedEmployee].artwork} compact />}</div><div className="employee-feature-copy" aria-live="polite"><span className="eyebrow">{selectedEmployee < 0 ? "YOUR CREATIVE NORTH STAR" : studioApps[selectedEmployee].name.toUpperCase()}</span><h3>{role}</h3><p>{employee.tagline}</p><span className="employee-description">{selectedEmployee < 0 ? "Turns your brief into a plan, brings in the right specialists, and keeps every part of the project moving in the same direction." : `A dedicated ${role.toLowerCase()} with its own ${studioApps[selectedEmployee].name} workspace, focused on its craft and connected to your project.`}</span><div className="employee-feature-bottom"><span>ONE SHARED PROJECT. DISTINCT CREATIVE MINDS.</span><button type="button" aria-label="Meet the next employee" onClick={() => setSelectedEmployee(i => i === studioApps.length - 1 ? -1 : i + 1)}><ArrowRight size={22} /></button></div></div></div></div>
    </section>

    <section className="process-section section-space" id="process" aria-labelledby="process-title">
      <div className="section-topline reveal"><span className="eyebrow">03 / THE WAY WE MAKE</span><span className="small-note">A conversation that becomes a creation.</span></div>
      <div className="process-heading reveal"><h2 id="process-title">Made with AI.<br /><em>Still unmistakably you.</em></h2><p>You can step into the work at any point.<br />Real applications. Editable originals.<br />A new revision every time you save.</p></div>
      <div className="process-demo reveal"><div className="process-story"><span className="eyebrow">AN ILLUSTRATED WORKFLOW</span><div className="process-step-copy" key={selectedStep} aria-live="polite"><span className="step-number">0{selectedStep + 1}<span> / 05</span></span><h3>{step.title}</h3><p>{step.description}</p></div><div className="step-arrows"><button type="button" aria-label="Previous workflow step" onClick={() => setSelectedStep(i => (i + steps.length - 1) % steps.length)}><ChevronLeft size={20} /></button><button type="button" aria-label="Next workflow step" onClick={() => setSelectedStep(i => (i + 1) % steps.length)}><ChevronRight size={20} /></button></div></div><div className="process-workspace"><div className="demo-windowbar"><span className="demo-dots"><i /><i /><i /></span><span>OFFSCRIPT / CREATIVE PROJECT</span><span>ILLUSTRATIVE</span></div><div className="demo-canvas"><div className="demo-asset-rail"><span>PROJECT FILES</span><div className="demo-file selected"><span className="tiny-thumbnail"><BloomImage /></span><span>bloom-study<br /><small>PhotoCraft</small></span></div><div className="demo-file"><OrbitMark /><span>identity<br /><small>VectorCraft</small></span></div><div className="demo-file"><Waveform /><span>soundtrack<br /><small>SoundCraft</small></span></div><div className="demo-rail-bottom"><Plus size={14} /> SHARED LIBRARY</div></div><div className={`demo-image step-${selectedStep}`}><BloomImage />{selectedStep === 3 && <div className="demo-crop" aria-hidden="true"><i /><i /><i /><i /></div>}{selectedStep === 0 && <div className="brief-note"><span>THE BRIEF ↗</span>A campaign for people<br />who see things a<br /><em>little differently.</em></div>}</div></div><div className="demo-status" aria-live="polite"><span><i className="status-dot" />{step.file}</span><p>{step.note}</p></div><div className="revision-strip"><span>THE SAVED REVISION HANDOFF</span>{["AI / v1", "YOU / v2", "AI / v3"].map((revision, i) => <span className={selectedStep >= i + 2 ? "active" : ""} key={revision}>{revision}{i < 2 && <ArrowRight size={12} />}</span>)}</div></div></div>
      <div className="process-steps" aria-label="Explore the creative workflow">{steps.map((s, i) => <button key={s.label} type="button" aria-pressed={selectedStep === i} onClick={() => setSelectedStep(i)}><span>0{i + 1}</span>{s.label}<ArrowRight size={16} /></button>)}</div>
      <p className="process-caption">Your saved work is the meeting point. Each handoff starts from an exact revision, so your creative decisions stay part of the work.</p>
    </section>

    <section className="invitation-section section-space" id="invitation" aria-labelledby="invitation-title"><div className="section-topline reveal"><span className="eyebrow">04 / YOUR NEXT CHAPTER</span><span className="small-note">A small pilot. An open imagination.</span></div><div className="invitation-layout reveal"><div className="invitation-heading"><span className="invite-handwritten">you bring the what if.</span><h2 id="invitation-title">Let’s make<br /><em>something.</em></h2><OrbitMark className="invitation-orbit" /><p>Something curious. Something unexpected.<br />Something only you could imagine.</p></div><InvitationForm /></div><footer className="home-footer"><Link className="robyn-wordmark" href="/" aria-label="Back to Robyn home">robyn<span className="brand-asterisk">✳</span></Link><span>ONE IMAGINATION. AN ENTIRE STUDIO.</span><div><button type="button" onClick={() => setMotionPaused(p => !p)} aria-pressed={motionPaused}>{motionPaused ? "Resume motion" : "Pause motion"}</button><Link href="/privacy">Privacy</Link><Link href="/login">Sign in <ArrowUpRight size={13} /></Link></div></footer></section>
  </main>;
}
