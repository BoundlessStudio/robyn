import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { FlightStory } from "./FlightStory";
import { studioTour } from "./craft-tour";


export function CreativeHomepage() {
  return <main className="ascii-home">
    <a href="#idea-heading" className="home-skip">Skip to content</a>
    <header className="ascii-header">
      <Link href="/" className="ascii-wordmark" aria-label="Robyn, home">robyn</Link>
      <span className="header-edition">A LITTLE WILD.<br />MADE FOR DESKTOP.</span>
      <nav aria-label="Main navigation"><a href={`#${studioTour[0].id}`}>Explore Robyn’s tools</a><a href="#invitation">Your invitation</a></nav>
      <Link className="studio-entry" href="/login">Desktop studio <ArrowUpRight size={18} /></Link>
    </header>
    <FlightStory />
    <footer className="ascii-footer"><Link href="/" className="ascii-wordmark" aria-label="Robyn, home">robyn</Link><span>SMALL BIRD. BIG IDEAS. DESKTOP STUDIO.</span><div><Link href="/privacy">Privacy</Link><Link href="/support">Support</Link><Link href="/login">Studio sign in <ArrowUpRight size={15} /></Link><a href="#an-idea">Back to the bird ↑</a></div></footer>
  </main>;
}
