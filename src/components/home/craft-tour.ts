import { studioApps } from "@/studio/apps/registry";
import { isAppReady } from "@/studio/manifest";

const stories: Record<string, { lines: string[]; accent: string; copy: string; details: string[] }> = {
  photocraft: { lines: ["Reality,"], accent: "reimagined.", copy: "Robyn builds the image you can almost see. Layer, combine and reshape it in PhotoCraft, then put your own hands in the picture.", details: ["LAYERED IMAGES", "COMPOSITING", "YOUR OWN FINAL TOUCH"] },
  lightcraft: { lines: ["Find your"], accent: "kind of light.", copy: "A photograph already holds a feeling. Robyn brings it out in LightCraft, with room for you to refine the colour, the exposure and the mood.", details: ["PHOTOGRAPHY", "COLOUR & EXPOSURE", "ORIGINALS PRESERVED"] },
  vectorcraft: { lines: ["A shape", "of your"], accent: "own.", copy: "A loose idea becomes a mark, an illustration, an identity. Robyn works in VectorCraft, leaving you real paths and shapes to play with.", details: ["VECTOR ART", "IDENTITIES", "EDITABLE PATHS"] },
  designcraft: { lines: ["Make a"], accent: "statement.", copy: "Give words and images somewhere extraordinary to meet. Robyn composes in DesignCraft; you decide what deserves the biggest voice.", details: ["EDITORIAL LAYOUT", "TYPOGRAPHY", "MULTIPAGE DESIGN"] },
  figcraft: { lines: ["A thought.", "An entire"], accent: "experience.", copy: "Turn a sketch of a digital world into something you can explore. Robyn shapes screens in FigCraft, ready for your next bright idea.", details: ["INTERFACE DESIGN", "SCREENS & COMPONENTS", "EDITABLE STRUCTURE"] },
  filmcraft: { lines: ["Give it"], accent: "a little cinema.", copy: "A cut. A pause. A moment that stays with you. Robyn brings pictures and sound together in FilmCraft, with an actual timeline you can keep editing.", details: ["FILM EDITING", "PICTURE & SOUND", "AN EDITABLE TIMELINE"] },
  effectcraft: { lines: ["Still is"], accent: "just the start.", copy: "Make a letter dance. Give an idea a pulse. Robyn works in EffectCraft, turning compositions into movement you can make your own.", details: ["MOTION DESIGN", "ANIMATION", "COMPOSITING"] },
  soundcraft: { lines: ["Find your"], accent: "frequency.", copy: "Every creative world deserves a sound of its own. Robyn builds in SoundCraft, so you can shape the tracks, the mix and the feeling.", details: ["AUDIO PRODUCTION", "MULTITRACK SESSIONS", "MIXING"] },
  wordcraft: { lines: ["Some words"], accent: "have wings.", copy: "A manifesto, a story, a thought finally finding its voice. Robyn develops it in WordCraft. Every sentence is still yours to change.", details: ["WRITING", "EDITABLE DOCUMENTS", "YOUR VOICE"] },
  pdfcraft: { lines: ["The details"], accent: "make it.", copy: "Make the last version feel considered. Robyn works in PdfCraft, helping you arrange, annotate and refine the document before it goes out into the world.", details: ["PDF EDITING", "PAGE ASSEMBLY", "ANNOTATIONS"] },
  deckcraft: { lines: ["An idea", "worth a"], accent: "spotlight.", copy: "Give your thinking a room-filling presence. Robyn builds in DeckCraft, connecting the story, the images and the moments that matter.", details: ["PRESENTATIONS", "VISUAL STORYTELLING", "EDITABLE SLIDES"] },
  gridcraft: { lines: ["There’s art"], accent: "in the pattern.", copy: "A good spreadsheet can be a way of seeing. Robyn works in GridCraft, helping information become something you can understand and shape.", details: ["SPREADSHEETS", "FORMULAS", "PATTERNS & POSSIBILITIES"] },
  cadcraft: { lines: ["Imagine it.", "Give it"], accent: "dimension.", copy: "Take a loose thought into precise space. Robyn draws in CADCraft, giving your idea geometry you can inspect, adjust and keep building on.", details: ["CAD DRAWING", "PRECISE GEOMETRY", "EDITABLE DXF"] },
  solidcraft: { lines: ["An idea", "taking"], accent: "shape.", copy: "Explore an idea from every angle. Robyn builds in SolidCraft, with dimensions, sketches and a feature history you can keep shaping.", details: ["PARAMETRIC 3D", "SKETCHES & SOLIDS", "EDITABLE DESIGNS"] },
  bimcraft: { lines: ["A building,"], accent: "taking shape.", copy: "Bring a building and its information together. Robyn works in BimCraft with editable elements and properties you can inspect and develop.", details: ["BUILDING MODELS", "ELEMENT PROPERTIES", "EDITABLE IFC"] },
  modelcraft: { lines: ["Room for"], accent: "another angle.", copy: "Draw, shape and explore an idea in three dimensions. Robyn builds in ModelCraft, leaving geometry and saved views ready for your next move.", details: ["3D MODELLING", "FACES & EDGES", "SAVED SCENES"] },
  markupcraft: { lines: ["Make your"], accent: "mark.", copy: "A note can move a project forward. Review a plan in MarkupCraft with Robyn, then keep working with the annotations in the original PDF.", details: ["PLAN REVIEW", "PDF ANNOTATIONS", "EDITABLE MARKUPS"] },
  takeoffcraft: { lines: ["Make every"], accent: "measure count.", copy: "Connect a drawing to the quantities behind it. Robyn works in TakeoffCraft with calibrated plans, measured items and estimates you can adjust.", details: ["CALIBRATED PLANS", "QUANTITIES", "EDITABLE ESTIMATES"] },
  civilcraft: { lines: ["Give a place"], accent: "shape.", copy: "Explore the ground an idea stands on. Robyn works in CivilCraft with survey points, terrain and site elements that stay open to your direction.", details: ["SURVEY POINTS", "TERRAIN", "SITE DESIGN"] },
  detailcraft: { lines: ["An idea,"], accent: "down to detail.", copy: "Follow a design into its members and connections. Robyn works in DetailCraft, preserving the model behind the drawings and quantities.", details: ["STEEL DETAILING", "MEMBERS & CONNECTIONS", "EDITABLE MODELS"] },
  matcraft: { lines: ["Follow the"], accent: "mathematics.", copy: "Explore the calculation behind an idea. Robyn works in MatCraft with scripts, matrices and numerical results you can inspect and continue.", details: ["NUMERICAL COMPUTING", "MATRICES", "EDITABLE SCRIPTS"] },
  partcraft: { lines: ["Fit an idea"], accent: "together.", copy: "Shape a part, revisit a feature and see how it fits. Robyn builds in PartCraft with editable sketches, features and assemblies.", details: ["PARAMETRIC PARTS", "FEATURE HISTORY", "ASSEMBLIES"] },
};

// Presentation order is editorial; identity and the application count
// still come from the independent integration registry. New apps get a fallback.
const order = Object.keys(stories);
export const craftTour = studioApps.filter(isAppReady).sort((a, b) => {
  const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
  return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
}).map(app => ({ ...app, story: stories[app.id] ?? { lines: ["Another way"], accent: "to imagine.", copy: app.tagline, details: [app.category.toUpperCase(), "REAL CREATIVE SOFTWARE", "EDITABLE WORK"] } }));

export const studioTour = craftTour;
