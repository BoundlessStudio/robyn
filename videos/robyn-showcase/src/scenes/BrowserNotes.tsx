import { C, serif } from "../theme";
import { EditorCapture, Kicker, Reveal, Stage } from "../components/Stage";

export const BrowserNotes = () => (
  <Stage chapter="Robyn's browser tools / Your Notes" number="05">
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
        fontSize: 37,
        lineHeight: 1.45,
      }}
    >
      Search with Robyn.
      <br />
      Watch or take control.
      <br />
      Save findings as Notes.
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
        Notes <span style={{ color: C.muted }}>/ An editable document</span>
      </div>
      <EditorCapture
        app="notes"
        width={992}
        style={{ border: `1px solid ${C.line}` }}
      />
    </Reveal>
  </Stage>
);
