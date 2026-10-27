import { C, serif } from "../theme";
import {
  AppIcon,
  EditorCapture,
  Kicker,
  Reveal,
  Stage,
} from "../components/Stage";

export const Research = () => (
  <Stage chapter="Research, with you at the controls" number="05">
    <Reveal delay={0.2} style={{ position: "absolute", left: 112, top: 215 }}>
      <Kicker>Good work begins with a question.</Kicker>
    </Reveal>
    <Reveal
      delay={0.35}
      style={{
        position: "absolute",
        left: 104,
        top: 290,
        fontSize: 116,
        letterSpacing: "-5px",
        lineHeight: 1.02,
      }}
    >
      Follow your
      <br />
      <span
        style={{
          fontFamily: serif,
          fontStyle: "italic",
          color: C.rust,
          fontSize: 146,
        }}
      >
        curiosity.
      </span>
    </Reveal>
    <Reveal
      delay={1.0}
      style={{
        position: "absolute",
        left: 112,
        top: 602,
        fontSize: 40,
        lineHeight: 1.45,
      }}
    >
      Browse the web.
      <br />
      Follow the sources.
      <br />
      Take the controls.
    </Reveal>
    <Reveal delay={0.7} style={{ position: "absolute", left: 812, top: 179 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 17,
          fontSize: 29,
          marginBottom: 19,
        }}
      >
        <AppIcon id="research" size={46} />
        Research <span style={{ color: C.muted }}>/ An editable notebook</span>
      </div>
      <EditorCapture
        app="research"
        width={992}
        style={{ border: `1px solid ${C.line}` }}
      />
    </Reveal>
  </Stage>
);
