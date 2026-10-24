"use client";

import { useEffect, useRef, type RefObject } from "react";

export type FlightState = { progress: number; pointer: number; paused: boolean; reduced: boolean; craft: string; scene: number };
type Part = "body" | "head" | "tail" | "legs";
type Point = { x: number; y: number; z: number; nx: number; ny: number; nz: number; material: number; wing: number; part: Part; feather: number; seed: number };
const TAU = Math.PI * 2;
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

// An original, sampled sculpture. No model, image, video, or remote renderer is loaded.
function makeRobin(): Point[] {
  const points: Point[] = [];
  function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, material: number | ((x: number, y: number, z: number) => number), count: number, tilt = 0, wing = 0, part: Part = "body", feather = 0) {
    const c = Math.cos(tilt), s = Math.sin(tilt);
    for (let i = 0; i < count; i++) {
      const ny = 1 - 2 * (i + .5) / count;
      const r = Math.sqrt(1 - ny * ny), a = i * 2.399963229728653;
      const nx = Math.cos(a) * r, nz = Math.sin(a) * r;
      const x = nx * rx * c - ny * ry * s + cx, y = nx * rx * s + ny * ry * c + cy, z = nz * rz + cz;
      points.push({ x, y, z, nx: nx * c - ny * s, ny: nx * s + ny * c, nz, material: typeof material === "number" ? material : material(x, y, z), wing, part, feather, seed: i });
    }
  }
  function line(a: number[], b: number[], material: number, radius = .009) {
    for (let i = 0; i <= 80; i++) {
      const u = i / 80;
      for (let j = 0; j < 5; j++) points.push({ x: a[0] + (b[0] - a[0]) * u + radius * Math.cos(j * TAU / 5), y: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u + radius * Math.sin(j * TAU / 5), nx: 0, ny: .5, nz: .8, material, wing: 0, part: "legs", feather: 0, seed: i });
    }
  }
  // Tail, body, rusty bib, and head are sampled separately so the silhouette reads at any density.
  for (let j = 0; j < 5; j++) ellipsoid(-.64 - j * .035, -.49 - j * .018, -.12 + j * .044, .066, .43, .025, 1, 1000, -.78, 0, "tail", (j - 2) / 2);
  ellipsoid(-.02, -.04, 0, .49, .61, .37, (x, y, z) => ((x - .32) / .37) ** 2 + ((y - .20) / .48) ** 2 < 1 && z > -.16 ? 2 : y < -.19 ? 3 : 0, 11500, -.16);
  ellipsoid(.19, .48, .015, .32, .33, .29, (x, y, z) => x > .25 && y < .59 && z > -.15 ? 2 : 0, 6500, -.10, 0, "head");
  // Folded, overlapping flight feathers rotate around each shoulder as the story takes flight.
  for (const side of [-1, 1]) {
    ellipsoid(-.21, -.06, .30 * side, .22, .39, .066, 1, 2300, -.37, side);
    for (let j = 0; j < 6; j++) ellipsoid(-.29 + j * .047, -.21 + j * .024, (.34 + j * .002) * side, .037, .27, .020, j % 2 ? 0 : 1, 480, -.45 + j * .033, side, "body", j / 5 - .5);
  }
  // A narrow bill and a proper eye keep the character recognisably a robin, even in glyphs.
  for (let i = 0; i < 55; i++) {
    const u = i / 55;
    for (let j = 0; j < 24; j++) {
      const a = j * TAU / 24;
      points.push({ x: .45 + .24 * u, y: .47 + Math.cos(a) * .047 * (1 - u), z: .06 + Math.sin(a) * .060 * (1 - u), nx: .3, ny: Math.cos(a), nz: Math.sin(a), material: 4, wing: 0, part: "head", feather: 0, seed: i });
    }
  }
  ellipsoid(.332, .587, .278, .046, .046, .025, 6, 450, 0, 0, "head");
  ellipsoid(.345, .604, .302, .012, .012, .006, 5, 90, 0, 0, "head");
  line([-.10, -.51, .12], [-.19, -.88, .13], 4);
  line([.13, -.50, .08], [.12, -.89, .12], 4);
  for (const x of [-.19, .12]) {
    line([x, -.88, .13], [x + .17, -.93, .16], 4, .006);
    line([x, -.88, .13], [x + .12, -.94, .24], 4, .006);
    line([x, -.88, .13], [x - .08, -.94, .09], 4, .006);
  }
  return points;
}

const DAY = ["#626956", "#424c3f", "#d94b2b", "#9b9c81", "#1b241d", "#fffcef", "#101b12"];

export function AsciiRobin({ flight }: { flight: RefObject<FlightState> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return;
    const points = makeRobin();
    let width = 1, height = 1, cols = 1, rows = 1, cellX = 6, cellY = 9;
    let depth = new Float32Array(1), glyphs = new Uint8Array(1), materials = new Uint8Array(1), shades = new Float32Array(1);
    let raf = 0, last = 0, visible = true, dirty = true, clock = 0, previousCraft = "", wasReduced = false;
    let smoothScene: number | undefined, smoothPointer = 0, energy = 0, wingPhase = 0;
    const ramp = ".,:;!il+tfLCG08@";
    function configureGrid() {
      cellX = Math.max(4.2, width / 112);
      cellY = cellX * 1.4; cols = Math.ceil(width / cellX); rows = Math.ceil(height / cellY);
      depth = new Float32Array(cols * rows); glyphs = new Uint8Array(cols * rows); materials = new Uint8Array(cols * rows); shades = new Float32Array(cols * rows);
      ctx!.font = `${cellY * .93}px "Courier New", monospace`;
      ctx!.textAlign = "center"; ctx!.textBaseline = "middle";
      dirty = true;
    }
    function resize() {
      width = canvas!.clientWidth; height = canvas!.clientHeight;
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr); canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      configureGrid();
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) dirty = true; }); intersection.observe(canvas);
    function draw(now: number) {
      raf = requestAnimationFrame(draw);
      if (!visible || document.hidden || now - last < 1000 / 24) return;
      const delta = Math.min(now - last, 60); last = now;
      const { paused, reduced, pointer, craft, scene } = flight.current;
      if (paused && !dirty && reduced === wasReduced) return;
      if (reduced && wasReduced && !dirty && craft === previousCraft) return;
      previousCraft = craft; wasReduced = reduced; dirty = false;
      const dt = delta / 1000;
      if (smoothScene === undefined || reduced) smoothScene = scene;
      // Scroll distance drives the wing cycle; speed supplies lift. Damping gives wheel,
      // trackpad, reverse scrolling and chapter jumps the same soft take-off and landing.
      const travel = (scene - smoothScene) * (1 - Math.exp(-dt * 9));
      smoothScene += travel;
      const velocity = travel / dt;
      const targetEnergy = reduced ? 0 : clamp(Math.abs(velocity) * 1.55);
      energy += (targetEnergy - energy) * (1 - Math.exp(-dt * (targetEnergy > energy ? 8 : 2.8)));
      smoothPointer += (pointer - smoothPointer) * (1 - Math.exp(-dt * 7));
      if (reduced) { energy = 0; wingPhase = 0; smoothPointer = 0; }
      if (!paused && !reduced) {
        clock += dt;
        wingPhase += Math.min(Math.abs(travel), .12) * TAU * 2.2 + dt * energy * TAU * .65;
      }
      const t = reduced ? 0 : clock;
      const drift = reduced ? 0 : smoothScene * .12;
      const direction = reduced ? 0 : clamp(velocity, -1, 1);
      const beat = (.5 + Math.sin(wingPhase) * .5);
      const lift = ease(energy);
      const turn = -.23 + smoothPointer * .16 + (reduced ? 0 : Math.sin(smoothScene * .9) * .25) + direction * .12;
      const cy = Math.cos(turn), sy = Math.sin(turn);
      const tilt = direction * .13 + lift * Math.sin(wingPhase - .6) * .055 + Math.sin(t * .65) * .013;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const scale = Math.min(height * .37, width * .43) * (1 - lift * .075);
      const originX = width * (.48 + Math.sin(smoothScene * Math.PI * 1.5) * lift * .055);
      // Leave room for the tips at the top of an upstroke, even during a fast scroll.
      const originY = height * (.47 - lift * .06 + beat * lift * .03 + Math.sin(smoothScene * TAU) * lift * .015) + Math.sin(t * 1.1) * 2;
      const headTilt = reduced ? 0 : Math.sin(t * .7 + smoothScene * .55) * .055 * (1 - lift * .5) + smoothPointer * .035 - lift * .05;
      const tailTilt = reduced ? 0 : Math.sin(t * 1.8 + wingPhase * .5) * (.035 + lift * .09) - direction * .10;
      const palette = DAY;
      depth.fill(-Infinity); glyphs.fill(0); ctx!.clearRect(0, 0, width, height);

      // A sparse field of characters traces the same scroll trajectory as the sculpture.
      ctx!.fillStyle = "#636b54";
      for (let i = 0; i < 74; i++) {
        const a = i * 2.3999 + drift;
        const radius = .60 + ((i * 13) % 37) / 42;
        const x = originX + Math.cos(a) * scale * radius * 1.13;
        const y = originY - Math.sin(a) * scale * radius * .86;
        ctx!.globalAlpha = .07 + (i % 5) * .022;
        ctx!.fillText(i % 7 === 0 ? "+" : ".", x, y);
      }
      ctx!.globalAlpha = 1;
      drawCraftScenery(ctx!, craft, width, height, reduced ? 0 : smoothScene);
      for (const point of points) {
        let { x, y, z, nx, ny, nz } = point;
        if (point.wing) {
          const angle = lift * (point.wing > 0 ? -(.38 + beat * 2.2) : .55 + beat * 1.85) + point.feather * lift * .24;
          const c = Math.cos(angle), s = Math.sin(angle), dx = x + .14, dy = (y - .18) * (1 + lift * .18);
          x = -.14 + dx * c - dy * s;
          y = .18 + dx * s + dy * c;
          z += lift * point.wing * .22;
          const normalX = nx; nx = nx * c - ny * s; ny = normalX * s + ny * c;
        }
        if (point.part === "head" || point.part === "tail") {
          const head = point.part === "head";
          const angle = head ? headTilt : tailTilt + point.feather * lift * .07;
          const pivotX = head ? .11 : -.35, pivotY = head ? .31 : -.28;
          const c = Math.cos(angle), s = Math.sin(angle), dx = x - pivotX, dy = y - pivotY;
          x = pivotX + dx * c - dy * s; y = pivotY + dx * s + dy * c;
          const normalX = nx; nx = nx * c - ny * s; ny = normalX * s + ny * c;
        }
        if (point.part === "legs") { y = -.51 + (y + .51) * (1 - lift * .62); x += lift * .08; }
        const tx = x * cy + z * sy, tz = -x * sy + z * cy;
        const xx = tx * ct - y * st, yy = tx * st + y * ct;
        const perspective = 3.8 / (3.8 - tz);
        const col = Math.round((originX - xx * scale * perspective) / cellX);
        const row = Math.round((originY - yy * scale * perspective) / cellY);
        if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
        const index = row * cols + col;
        if (tz <= depth[index]) continue;
        depth[index] = tz;
        const light = clamp((nx * -.35 + ny * .55 + nz * .7 + 1) / 2);
        const texture = ((point.seed * 73) % 19) / 19;
        glyphs[index] = Math.min(ramp.length - 1, Math.max(2, Math.floor((.20 + light * .60 + texture * .20) * (ramp.length - 1))));
        materials[index] = point.material;
        shades[index] = .56 + light * .44;
      }
      for (let material = 0; material < palette.length; material++) {
        ctx!.fillStyle = palette[material];
        for (let i = 0; i < glyphs.length; i++) {
          if (!glyphs[i] || materials[i] !== material) continue;
          ctx!.globalAlpha = shades[i];
          ctx!.fillText(ramp[glyphs[i]], (i % cols) * cellX, Math.floor(i / cols) * cellY);
        }
      }
      ctx!.globalAlpha = 1;
      canvas!.dataset.rendered = "true";
      canvas!.dataset.craft = craft;
    }
    resize(); raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); intersection.disconnect(); };
  }, [flight]);

  return <canvas ref={canvasRef} className="ascii-robin" role="img" aria-label="An orange-breasted ASCII robin facing the feature text. It takes flight as you scroll, beats its wings and settles when you stop, with creative tools appearing around it." />;
}

function drawCraftScenery(ctx: CanvasRenderingContext2D, craft: string, width: number, height: number, scene: number) {
  ctx.save(); ctx.fillStyle = "#50674b"; ctx.globalAlpha = .25;
  const glyph = (x: number, y: number, char = "+") => ctx.fillText(char, x * width, y * height);
  const line = (x1: number, y1: number, x2: number, y2: number, char = ".") => {
    const count = Math.ceil(Math.hypot((x2 - x1) * width, (y2 - y1) * height) / 9);
    for (let i = 0; i <= count; i++) glyph(x1 + (x2 - x1) * i / count, y1 + (y2 - y1) * i / count, char);
  };
  const box = (x: number, y: number, w: number, h: number) => { line(x, y, x + w, y, "—"); line(x, y + h, x + w, y + h, "—"); line(x, y, x, y + h, "|"); line(x + w, y, x + w, y + h, "|"); };
  const circle = (x: number, y: number, radius: number, amount = 1) => { for (let i = 0; i < 120 * amount; i++) { const a = i / 120 * TAU; glyph(x + Math.cos(a) * radius, y + Math.sin(a) * radius * width / height, "."); } };
  if (craft === "research") {
    box(.06, .10, .88, .77); line(.06, .18, .94, .18);
    for (let i = 0; i < 3; i++) glyph(.10 + i * .03, .14, "o");
    circle(.18, .30, .07); line(.23, .36, .30, .43, "·");
    for (let i = 0; i < 3; i++) line(.10, .74 + i * .035, .31 - i * .03, .74 + i * .035, "·");
    glyph(.86, .80, "↗");
  } else if (craft === "photocraft") {
    for (const x of [.08, .90]) for (const y of [.13, .86]) { line(x, y, x + (x < .5 ? .10 : -.10), y, "—"); line(x, y, x, y + (y < .5 ? .08 : -.08), "|"); glyph(x, y); }
    line(.08, .89, .90, .89);
  } else if (craft === "lightcraft") {
    circle(.27, .24, .15); circle(.27, .24, .18);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + scene * .05; line(.27 + Math.cos(a) * .21, .24 + Math.sin(a) * .21 * width / height, .27 + Math.cos(a) * .25, .24 + Math.sin(a) * .25 * width / height); }
  } else if (craft === "vectorcraft") {
    for (let i = 0; i <= 100; i++) { const u = i / 100; glyph(.08 + .79 * u, .76 - Math.sin(u * Math.PI) * .62, "."); }
    for (const [x, y] of [[.08, .76], [.47, .14], [.87, .76]]) { glyph(x, y, "◇"); line(x - .08, y, x + .08, y); glyph(x - .08, y, "o"); glyph(x + .08, y, "o"); }
  } else if (craft === "designcraft") {
    box(.09, .08, .82, .81); line(.14, .08, .14, .89); line(.86, .08, .86, .89); line(.09, .16, .91, .16); line(.09, .82, .91, .82);
    for (const x of [.09, .91]) for (const y of [.08, .89]) glyph(x, y);
  } else if (craft === "figcraft") {
    box(.05, .12, .90, .73); line(.05, .19, .95, .19); line(.13, .19, .13, .85);
    for (let i = 0; i < 3; i++) glyph(.09 + i * .03, .155, "o");
    for (let i = 0; i < 6; i++) glyph(.09, .25 + i * .065, i % 2 ? "+" : "□");
  } else if (craft === "filmcraft") {
    for (let i = 0; i < 11; i++) { glyph(.07, .14 + i * .065, "□"); glyph(.93, .14 + i * .065, "□"); }
    line(.07, .88, .93, .88, "="); line(.07, .92, .93, .92); glyph(.1 + (scene % 1) * .8, .90, "▲");
  } else if (craft === "effectcraft") {
    for (let j = 0; j < 4; j++) for (let i = 0; i < 38; i++) { const u = i / 37; glyph(.66 + .31 * u, .20 + j * .12 + Math.sin(u * 2 + scene) * .05, i % 3 ? "." : "+"); }
  } else if (craft === "soundcraft") {
    for (let i = 0; i < 76; i++) { const x = .05 + i / 76 * .9; const amplitude = Math.abs(Math.sin(i * .39 + scene) * Math.cos(i * .17)) * .075; line(x, .84 - amplitude, x, .84 + amplitude, ":"); }
  } else if (craft === "wordcraft") {
    for (let row = 0; row < 6; row++) { const length = row % 3 === 0 ? .34 : .45; line(.07, .76 + row * .026, length, .76 + row * .026, row === 0 ? "=" : "·"); }
    glyph(.08, .15, "{"); glyph(.92, .15, "}"); line(.08, .17, .92, .17);
  } else if (craft === "pdfcraft") {
    line(.16, .08, .73, .08); line(.16, .08, .16, .9); line(.16, .9, .88, .9); line(.88, .9, .88, .19); line(.73, .08, .88, .19); line(.73, .08, .73, .19); line(.73, .19, .88, .19); circle(.82, .76, .045);
  } else if (craft === "deckcraft") {
    box(.04, .22, .92, .92 * width / height * 9 / 16); line(.15, .83, .85, .83);
    for (let i = 0; i < 5; i++) box(.20 + i * .13, .87, .10, .05);
  } else if (craft === "gridcraft") {
    for (let row = 0; row < 5; row++) line(.07, .74 + row * .04, .93, .74 + row * .04);
    for (let col = 0; col < 8; col++) line(.07 + col * .123, .74, .07 + col * .123, .90);
    for (let col = 0; col < 7; col++) glyph(.13 + col * .123, .72, String.fromCharCode(65 + col));
  } else if (craft === "cadcraft") {
    circle(.48, .45, .42); line(.03, .45, .96, .45); line(.48, .06, .48, .90); line(.07, .93, .91, .93, "—"); glyph(.07, .93, "|"); glyph(.91, .93, "|"); circle(.48, .45, .035);
  }
  ctx.restore();
}
