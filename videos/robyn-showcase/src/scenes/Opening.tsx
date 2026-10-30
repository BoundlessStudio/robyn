import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, ease, serif } from "../theme";
import { Kicker, Reveal, Stage } from "../components/Stage";

export const Opening = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage chapter="Your AI creative studio" number="01">
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          border: `1px solid ${C.line}`,
          borderRadius: "50%",
          left: 1090,
          top: 180,
          scale: interpolate(frame, [0, 8 * fps], [0.93, 1.04], {
            ...ease,
            easing: Easing.bezier(0.2, 0.8, 0.2, 1),
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 790,
          height: 790,
          border: `1px dashed ${C.line}`,
          borderRadius: "50%",
          left: 1045,
          top: 135,
          opacity: 0.4,
          rotate: `${(frame / fps) * 2}deg`,
        }}
      />
      <Reveal
        delay={0.15}
        style={{ position: "absolute", left: 112, top: 208 }}
      >
        <Kicker>A world of your making.</Kicker>
      </Reveal>
      <Interactive.Div
        name="Ideas have"
        premountFor={fps}
        style={{
          position: "absolute",
          left: 104,
          top: 280,
          fontSize: 160,
          lineHeight: 0.98,
          letterSpacing: "-10px",
          fontWeight: 500,
          opacity: interpolate(frame, [0.3 * fps, 1 * fps], [0, 1], ease),
          translate: interpolate(
            frame,
            [0.3 * fps, 1.3 * fps],
            ["0px 40px", "0px 0px"],
            { ...ease, easing: Easing.bezier(0.16, 1, 0.3, 1) },
          ),
        }}
      >
        Ideas have
      </Interactive.Div>
      <Interactive.Div
        name="Wings"
        premountFor={fps}
        style={{
          position: "absolute",
          left: 104,
          top: 414,
          fontFamily: serif,
          fontStyle: "italic",
          fontSize: 256,
          letterSpacing: "-7px",
          color: C.rust,
          lineHeight: 1,
          opacity: interpolate(frame, [0.75 * fps, 1.5 * fps], [0, 1], ease),
          translate: interpolate(
            frame,
            [0.75 * fps, 1.6 * fps],
            ["0px 55px", "0px 0px"],
            { ...ease, easing: Easing.bezier(0.16, 1, 0.3, 1) },
          ),
        }}
      >
        wings.
      </Interactive.Div>
      <Reveal
        delay={1.5}
        style={{
          position: "absolute",
          left: 112,
          top: 750,
          fontSize: 43,
          lineHeight: 1.35,
        }}
      >
        One Robyn. Fourteen creative tools.
        <br />
        Your imagination, in the making.
      </Reveal>
      <Reveal
        delay={2.6}
        style={{
          position: "absolute",
          left: 112,
          top: 900,
          fontSize: 27,
          color: C.rust,
        }}
      >
        Follow the bird ↗
      </Reveal>
    </Stage>
  );
};
