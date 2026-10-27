// Original Robyn sculpture, copied from src/components/home/AsciiRobin.tsx.
// Animation is adapted separately to deterministic Remotion frames.
type Part = "body" | "head" | "tail" | "legs";
type Point = {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  material: number;
  wing: number;
  part: Part;
  feather: number;
  seed: number;
};
const TAU = Math.PI * 2;

// Keep the mascot's ink and character vocabulary identical to the homepage.
// Contrast on dark scenes belongs to the background, never a recolored bird.
export const ROBIN_PALETTE = [
  "#626956",
  "#424c3f",
  "#d94b2b",
  "#9b9c81",
  "#1b241d",
  "#fffcef",
  "#101b12",
];
export const ROBIN_RAMP = ".,:;!il+tfLCG08@";

// An original, sampled sculpture. No model, image, video, or remote renderer is loaded.
export function makeRobin(): Point[] {
  const points: Point[] = [];
  function ellipsoid(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    material: number | ((x: number, y: number, z: number) => number),
    count: number,
    tilt = 0,
    wing = 0,
    part: Part = "body",
    feather = 0,
  ) {
    const c = Math.cos(tilt),
      s = Math.sin(tilt);
    for (let i = 0; i < count; i++) {
      const ny = 1 - (2 * (i + 0.5)) / count;
      const r = Math.sqrt(1 - ny * ny),
        a = i * 2.399963229728653;
      const nx = Math.cos(a) * r,
        nz = Math.sin(a) * r;
      const x = nx * rx * c - ny * ry * s + cx,
        y = nx * rx * s + ny * ry * c + cy,
        z = nz * rz + cz;
      points.push({
        x,
        y,
        z,
        nx: nx * c - ny * s,
        ny: nx * s + ny * c,
        nz,
        material: typeof material === "number" ? material : material(x, y, z),
        wing,
        part,
        feather,
        seed: i,
      });
    }
  }
  function line(a: number[], b: number[], material: number, radius = 0.009) {
    for (let i = 0; i <= 80; i++) {
      const u = i / 80;
      for (let j = 0; j < 5; j++)
        points.push({
          x: a[0] + (b[0] - a[0]) * u + radius * Math.cos((j * TAU) / 5),
          y: a[1] + (b[1] - a[1]) * u,
          z: a[2] + (b[2] - a[2]) * u + radius * Math.sin((j * TAU) / 5),
          nx: 0,
          ny: 0.5,
          nz: 0.8,
          material,
          wing: 0,
          part: "legs",
          feather: 0,
          seed: i,
        });
    }
  }
  // Tail, body, rusty bib, and head are sampled separately so the silhouette reads at any density.
  for (let j = 0; j < 5; j++)
    ellipsoid(
      -0.64 - j * 0.035,
      -0.49 - j * 0.018,
      -0.12 + j * 0.044,
      0.066,
      0.43,
      0.025,
      1,
      1000,
      -0.78,
      0,
      "tail",
      (j - 2) / 2,
    );
  ellipsoid(
    -0.02,
    -0.04,
    0,
    0.49,
    0.61,
    0.37,
    (x, y, z) =>
      ((x - 0.32) / 0.37) ** 2 + ((y - 0.2) / 0.48) ** 2 < 1 && z > -0.16
        ? 2
        : y < -0.19
          ? 3
          : 0,
    11500,
    -0.16,
  );
  ellipsoid(
    0.19,
    0.48,
    0.015,
    0.32,
    0.33,
    0.29,
    (x, y, z) => (x > 0.25 && y < 0.59 && z > -0.15 ? 2 : 0),
    6500,
    -0.1,
    0,
    "head",
  );
  // Folded, overlapping flight feathers rotate around each shoulder as the story takes flight.
  for (const side of [-1, 1]) {
    ellipsoid(
      -0.21,
      -0.06,
      0.3 * side,
      0.22,
      0.39,
      0.066,
      1,
      2300,
      -0.37,
      side,
    );
    for (let j = 0; j < 6; j++)
      ellipsoid(
        -0.29 + j * 0.047,
        -0.21 + j * 0.024,
        (0.34 + j * 0.002) * side,
        0.037,
        0.27,
        0.02,
        j % 2 ? 0 : 1,
        480,
        -0.45 + j * 0.033,
        side,
        "body",
        j / 5 - 0.5,
      );
  }
  // A narrow bill and a proper eye keep the character recognisably a robin, even in glyphs.
  for (let i = 0; i < 55; i++) {
    const u = i / 55;
    for (let j = 0; j < 24; j++) {
      const a = (j * TAU) / 24;
      points.push({
        x: 0.45 + 0.24 * u,
        y: 0.47 + Math.cos(a) * 0.047 * (1 - u),
        z: 0.06 + Math.sin(a) * 0.06 * (1 - u),
        nx: 0.3,
        ny: Math.cos(a),
        nz: Math.sin(a),
        material: 4,
        wing: 0,
        part: "head",
        feather: 0,
        seed: i,
      });
    }
  }
  ellipsoid(0.332, 0.587, 0.278, 0.046, 0.046, 0.025, 6, 450, 0, 0, "head");
  ellipsoid(0.345, 0.604, 0.302, 0.012, 0.012, 0.006, 5, 90, 0, 0, "head");
  line([-0.1, -0.51, 0.12], [-0.19, -0.88, 0.13], 4);
  line([0.13, -0.5, 0.08], [0.12, -0.89, 0.12], 4);
  for (const x of [-0.19, 0.12]) {
    line([x, -0.88, 0.13], [x + 0.17, -0.93, 0.16], 4, 0.006);
    line([x, -0.88, 0.13], [x + 0.12, -0.94, 0.24], 4, 0.006);
    line([x, -0.88, 0.13], [x - 0.08, -0.94, 0.09], 4, 0.006);
  }
  return points;
}
