import {
  CanvasImage,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, ease, mono, serif } from "../theme";
import { AppIcon, Reveal, Stage } from "../components/Stage";
import { crafts } from "../catalog";

const MediaInputs = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      <Reveal
        delay={0.55}
        style={{ position: "absolute", left: 112, top: 486, width: 508 }}
      >
        <div style={{ height: 309, overflow: "hidden", background: "#d3cab6" }}>
          <CanvasImage
            name="Original bloom artwork"
            premountFor={fps}
            src={staticFile("artwork/bloom.png")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "50% 42%",
              scale: interpolate(frame, [0, 8 * fps], [1.08, 1], ease),
            }}
          />
        </div>
        <div
          style={{
            fontSize: 30,
            borderTop: `1px solid ${C.line}`,
            paddingTop: 17,
            marginTop: 20,
          }}
        >
          01 / Images
        </div>
      </Reveal>
      <Reveal
        delay={0.8}
        style={{ position: "absolute", left: 704, top: 486, width: 508 }}
      >
        <div
          style={{
            height: 309,
            background: C.ink,
            display: "flex",
            gap: 5,
            alignItems: "center",
            padding: 36,
            overflow: "hidden",
          }}
        >
          {Array.from({ length: 48 }, (_, i) => (
            <div
              key={i}
              style={{
                width: 5,
                flexShrink: 0,
                background: i < (frame / fps) * 7 ? "#e67c59" : "#74856e",
                height:
                  12 + Math.abs(Math.sin(i * 0.63) * Math.cos(i * 0.19)) * 175,
              }}
            />
          ))}
        </div>
        <div
          style={{
            fontSize: 30,
            borderTop: `1px solid ${C.line}`,
            paddingTop: 17,
            marginTop: 20,
          }}
        >
          02 / Audio + speech
        </div>
      </Reveal>
      <Reveal
        delay={1.05}
        style={{ position: "absolute", left: 1296, top: 486, width: 508 }}
      >
        <div
          style={{
            height: 309,
            position: "relative",
            overflow: "hidden",
            background: C.ink,
          }}
        >
          <CanvasImage
            name="Sunset from actual FilmCraft capture"
            premountFor={fps}
            src={staticFile("editors/filmcraft.png")}
            style={{
              width: 2045,
              maxWidth: "none",
              height: 1420,
              position: "absolute",
              left: -838,
              top: -290,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 216,
              top: 117,
              width: 75,
              height: 75,
              border: "1px solid #e9e8dc90",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              color: C.paper,
              fontSize: 30,
            }}
          >
            ▷
          </div>
        </div>
        <div
          style={{
            fontSize: 30,
            borderTop: `1px solid ${C.line}`,
            paddingTop: 17,
            marginTop: 20,
          }}
        >
          03 / Video
        </div>
      </Reveal>
      <Reveal
        delay={1.6}
        style={{ position: "absolute", left: 112, top: 882, fontSize: 32 }}
      >
        Your files. Commons media. Generated images, speech and video.
      </Reveal>
      <Reveal
        delay={2.1}
        style={{
          position: "absolute",
          left: 112,
          top: 931,
          fontSize: 24,
          color: C.muted,
        }}
      >
        Keep source references, creators and licences in your Asset library.
      </Reveal>
    </>
  );
};

const ConnectedCrafts = () => (
  <>
    <Reveal
      delay={0.2}
      style={{
        position: "absolute",
        left: 112,
        top: 494,
        width: 342,
        height: 330,
        boxSizing: "border-box",
        border: `1px solid ${C.line}`,
        padding: 28,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 20, color: C.muted }}>
        KEEP THE CONTEXT
      </div>
      <div style={{ marginTop: 18, fontSize: 42, letterSpacing: "-1.5px" }}>
        Sources
      </div>
      {["Source reference", "Creator + licence", "Original media"].map(
        (label) => (
          <div
            key={label}
            style={{
              marginTop: 16,
              paddingTop: 10,
              borderTop: `1px solid ${C.line}`,
              fontSize: 26,
            }}
          >
            {label}
          </div>
        ),
      )}
    </Reveal>
    <Reveal
      delay={0.55}
      style={{
        position: "absolute",
        left: 472,
        top: 617,
        width: 94,
        textAlign: "center",
        color: C.rust,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 20 }}>SAVE</div>
      <div style={{ fontSize: 58, lineHeight: 1 }}>→</div>
    </Reveal>
    <Reveal
      delay={0.75}
      style={{
        position: "absolute",
        left: 584,
        top: 494,
        width: 420,
        height: 330,
        boxSizing: "border-box",
        padding: 30,
        background: C.ink,
        color: C.paper,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 20, color: "#b7c5a8" }}>
        ONE SHARED PLACE
      </div>
      <div style={{ marginTop: 18, fontSize: 45, letterSpacing: "-1.8px" }}>
        Asset library
      </div>
      <div style={{ marginTop: 30, fontSize: 28, lineHeight: 1.65 }}>
        Editable native masters
        <br />
        Previews + exports
        <br />
        Exact saved revisions
      </div>
    </Reveal>
    <Reveal delay={1.1} style={{ position: "absolute", left: 1004, top: 540 }}>
      <svg width="146" height="240" viewBox="0 0 146 240" aria-hidden>
        <defs>
          <marker
            id="craft-route-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0 0 L6 3.5 L0 7" fill="none" stroke={C.rust} />
          </marker>
        </defs>
        {["M0 120 H68 V12 H128", "M0 120 H128", "M68 120 V228 H128"].map(
          (d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke={C.rust}
              strokeWidth="2"
              markerEnd="url(#craft-route-arrow)"
            />
          ),
        )}
      </svg>
    </Reveal>
    {[
      { name: "Creative", apps: ["photocraft", "soundcraft", "filmcraft"] },
      { name: "Drafting", apps: ["cadcraft", "bimcraft", "solidcraft"] },
      { name: "Analysis", apps: ["gridcraft", "deckcraft", "datacraft"] },
    ].map(({ name, apps }, index) => (
      <Reveal
        key={name}
        delay={1.35 + index * 0.3}
        style={{
          position: "absolute",
          left: 1150,
          top: 494 + index * 108,
          width: 654,
          borderTop: `1px solid ${C.line}`,
          paddingTop: 12,
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 19, color: C.muted }}>
          {name.toUpperCase()}
        </div>
        <div style={{ display: "flex", gap: 22, marginTop: 9 }}>
          {apps.map((id) => (
            <div
              key={id}
              style={{ display: "flex", gap: 10, alignItems: "center" }}
            >
              <AppIcon id={id} size={46} />
              <span style={{ fontSize: 23 }}>
                {crafts.find((app) => app.id === id)?.name}
              </span>
            </div>
          ))}
        </div>
      </Reveal>
    ))}
    <Reveal
      delay={2.5}
      style={{ position: "absolute", left: 112, top: 882, fontSize: 32 }}
    >
      Move compatible originals, exports and previews between Crafts.
    </Reveal>
    <Reveal
      delay={3}
      style={{
        position: "absolute",
        left: 112,
        top: 931,
        fontSize: 25,
        color: C.muted,
      }}
    >
      Keep source references and exact revisions linked to the work.
    </Reveal>
  </>
);

export const Media = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage chapter="Sources / Assets / Connected Crafts" number="05">
      <Reveal
        delay={0.15}
        style={{
          position: "absolute",
          left: 104,
          top: 178,
          fontSize: 113,
          lineHeight: 1.04,
          letterSpacing: "-5px",
        }}
      >
        Bring your world
        <br />
        <span
          style={{
            fontFamily: serif,
            fontStyle: "italic",
            color: C.rust,
            fontSize: 135,
          }}
        >
          into the work.
        </span>
      </Reveal>
      <Interactive.Div
        name="Sources, media and imports"
        durationInFrames={7.75 * fps}
        premountFor={fps}
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [7 * fps, 7.6 * fps], [1, 0], ease),
        }}
      >
        <MediaInputs />
      </Interactive.Div>
      <Interactive.Div
        name="Asset library and Craft handoffs"
        from={7 * fps}
        durationInFrames={8.5 * fps}
        premountFor={fps}
      >
        <ConnectedCrafts />
      </Interactive.Div>
    </Stage>
  );
};
