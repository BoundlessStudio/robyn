import Image from "next/image";

export function OrbitMark({ className = "", petals = 12 }: { className?: string; petals?: number }) {
  return (
    <svg className={className} viewBox="0 0 200 200" fill="none" aria-hidden="true">
      {Array.from({ length: petals }, (_, i) => <ellipse key={i} cx="100" cy="100" rx="27" ry="91" stroke="currentColor" strokeWidth="2" transform={`rotate(${i * 180 / petals} 100 100)`} />)}
      <circle cx="100" cy="100" r="8" fill="currentColor" />
    </svg>
  );
}

export function BloomImage({ priority = false, className = "" }: { priority?: boolean; className?: string }) {
  return <Image className={className} src="/artwork/offscript-bloom.png" alt="A sculptural red calla lily with a looping stem in a cobalt blue vase, with a chrome sphere on warm paper." width={1122} height={1402} sizes="(max-width: 600px) 80vw, (max-width: 1000px) 55vw, 40vw" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} quality={85} />;
}

export function Waveform({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 640 160" aria-hidden="true">
    {Array.from({ length: 96 }, (_, i) => {
      const h = 8 + Math.abs(Math.sin(i * .67) * Math.cos(i * .13) * Math.sin(i * .037 + .4)) * 132;
      return <rect key={i} x={(i * 6.7).toFixed(3)} y={(80 - h / 2).toFixed(3)} width="3.1" height={h.toFixed(3)} rx="1.5" fill="currentColor" />;
    })}
  </svg>;
}

export function TechnicalDrawing() {
  return <svg viewBox="0 0 500 380" className="technical-drawing" aria-hidden="true">
    <defs><pattern id="technical-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth=".5" /></pattern></defs>
    <rect width="500" height="380" fill="url(#technical-grid)" />
    <g fill="none" stroke="currentColor" strokeWidth="1.2">
      {Array.from({ length: 13 }, (_, i) => <ellipse key={i} cx={(250 + Math.sin(i * .4) * 24).toFixed(3)} cy={80 + i * 18} rx={(45 + Math.sin(i * .5) * 23).toFixed(3)} ry="17" />)}
      <path d="M205 80C190 120 213 205 183 296M295 80C331 120 307 205 275 296M185 325H300M185 316V334M300 316V334M350 80V296M341 80H359M341 296H359" />
      <path d="M140 296H360M204 80H360M250 46V340" strokeDasharray="4 5" strokeOpacity=".4" />
      <circle cx="250" cy="80" r="4" /><path d="M100 143H165L210 176" />
    </g>
    <g fill="currentColor" fontSize="10" fontFamily="monospace"><text x="221" y="345">Ø 120 mm</text><text x="365" y="192">240</text><text x="82" y="133">FORM / 01</text><text x="28" y="354">OFFSCRIPT — OBJECT STUDY</text></g>
  </svg>;
}

export function Artwork({ kind, compact = false }: { kind: string; compact?: boolean }) {
  if (kind === "image" || kind === "photo") return <div className={`artwork artwork-image ${kind === "photo" ? "contact-sheet" : ""}`}><BloomImage /><span className="artwork-overline">OFFSCRIPT / IMAGE STUDY 001</span>{kind === "photo" && <div className="contact-marks" aria-hidden="true"><i /><i /><i /></div>}</div>;
  if (kind === "cad") return <div className="artwork artwork-cad"><TechnicalDrawing /><span className="artwork-footnote">An idea, precisely considered.</span></div>;
  if (kind === "sound") return <div className="artwork artwork-sound"><span className="artwork-overline">OFFSCRIPT RADIO / VOL. 01</span><span className="sound-headline">FEEL<br /><em>everything.</em></span><Waveform /><div className="sound-caption"><span>STEREO / 48 kHz</span><span>VISUAL SOUND STUDY</span></div></div>;
  if (kind === "film") return <div className="artwork artwork-film"><div className="film-sprockets" /><div className="film-frames"><BloomImage /><BloomImage /><BloomImage /></div><div className="film-sprockets" /><div className="film-caption"><span>OFFSCRIPT / A FILM IN THE MAKING</span><span>01:24:08</span></div></div>;
  if (kind === "motion") return <div className="artwork artwork-motion"><span className="artwork-overline">A STUDY IN MOVEMENT</span><div className="moving-type" aria-hidden="true"><span>OFF</span><span>SCRIPT</span><span>OFF</span></div><OrbitMark className="motion-orbit" /><span className="artwork-footnote">Stay a little unpredictable.</span></div>;
  if (kind === "interface") return <div className="artwork artwork-interface"><div className="mini-site"><div className="mini-nav"><b>offscript®</b><span>Explore ↗</span></div><div className="mini-site-copy">GROW<br /><em>your own</em><br />WAY.</div><BloomImage /><div className="mini-site-footer">A SPACE FOR THE UNEXPECTED.<span>01—26</span></div></div></div>;
  if (kind === "writing" || kind === "document") return <div className="artwork artwork-document"><div className="editorial-page"><span className="page-kicker">OFFSCRIPT / THE MANIFESTO</span><h4>Permission<br />to <em>make a mess.</em></h4><div className="document-columns"><p>Some ideas arrive fully formed. The interesting ones usually don’t. They start with a feeling. A shape. A question you can’t leave alone.</p><p>This is a space for those ideas. To follow the thread, break the pattern, and see what happens when your imagination has a little more room.</p></div><OrbitMark /><span className="page-number">01 / A NEW WAY TO CREATE</span></div></div>;
  if (kind === "grid") return <div className="artwork artwork-grid"><span className="artwork-overline">THE BEAUTY IN THE DETAILS</span><div className="creative-grid">{Array.from({ length: 35 }, (_, i) => <span key={i} style={{ background: [3, 9, 11, 15, 23, 27, 31].includes(i) ? "var(--acid)" : undefined }}>{i === 0 ? "↗" : i % 7 === 0 ? String(i / 7).padStart(2, "0") : i % 4 === 0 ? "✳" : ""}</span>)}</div><span className="artwork-footnote">Every cell has potential.</span></div>;
  if (kind === "slides") return <div className="artwork artwork-slides"><div className="slide-back" /><div className="slide-front"><span>OFFSCRIPT / A NEW PERSPECTIVE</span><h4>What if<br /><em>we tried this?</em></h4><OrbitMark /><b>01 — THE IDEA</b></div></div>;
  if (kind === "layout") return <div className="artwork artwork-layout"><div className="poster-image"><BloomImage /></div><div className="poster-words"><span>AN EXERCISE IN POSSIBILITY</span><h4>OFF<br /><em>script.</em></h4><span>THE CREATIVE ISSUE / 001</span></div></div>;
  return <div className={`artwork artwork-vector ${compact ? "is-compact" : ""}`}><span className="artwork-overline">OFFSCRIPT / A MARK OF POSSIBILITY</span><OrbitMark className="vector-orbit" /><span className="vector-wordmark">offscript<span>®</span></span><span className="artwork-footnote">Follow the unfamiliar.</span></div>;
}
