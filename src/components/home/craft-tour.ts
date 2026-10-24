import { research } from "@/studio/specialists/research";
import { studioApps } from "@/studio/apps/registry";

const stories: Record<string, { lines: string[]; accent: string; copy: string; details: string[] }> = {
  photocraft: { lines: ["Reality,"], accent: "reimagined.", copy: "Your Photo Artist builds the image you can almost see. Layer, combine and reshape it in PhotoCraft, then put your own hands in the picture.", details: ["LAYERED IMAGES", "COMPOSITING", "YOUR OWN FINAL TOUCH"] },
  lightcraft: { lines: ["Find your"], accent: "kind of light.", copy: "A photograph already holds a feeling. Your Photographer brings it out in LightCraft, with room for you to refine the colour, the exposure and the mood.", details: ["PHOTOGRAPHY", "COLOUR & EXPOSURE", "ORIGINALS PRESERVED"] },
  vectorcraft: { lines: ["A shape", "of your"], accent: "own.", copy: "A loose idea becomes a mark, an illustration, an identity. Your Illustrator works in VectorCraft, leaving you real paths and shapes to play with.", details: ["VECTOR ART", "IDENTITIES", "EDITABLE PATHS"] },
  designcraft: { lines: ["Make a"], accent: "statement.", copy: "Give words and images somewhere extraordinary to meet. Your Layout Designer composes in DesignCraft; you decide what deserves the biggest voice.", details: ["EDITORIAL LAYOUT", "TYPOGRAPHY", "MULTIPAGE DESIGN"] },
  figcraft: { lines: ["A thought.", "An entire"], accent: "experience.", copy: "Turn a sketch of a digital world into something you can explore. Your Interface Designer shapes screens in FigCraft, ready for your next bright idea.", details: ["INTERFACE DESIGN", "SCREENS & COMPONENTS", "EDITABLE STRUCTURE"] },
  filmcraft: { lines: ["Give it"], accent: "a little cinema.", copy: "A cut. A pause. A moment that stays with you. Your Film Editor brings pictures and sound together in FilmCraft, with an actual timeline you can keep editing.", details: ["FILM EDITING", "PICTURE & SOUND", "AN EDITABLE TIMELINE"] },
  effectcraft: { lines: ["Still is"], accent: "just the start.", copy: "Make a letter dance. Give an idea a pulse. Your Motion Designer works in EffectCraft, turning compositions into movement you can make your own.", details: ["MOTION DESIGN", "ANIMATION", "COMPOSITING"] },
  soundcraft: { lines: ["Find your"], accent: "frequency.", copy: "Every creative world deserves a sound of its own. Your Sound Engineer builds in SoundCraft, so you can shape the tracks, the mix and the feeling.", details: ["AUDIO PRODUCTION", "MULTITRACK SESSIONS", "MIXING"] },
  wordcraft: { lines: ["Some words"], accent: "have wings.", copy: "A manifesto, a story, a thought finally finding its voice. Your Writer develops it in WordCraft. Every sentence is still yours to change.", details: ["WRITING", "EDITABLE DOCUMENTS", "YOUR VOICE"] },
  pdfcraft: { lines: ["The details"], accent: "make it.", copy: "Make the last version feel considered. Your PDF Specialist works in PdfCraft, helping you arrange, annotate and refine the document before it goes out into the world.", details: ["PDF EDITING", "PAGE ASSEMBLY", "ANNOTATIONS"] },
  deckcraft: { lines: ["An idea", "worth a"], accent: "spotlight.", copy: "Give your thinking a room-filling presence. Your Presentation Designer builds in DeckCraft, connecting the story, the images and the moments that matter.", details: ["PRESENTATIONS", "VISUAL STORYTELLING", "EDITABLE SLIDES"] },
  gridcraft: { lines: ["There’s art"], accent: "in the pattern.", copy: "A good spreadsheet can be a way of seeing. Your Spreadsheet Specialist works in GridCraft, helping information become something you can understand and shape.", details: ["SPREADSHEETS", "FORMULAS", "PATTERNS & POSSIBILITIES"] },
  cadcraft: { lines: ["Imagine it.", "Give it"], accent: "dimension.", copy: "Take a loose thought into precise space. Your CAD Designer draws in CADCraft, giving your idea geometry you can inspect, adjust and keep building on.", details: ["CAD DRAWING", "PRECISE GEOMETRY", "EDITABLE DXF"] },
};

// Presentation order is editorial; identity, employees and the application count
// still come from the independent integration registry. New apps get a fallback.
const order = Object.keys(stories);
export const craftTour = [...studioApps].sort((a, b) => {
  const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
  return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
}).map(app => ({ ...app, story: stories[app.id] ?? { lines: ["Another way"], accent: "to imagine.", copy: app.tagline, details: [app.employee.role.toUpperCase(), "REAL CREATIVE SOFTWARE", "EDITABLE WORK"] } }));

export const studioTour = [...craftTour, { ...research, story: { lines: ["Follow your"], accent: "curiosity.", copy: "A hunch, a reference, a question worth asking. Research explores the web with Chrome and Brave Search, follows the sources, and brings its findings back to your creative team. Watch the browser, take over, then hand it back.", details: ["WEB RESEARCH", "BROWSER AUTOMATION", "SOURCES YOU CAN FOLLOW"] } }];
