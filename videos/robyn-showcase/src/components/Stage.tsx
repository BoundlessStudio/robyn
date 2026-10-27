import { useContext, type CSSProperties, type ReactNode } from "react";
import { BirdGuide, ContinuousBirdContext } from "./AsciiBird";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, ease, mono, sans } from "../theme";

export const Stage = ({
  children,
  dark = false,
  chapter,
  number,
  style,
}: {
  children: ReactNode;
  dark?: boolean;
  chapter: string;
  number: string;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hasContinuousBird = useContext(ContinuousBirdContext);
  return (
    <AbsoluteFill
      style={{
        background: dark ? C.ink : C.paper,
        color: dark ? C.paper : C.ink,
        fontFamily: sans,
        overflow: "hidden",
        ...style,
      }}
    >
      <AbsoluteFill
        style={{
          opacity: dark ? 0.07 : 0.19,
          backgroundImage: `radial-gradient(${dark ? C.paper : C.ink} 0.6px, transparent 0.8px)`,
          backgroundSize: "9px 9px",
          maskImage: "linear-gradient(110deg,black,transparent 75%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 104,
          right: 104,
          top: 55,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 57, fontWeight: 600, letterSpacing: "-5px" }}>
          robyn
        </span>
        <span
          style={{ fontFamily: mono, fontSize: 21, letterSpacing: "2.1px" }}
        >
          {chapter.toUpperCase()}
        </span>
      </div>
      {children}
      <div
        style={{
          position: "absolute",
          left: 104,
          right: 104,
          bottom: 50,
          borderTop: `1px solid ${dark ? "#e9e8dc40" : C.line}`,
          paddingTop: 22,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: mono,
          fontSize: 19,
          letterSpacing: "1.4px",
        }}
      >
        <span>SMALL BIRD. BIG IDEAS.</span>
        <span>{number} / 08</span>
      </div>
      <Interactive.Div
        name="Chapter entrance"
        premountFor={fps}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: dark ? C.ink : C.paper,
          opacity: interpolate(frame, [0, 0.45 * fps], [0.8, 0], {
            ...ease,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      {!hasContinuousBird && <BirdGuide chapter={Number(number) - 1} />}
    </AbsoluteFill>
  );
};

export const Kicker = ({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: 23,
      letterSpacing: "2px",
      color: dark ? "#b7c5a8" : C.muted,
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

export const Reveal = ({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(
          frame,
          [delay * fps, (delay + 0.65) * fps],
          [0, 1],
          ease,
        ),
        translate: `0px ${interpolate(frame, [delay * fps, (delay + 1) * fps], [40, 0], { ...ease, easing: Easing.bezier(0.16, 1, 0.3, 1) })}px`,
      }}
    >
      {children}
    </div>
  );
};

// These captures are the real editor pixels. Crop out the historical QA shell.
export const EditorCapture = ({
  app,
  width,
  style,
}: {
  app: "photocraft" | "filmcraft" | "research";
  width: number;
  style?: CSSProperties;
}) => {
  const { fps } = useVideoConfig();
  const scale = width / 1256;
  return (
    <div
      style={{
        width,
        height: 912 * scale,
        position: "relative",
        overflow: "hidden",
        background: "#272727",
        ...style,
      }}
    >
      <CanvasImage
        name="Actual editor capture"
        premountFor={fps}
        src={staticFile(`editors/${app}.${app === "research" ? "jpg" : "png"}`)}
        style={{
          position: "absolute",
          left: -184 * scale,
          top: -88 * scale,
          width: 1440 * scale,
          height: 1000 * scale,
          maxWidth: "none",
        }}
      />
    </div>
  );
};

const iconBackgrounds: Record<string, string> = {
  wordcraft: "#3c59dd",
  deckcraft: "#ff731b",
  gridcraft: "#209d59",
  cadcraft: "#16a8c2",
  research: "#7472e8",
};
export const AppIcon = ({ id, size = 112 }: { id: string; size?: number }) => {
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        width: size,
        height: size,
        overflow: "hidden",
        borderRadius: size * 0.23,
        background: iconBackgrounds[id],
        flexShrink: 0,
      }}
    >
      <CanvasImage
        premountFor={fps}
        src={staticFile(`apps/${id}.webp`)}
        style={{ width: size, height: size }}
      />
    </div>
  );
};
