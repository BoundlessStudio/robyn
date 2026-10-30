export interface CraftArtwork {
  src: string;
  title: string;
  alt: string;
  tools: string;
  fullFrame?: boolean;
}

// Actual editor screenshots from our own QA project. CSS crops the studio shell
// and applies the ink palette. Provenance: docs/HOMEPAGE-ARTWORK.md.
export const craftArtwork: Record<string, CraftArtwork> = {
  "research": {
    "src": "/artwork/editors/research.jpg",
    "title": "A question. Something worth making.",
    "alt": "Research's real notebook workspace showing an OFFSCRIPT robin brief, factual findings, linked sources, creative directions and controls to edit, save and continue with Research.",
    "tools": "SOURCES / FIELD NOTES / YOUR NEXT DIRECTION"
  },
  "photocraft": {
    "src": "/artwork/editors/photocraft.png",
    "title": "Layers of possibility.",
    "alt": "PhotoCraft's real editor: a layered flower composition, drawing tools, colour controls and a visible layer stack.",
    "tools": "LAYERS / COLOUR / COMPOSITING"
  },
  "lightcraft": {
    "src": "/artwork/editors/lightcraft.png",
    "title": "See the light differently.",
    "alt": "LightCraft's real photo editor: a flower photograph beside its histogram, development controls and filmstrip.",
    "tools": "HISTOGRAM / DEVELOPMENT / FILMSTRIP"
  },
  "vectorcraft": {
    "src": "/artwork/editors/vectorcraft.png",
    "title": "Every point, yours.",
    "alt": "VectorCraft's real illustration editor with linked artwork, vector tools, object properties and an editable layer structure.",
    "tools": "PATHS / OBJECTS / LAYERS"
  },
  "designcraft": {
    "src": "/artwork/editors/designcraft.png",
    "title": "A place for every detail.",
    "alt": "DesignCraft's real layout editor showing a poster, page guides, text frames, layer controls and layout tools.",
    "tools": "PAGES / TEXT FRAMES / GUIDES"
  },
  "figcraft": {
    "src": "/artwork/editors/figcraft.png",
    "title": "From a thought to a screen.",
    "alt": "FigCraft's real interface editor with desktop and mobile design frames, a layers panel and design properties.",
    "tools": "FRAMES / COMPONENTS / PROPERTIES"
  },
  "filmcraft": {
    "src": "/artwork/editors/filmcraft.png",
    "title": "The story is in the cut.",
    "alt": "FilmCraft's real video editor with a sunset preview, project media, transport controls and a multitrack timeline.",
    "tools": "MEDIA / PREVIEW / TIMELINE"
  },
  "effectcraft": {
    "src": "/artwork/editors/effectcraft.png",
    "title": "Give an idea a pulse.",
    "alt": "EffectCraft's real motion editor displaying an OFFSCRIPT composition, seven animation layers and the time ruler.",
    "tools": "COMPOSITION / LAYERS / TIMING"
  },
  "soundcraft": {
    "src": "/artwork/editors/soundcraft.png",
    "title": "A session with a feeling.",
    "alt": "SoundCraft's real audio workstation showing transport controls, multiple tracks, clips, meters and session tools.",
    "tools": "TRACKS / TRANSPORT / MIXING"
  },
  "wordcraft": {
    "src": "/artwork/editors/wordcraft.png",
    "title": "Make every word your own.",
    "alt": "WordCraft's real document editor with an OFFSCRIPT manifesto, formatting ribbon, ruler and editable page.",
    "tools": "LIVE TEXT / STYLES / PAGE LAYOUT"
  },
  "pdfcraft": {
    "src": "/artwork/editors/pdfcraft.png",
    "title": "The final word, considered.",
    "alt": "PdfCraft's real PDF editor with the document page, editing tools, annotations and page controls.",
    "tools": "PAGES / ANNOTATIONS / EDITING"
  },
  "deckcraft": {
    "src": "/artwork/editors/deckcraft.png",
    "title": "An idea, ready for its audience.",
    "alt": "DeckCraft's real presentation editor with slide thumbnails, the editing ribbon, an OFFSCRIPT slide and speaker notes.",
    "tools": "SLIDES / RIBBON / SPEAKER NOTES"
  },
  "gridcraft": {
    "src": "/artwork/editors/gridcraft.png",
    "title": "Find the shape in the numbers.",
    "alt": "GridCraft's real spreadsheet editor showing a worksheet, column chart, formula bar and formatting ribbon.",
    "tools": "CELLS / FORMULAS / CHARTS"
  },
  "cadcraft": {
    "src": "/artwork/editors/cadcraft.png",
    "title": "Precision has a point of view.",
    "alt": "CADCraft's real drawing editor with a dimensioned gallery plan, drawing ribbon, geometry tools and properties.",
    "tools": "GEOMETRY / DIMENSIONS / DRAWING TOOLS"
  },
  "solidcraft": {
    "src": "/artwork/editors/solidcraft.png",
    "title": "Give your idea another dimension.",
    "alt": "SolidCraft's actual editor with a parametric 3D block, model browser, sketch and solid modelling tools, and an editable feature history.",
    "tools": "PARAMETERS / SOLIDS / FEATURE HISTORY",
    "fullFrame": true
  }
};

