import { C, serif } from "../theme";
import { Kicker, Reveal, Stage } from "../components/Stage";

export const Closing = () => (
  <Stage chapter="Ideas have wings." number="07">
    <div
      style={{
        position: "absolute",
        left: 1090,
        top: 180,
        width: 700,
        height: 700,
        borderRadius: "50%",
        border: `1px solid ${C.line}`,
      }}
    />
    <Reveal delay={0.05} style={{ position: "absolute", left: 112, top: 212 }}>
      <Kicker>A little wild. Entirely yours.</Kicker>
    </Reveal>
    <Reveal
      delay={0.15}
      style={{
        position: "absolute",
        left: 104,
        top: 286,
        width: 1020,
        fontSize: 133,
        letterSpacing: "-6px",
        lineHeight: 1.04,
      }}
    >
      Bring your
      <br />
      <span
        style={{
          fontFamily: serif,
          fontStyle: "italic",
          color: C.rust,
          fontSize: 167,
        }}
      >
        strange ideas.
      </span>
    </Reveal>
    <Reveal
      delay={0.6}
      style={{
        position: "absolute",
        left: 112,
        top: 683,
        fontSize: 58,
        letterSpacing: "-2px",
        borderBottom: `2px solid ${C.rust}`,
        paddingBottom: 13,
      }}
    >
      robyn.academy <span style={{ color: C.rust }}>↗</span>
    </Reveal>
    <Reveal
      delay={0.95}
      style={{ position: "absolute", left: 112, top: 817, fontSize: 37 }}
    >
      Request an invitation.
    </Reveal>
    <Reveal
      delay={1.1}
      style={{
        position: "absolute",
        left: 112,
        top: 877,
        fontSize: 25,
        color: C.muted,
      }}
    >
      Private pilot · Desktop studio
    </Reveal>
  </Stage>
);
