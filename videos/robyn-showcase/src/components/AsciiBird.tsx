import {
  createContext,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";
import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { makeRobin, ROBIN_PALETTE, ROBIN_RAMP } from "../bird-model";
import { C, ease } from "../theme";

const points = makeRobin();
const ramp = ROBIN_RAMP;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const cuts = [7.5, 16, 29.5, 39, 47.5, 55];
export const ContinuousBirdContext = createContext(false);

type BirdProps = {
  energy?: number;
  size?: number;
  timeOffset?: number;
  style?: CSSProperties;
};
const BirdInner = ({
  energy = 0,
  size = 800,
  timeOffset = 0,
  style,
}: BirdProps) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const t = frame / fps + timeOffset;
    const width = size,
      height = size,
      cellX = Math.max(4.2, width / 112),
      cellY = cellX * 1.4;
    // Match the homepage's responsive glyph grid. Downscaling an 800px bitmap
    // made the small guide's characters subpixel dots and obscured its eye.
    // A 2x backing store keeps the actual-size glyphs crisp in the 1080p frame.
    canvas.width = Math.ceil(width * 2);
    canvas.height = Math.ceil(height * 2);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const cols = Math.ceil(width / cellX),
      rows = Math.ceil(height / cellY);
    const depth = new Float32Array(cols * rows).fill(-Infinity);
    const glyphs = new Uint8Array(cols * rows);
    const materials = new Uint8Array(cols * rows);
    const shades = new Float32Array(cols * rows);
    const palette = ROBIN_PALETTE;
    const phase = t * Math.PI * 5;
    const beat = 0.5 + Math.sin(phase) * 0.5;
    const turn = -0.23 + Math.sin(t * 0.35) * 0.12;
    const cy = Math.cos(turn),
      sy = Math.sin(turn);
    const tilt =
      energy * Math.sin(phase - 0.6) * 0.055 + Math.sin(t * 0.65) * 0.013;
    const ct = Math.cos(tilt),
      st = Math.sin(tilt);
    const scale = height * 0.37 * (1 - energy * 0.075);
    const originX = width * 0.48;
    const originY =
      height * (0.47 - energy * 0.06 + beat * energy * 0.03) +
      Math.sin(t * 1.1) * 2;
    const headTilt =
      Math.sin(t * 0.7) * 0.055 * (1 - energy * 0.5) - energy * 0.05;
    const tailTilt = Math.sin(t * 1.8 + phase * 0.1) * (0.035 + energy * 0.09);
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${cellY * 0.93}px "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const point of points) {
      let { x, y, z, nx, ny } = point;
      const { nz } = point;
      if (point.wing) {
        const angle =
          energy *
            (point.wing > 0 ? -(0.38 + beat * 2.2) : 0.55 + beat * 1.85) +
          point.feather * energy * 0.24;
        const c = Math.cos(angle),
          s = Math.sin(angle),
          dx = x + 0.14,
          dy = (y - 0.18) * (1 + energy * 0.18);
        x = -0.14 + dx * c - dy * s;
        y = 0.18 + dx * s + dy * c;
        z += energy * point.wing * 0.22;
        const oldNx = nx;
        nx = nx * c - ny * s;
        ny = oldNx * s + ny * c;
      }
      if (point.part === "head" || point.part === "tail") {
        const head = point.part === "head";
        const angle = head
          ? headTilt
          : tailTilt + point.feather * energy * 0.07;
        const px = head ? 0.11 : -0.35,
          py = head ? 0.31 : -0.28;
        const c = Math.cos(angle),
          s = Math.sin(angle),
          dx = x - px,
          dy = y - py;
        x = px + dx * c - dy * s;
        y = py + dx * s + dy * c;
        const oldNx = nx;
        nx = nx * c - ny * s;
        ny = oldNx * s + ny * c;
      }
      if (point.part === "legs") {
        y = -0.51 + (y + 0.51) * (1 - energy * 0.62);
        x += energy * 0.08;
      }
      const tx = x * cy + z * sy,
        tz = -x * sy + z * cy;
      const xx = tx * ct - y * st,
        yy = tx * st + y * ct;
      const perspective = 3.8 / (3.8 - tz);
      const col = Math.round((originX - xx * scale * perspective) / cellX);
      const row = Math.round((originY - yy * scale * perspective) / cellY);
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      const index = row * cols + col;
      if (tz <= depth[index]) continue;
      depth[index] = tz;
      const light = clamp((nx * -0.35 + ny * 0.55 + nz * 0.7 + 1) / 2);
      glyphs[index] = Math.min(
        ramp.length - 1,
        Math.max(
          2,
          Math.floor(
            (0.2 + light * 0.6 + (((point.seed * 73) % 19) / 19) * 0.2) *
              (ramp.length - 1),
          ),
        ),
      );
      materials[index] = point.material;
      shades[index] = 0.56 + light * 0.44;
    }
    for (let material = 0; material < palette.length; material++) {
      ctx.fillStyle = palette[material];
      for (let i = 0; i < glyphs.length; i++) {
        if (!glyphs[i] || materials[i] !== material) continue;
        ctx.globalAlpha = shades[i];
        ctx.fillText(
          ramp[glyphs[i]],
          (i % cols) * cellX,
          Math.floor(i / cols) * cellY,
        );
      }
    }
    ctx.globalAlpha = 1;
    canvas.dataset.frame = String(frame);
  }, [frame, fps, energy, size, timeOffset]);
  return (
    <div style={{ width: size, height: size, ...style }}>
      <canvas
        ref={ref}
        width={Math.ceil(size * 2)}
        height={Math.ceil(size * 2)}
        aria-label="Robyn's original orange-breasted ASCII robin"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export const AsciiBird = Interactive.withSchema({
  Component: BirdInner,
  componentName: "<AsciiBird>",
  schema: {
    energy: {
      type: "number",
      default: 0,
      min: 0,
      max: 1,
      hiddenFromList: false,
      description: "Wingbeat energy",
    },
    size: {
      type: "number",
      default: 800,
      min: 320,
      max: 900,
      hiddenFromList: false,
      description: "Canvas size with the original responsive ASCII density",
    },
  },
  wrapInSequence: true,
});

// One continuous mascot track. Scene transitions never reset its phase or pose.
export const BirdGuide = ({ chapter }: { chapter?: number }) => {
  const localFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Chapter previews use the same clock and path as their place in the master.
  const timeOffset = chapter === undefined ? 0 : [0, ...cuts][chapter];
  const frame = localFrame + timeOffset * fps;
  const t = frame / fps;
  const stops = [
    [1080, 165, 780],
    [1450, 105, 350],
    [420, 610, 350],
    [1440, 630, 370],
    [1390, 108, 420],
    [1500, 585, 350],
    [1080, 165, 780],
  ];
  const keys = [0, ...cuts.flatMap((c) => [c - 0.75, c + 0.7]), 60].map(
    (s) => s * fps,
  );
  const values = [
    stops[0],
    ...cuts.flatMap((_, i) => [stops[i], stops[i + 1]]),
    stops[6],
  ];
  const energy = Math.min(
    1,
    cuts.reduce((v, c) => v + Math.exp(-(((t - c) / 0.55) ** 2)) * 0.96, 0),
  );
  const easing = { ...ease, easing: Easing.bezier(0.65, 0, 0.35, 1) };
  const size = interpolate(
    frame,
    keys,
    values.map((v) => v[2]),
    easing,
  );
  const perchTop = interpolate(
    frame,
    keys,
    values.map((v) => v[1]),
    easing,
  );
  const darkPaper = interpolate(
    t,
    [0, 15.25, 16, 30, 30.5, 46.75, 47.5, 55.5, 56, 60],
    [0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
    ease,
  );
  // Carry clean paper through a flight too: real editor pixels and the dark
  // Robyn card can otherwise swallow the original ink during a wipe.
  const paperOpacity = Math.max(
    darkPaper,
    interpolate(energy, [0.015, 0.12], [0, 1], ease),
  );
  return (
    <div
      style={{
        position: "absolute",
        zIndex: 25,
        pointerEvents: "none",
        left: interpolate(
          frame,
          keys,
          values.map((v) => v[0]),
          easing,
        ),
        // Keep the flight and its paper clear of the persistent chapter header.
        top: Math.max(
          Math.min(perchTop, 140),
          perchTop - Math.sin((energy * Math.PI) / 2) * 95,
        ),
        width: size,
        height: size,
        opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], ease),
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: C.paper,
          opacity: paperOpacity,
        }}
      />
      <AsciiBird
        name="ASCII robin — continuous guide"
        energy={energy}
        size={size}
        timeOffset={timeOffset}
        premountFor={fps}
        style={{ position: "relative" }}
      />
    </div>
  );
};
