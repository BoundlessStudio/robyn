import { C, mono, serif } from "../theme";
import { EditorCapture, Reveal, Stage } from "../components/Stage";

export const Revisions = () => (
  <Stage dark chapter="A creative process you can continue" number="07">
    <Reveal
      delay={0.15}
      style={{
        position: "absolute",
        left: 104,
        top: 182,
        fontSize: 125,
        letterSpacing: "-5px",
        lineHeight: 1.02,
      }}
    >
      Your work.
      <br />
      <span
        style={{
          fontFamily: serif,
          fontStyle: "italic",
          color: "#ed7958",
          fontSize: 155,
        }}
      >
        Still yours.
      </span>
    </Reveal>
    <Reveal delay={0.65} style={{ position: "absolute", left: 112, top: 528 }}>
      <EditorCapture
        app="photocraft"
        width={518}
        style={{ border: "1px solid #e9e8dc40" }}
      />
    </Reveal>
    <Reveal
      delay={1.15}
      style={{
        position: "absolute",
        left: 735,
        top: 280,
        width: 1060,
        borderTop: "1px solid #e9e8dc40",
        paddingTop: 23,
        fontSize: 34,
      }}
    >
      Native files. Saved revisions. Room to keep going.
    </Reveal>
    <Reveal
      delay={1.3}
      style={{
        position: "absolute",
        left: 735,
        top: 412,
        width: 677,
        padding: "23px 28px",
        border: "1px solid #e9e8dc40",
        fontSize: 34,
      }}
    >
      <span style={{ fontFamily: mono, marginRight: 32, color: "#a9b59e" }}>
        01
      </span>
      The first draft
    </Reveal>
    <Reveal
      delay={2.05}
      style={{
        position: "absolute",
        left: 775,
        top: 536,
        width: 677,
        padding: "23px 28px",
        border: "1px solid #e9e8dc70",
        background: "#304031",
        fontSize: 34,
      }}
    >
      <span style={{ fontFamily: mono, marginRight: 32, color: "#bfc9b5" }}>
        02
      </span>
      Your edit
    </Reveal>
    <Reveal
      delay={2.8}
      style={{
        position: "absolute",
        left: 815,
        top: 660,
        width: 677,
        padding: "23px 28px",
        background: C.paper,
        color: C.ink,
        fontSize: 34,
      }}
    >
      <span style={{ fontFamily: mono, marginRight: 32, color: C.rust }}>
        03
      </span>
      Continue with your specialist ↗
    </Reveal>
    <Reveal
      delay={3.5}
      style={{
        position: "absolute",
        left: 735,
        top: 820,
        display: "flex",
        gap: 20,
        fontFamily: mono,
        fontSize: 24,
        color: "#bdc8b3",
      }}
    >
      <span>.pcraft</span>
      <span> / </span>
      <span>.fcproj</span>
      <span> / </span>
      <span>.docx</span>
      <span> / …</span>
    </Reveal>
    <Reveal
      delay={1.2}
      style={{
        position: "absolute",
        left: 112,
        top: 924,
        fontSize: 25,
        color: "#b7c5a8",
      }}
    >
      SAVE. REOPEN. KEEP CREATING.
    </Reveal>
  </Stage>
);
