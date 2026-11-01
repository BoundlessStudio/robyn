import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, ease, mono, serif } from "../theme";
import { AppIcon, Reveal, Stage } from "../components/Stage";
import { crafts, readyCrafts, studios } from "../catalog";

export const Crafts = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage chapter="Creative · Drafting · Analysis" number="02">
      <Reveal
        delay={0.15}
        style={{
          position: "absolute",
          left: 104,
          top: 184,
          fontSize: 104,
          lineHeight: 1.05,
          letterSpacing: "-5px",
        }}
      >
        {crafts.length} Crafts.{" "}
        <span style={{ fontFamily: serif, fontStyle: "italic", color: C.rust }}>
          Three studios.
        </span>
      </Reveal>
      <Reveal
        delay={0.45}
        style={{
          position: "absolute",
          left: 112,
          top: 325,
          fontSize: 28,
          color: C.muted,
        }}
      >
        {readyCrafts.length} ready to use. Made for desktop.
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 104,
          right: 104,
          top: 420,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 48,
        }}
      >
        {studios.map((studio, groupIndex) => (
          <div key={studio.name} data-studio-group={studio.name}>
            <Reveal
              delay={0.5 + groupIndex * 0.14}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                borderBottom: `1px solid ${C.line}`,
                paddingBottom: 15,
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 42, letterSpacing: "-1.8px" }}>
                {studio.name}
              </span>
              <span style={{ fontFamily: mono, fontSize: 21, color: C.muted }}>
                {studio.apps.length} Crafts
              </span>
            </Reveal>
            <div style={{ display: "grid", gap: 7 }}>
              {studio.apps.map((app, index) => (
                <div
                  key={app.id}
                  data-craft-id={app.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: 32,
                    gap: 13,
                    opacity: interpolate(
                      frame,
                      [
                        (0.75 + groupIndex * 0.14 + index * 0.04) * fps,
                        (1.2 + groupIndex * 0.14 + index * 0.04) * fps,
                      ],
                      [0, 1],
                      ease,
                    ),
                    translate: `0px ${interpolate(frame, [(0.75 + groupIndex * 0.14 + index * 0.04) * fps, (1.4 + groupIndex * 0.14 + index * 0.04) * fps], [18, 0], ease)}px`,
                  }}
                >
                  <AppIcon id={app.id} size={32} />
                  <span style={{ fontSize: 28, letterSpacing: "-0.6px" }}>
                    {app.name}
                  </span>
                  {!app.ready && (
                    <span
                      style={{
                        marginLeft: "auto",
                        color: C.rust,
                        fontSize: 17,
                        fontFamily: mono,
                      }}
                    >
                      Connecting
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Reveal
        delay={2.5}
        style={{ position: "absolute", left: 112, top: 926, fontSize: 29 }}
      >
        One workstation. Start making with a ready Craft.
      </Reveal>
    </Stage>
  );
};
