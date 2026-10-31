import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, ease, mono, serif } from "../theme";
import { AppIcon, Reveal, Stage } from "../components/Stage";
import { readyCrafts } from "../catalog";

export const Robyn = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage chapter="Conversation · Jobs · Review · Skills" number="04">
      <Reveal
        delay={0.15}
        style={{
          position: "absolute",
          left: 104,
          top: 183,
          fontSize: 125,
          lineHeight: 1.03,
          letterSpacing: "-6px",
        }}
      >
        One Robyn.
        <br />
        <span
          style={{
            fontFamily: serif,
            fontStyle: "italic",
            color: C.rust,
            fontSize: 150,
          }}
        >
          In every studio.
        </span>
      </Reveal>
      <Reveal
        delay={0.6}
        style={{ position: "absolute", left: 1060, top: 244, width: 744 }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 19,
            letterSpacing: "2px",
            color: C.muted,
            marginBottom: 24,
          }}
        >
          YOUR PROJECT
        </div>
        <div
          style={{
            display: "flex",
            gap: 32,
            fontSize: 28,
            borderBottom: `1px solid ${C.line}`,
            paddingBottom: 22,
          }}
        >
          <span>Dashboard</span>
          <span>Assets</span>
          <span style={{ color: C.rust }}>Robyn</span>
          <span>Settings</span>
        </div>
        <div style={{ fontSize: 29, marginTop: 23, color: C.muted }}>
          One conversation across your tools.
        </div>
      </Reveal>
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", inset: 0 }}
      >
        <path
          d="M 508 616 H 610 M 1140 616 H 1252"
          stroke={C.rust}
          strokeWidth={2}
          strokeDasharray="5 8"
          strokeDashoffset={(-frame / fps) * 12}
          fill="none"
          opacity={interpolate(frame, [1 * fps, 2 * fps], [0, 1], ease)}
        />
      </svg>
      <Reveal
        delay={0.55}
        style={{
          position: "absolute",
          left: 112,
          top: 514,
          width: 400,
          height: 212,
          padding: 30,
          border: `1px solid ${C.line}`,
          background: C.pale,
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 19,
            letterSpacing: "2px",
            color: C.muted,
          }}
        >
          01 / YOUR BRIEF
        </div>
        <div
          style={{
            fontFamily: serif,
            fontSize: 47,
            lineHeight: 1.14,
            marginTop: 22,
          }}
        >
          “Let’s make
          <br />
          something new.”
        </div>
      </Reveal>
      <Reveal
        delay={1.0}
        style={{
          position: "absolute",
          left: 608,
          top: 514,
          width: 533,
          height: 212,
          padding: 30,
          background: C.ink,
          color: C.paper,
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 19,
            letterSpacing: "2px",
            color: "#b7c5a8",
          }}
        >
          02 / ROBYN
        </div>
        <div
          style={{
            fontSize: 42,
            letterSpacing: "-1.6px",
            lineHeight: 1.18,
            marginTop: 22,
          }}
        >
          One workstation.
          <br />
          {readyCrafts.length} Crafts ready.
        </div>
      </Reveal>
      <Reveal
        delay={1.6}
        style={{
          position: "absolute",
          left: 1248,
          top: 514,
          width: 556,
          height: 212,
          borderTop: `1px solid ${C.line}`,
          paddingTop: 28,
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 19,
            letterSpacing: "2px",
            color: C.muted,
            marginBottom: 22,
          }}
        >
          03 / EDITABLE WORK
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <AppIcon id="photocraft" size={83} />
          <AppIcon id="wordcraft" size={83} />
          <AppIcon id="filmcraft" size={83} />
          <AppIcon id="solidcraft" size={83} />
        </div>
      </Reveal>
      <Reveal
        delay={2.5}
        style={{ position: "absolute", left: 112, top: 813, fontSize: 38 }}
      >
        Ask for a first draft. Review it. Make it yours.
      </Reveal>
      <Reveal
        delay={3.1}
        style={{
          position: "absolute",
          left: 112,
          top: 882,
          fontSize: 29,
          color: C.muted,
        }}
      >
        One monthly AI allowance. You set the limit in Settings.
      </Reveal>
    </Stage>
  );
};
