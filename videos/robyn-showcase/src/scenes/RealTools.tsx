import {
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, ease, serif } from "../theme";
import { EditorCapture, Kicker, Reveal, Stage } from "../components/Stage";

export const RealTools = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage dark chapter="Real tools. Editable work." number="03">
      <Reveal
        delay={0.15}
        style={{ position: "absolute", left: 112, top: 223 }}
      >
        <Kicker dark>Put your hands in it.</Kicker>
      </Reveal>
      <Reveal
        delay={0.35}
        style={{
          position: "absolute",
          left: 104,
          top: 290,
          width: 530,
          fontSize: 113,
          lineHeight: 0.99,
          letterSpacing: "-5px",
        }}
      >
        Made to
        <br />
        be made
        <br />
        <span
          style={{
            fontFamily: serif,
            fontStyle: "italic",
            color: "#ed7958",
            fontSize: 142,
          }}
        >
          by you.
        </span>
      </Reveal>
      <Interactive.Div
        name="PhotoCraft — layered composition"
        premountFor={fps}
        style={{
          position: "absolute",
          left: 794,
          top: 163,
          opacity: interpolate(
            frame,
            [0.5 * fps, 1.2 * fps, 4.9 * fps, 5.25 * fps],
            [0, 1, 1, 0],
            ease,
          ),
        }}
      >
        <div style={{ fontSize: 27, marginBottom: 18 }}>
          PhotoCraft <span style={{ color: "#a8b89d" }}> / Layered images</span>
        </div>
        <EditorCapture
          app="photocraft"
          width={1010}
          style={{ border: "1px solid #e9e8dc44" }}
        />
      </Interactive.Div>
      <Interactive.Div
        name="FilmCraft — actual editable timeline"
        premountFor={fps}
        style={{
          position: "absolute",
          left: 794,
          top: 163,
          opacity: interpolate(frame, [5.05 * fps, 5.65 * fps], [0, 1], ease),
        }}
      >
        <div style={{ fontSize: 27, marginBottom: 18 }}>
          FilmCraft{" "}
          <span style={{ color: "#a8b89d" }}> / Editable timelines</span>
        </div>
        <EditorCapture
          app="filmcraft"
          width={1010}
          style={{ border: "1px solid #e9e8dc44" }}
        />
      </Interactive.Div>
      <Reveal
        delay={1.5}
        style={{
          position: "absolute",
          left: 112,
          top: 891,
          fontSize: 32,
          color: C.paper,
        }}
      >
        Your own final touch.
      </Reveal>
    </Stage>
  );
};
