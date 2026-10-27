import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Local fonts: preview and export require no font service or network.
void Promise.all([
  loadFont({
    family: "Space Grotesk",
    url: staticFile("fonts/space-grotesk.woff2"),
    weight: "300 700",
  }),
  loadFont({
    family: "Instrument Serif",
    url: staticFile("fonts/instrument-serif.woff2"),
    weight: "400",
  }),
  loadFont({
    family: "Instrument Serif",
    url: staticFile("fonts/instrument-serif-italic.woff2"),
    weight: "400",
    style: "italic",
  }),
]);

export const C = {
  paper: "#e9e8dc",
  ink: "#1b2a20",
  rust: "#cb4c2c",
  muted: "#727b63",
  line: "#1b2a2028",
  pale: "#f5f3e9",
};
export const sans = '"Space Grotesk", sans-serif';
export const serif = '"Instrument Serif", serif';
export const mono = '"Courier New", monospace';
export const ease = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
