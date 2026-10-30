import {
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, ease, serif } from "../theme";
import { Reveal, Stage } from "../components/Stage";

export const Media = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage chapter="Your creative ingredients" number="06">
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
        Sources and credits stay with the work.
      </Reveal>
    </Stage>
  );
};
