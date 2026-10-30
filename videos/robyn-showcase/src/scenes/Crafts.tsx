import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, ease, serif } from "../theme";
import { AppIcon, Reveal, Stage } from "../components/Stage";

const crafts = [
  ["photocraft", "PhotoCraft", "Images"],
  ["lightcraft", "LightCraft", "Photography"],
  ["vectorcraft", "VectorCraft", "Illustration"],
  ["designcraft", "DesignCraft", "Layouts"],
  ["figcraft", "FigCraft", "Interfaces"],
  ["filmcraft", "FilmCraft", "Film"],
  ["effectcraft", "EffectCraft", "Motion"],
  ["soundcraft", "SoundCraft", "Audio"],
  ["wordcraft", "WordCraft", "Documents"],
  ["pdfcraft", "PdfCraft", "PDFs"],
  ["deckcraft", "DeckCraft", "Presentations"],
  ["gridcraft", "GridCraft", "Spreadsheets"],
  ["cadcraft", "CADCraft", "CAD"],
  ["solidcraft", "SolidCraft", "Parametric 3D"],
];
export const Crafts = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage chapter="Dashboard / Fourteen ways to make" number="02">
      <Reveal
        delay={0.15}
        style={{
          position: "absolute",
          left: 104,
          top: 184,
          fontSize: 119,
          lineHeight: 1.05,
          letterSpacing: "-6px",
        }}
      >
        14 Crafts.{" "}
        <span style={{ fontFamily: serif, fontStyle: "italic", color: C.rust }}>
          One studio.
        </span>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 104,
          right: 104,
          top: 420,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          rowGap: 46,
        }}
      >
        {crafts.map(([id, name, discipline], i) => (
          <div
            key={id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              opacity: interpolate(
                frame,
                [(0.55 + i * 0.055) * fps, (1 + i * 0.055) * fps],
                [0, 1],
                ease,
              ),
              translate: `0px ${interpolate(frame, [(0.55 + i * 0.055) * fps, (1.2 + i * 0.055) * fps], [32, 0], ease)}px`,
            }}
          >
            <AppIcon id={id} size={108} />
            <div
              style={{
                fontSize: 29,
                fontWeight: 500,
                marginTop: 18,
                letterSpacing: "-0.8px",
              }}
            >
              {name}
            </div>
            <div style={{ fontSize: 23, color: C.muted, marginTop: 4 }}>
              {discipline}
            </div>
          </div>
        ))}
      </div>
      <Reveal
        delay={2.5}
        style={{ position: "absolute", left: 112, top: 884, fontSize: 39 }}
      >
        Open a Craft. Start making.
      </Reveal>
    </Stage>
  );
};
