// Original deterministic music and transition foley. No samples, APIs or fees.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const sampleRate = 48000,
  seconds = 60,
  beat = 60 / 96;
const length = sampleRate * seconds;
const left = new Float64Array(length),
  right = new Float64Array(length);
let seed = 37027;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
function add(start, duration, signal, pan = 0) {
  const first = Math.round(start * sampleRate),
    total = Math.round(duration * sampleRate);
  const l = Math.sqrt((1 - pan) / 2),
    r = Math.sqrt((1 + pan) / 2);
  for (let j = 0; j < total; j++) {
    const i = first + j;
    if (i < 0 || i >= length) continue;
    const value = signal(j / sampleRate, j / total);
    left[i] += value * l;
    right[i] += value * r;
  }
}
function pluck(at, midi, amp, pan) {
  const f = hz(midi);
  add(
    at,
    1.7,
    (t) =>
      amp *
      Math.min(1, t * 200) *
      Math.exp(-t * 5.7) *
      (Math.sin(2 * Math.PI * f * t) +
        0.38 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 5) +
        0.16 * Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t * 12)),
    pan,
  );
}
const chords = [
  [48, 55, 59, 62, 64],
  [45, 52, 55, 59, 60],
  [41, 48, 52, 55, 57],
  [43, 50, 53, 57, 60],
];
for (let bar = 0; bar < 24; bar++) {
  const start = bar * beat * 4;
  const chord = chords[Math.floor(bar / 2) % chords.length];
  const intensity = bar < 3 ? 0.65 : bar >= 22 ? 0.65 : 1;
  for (let n = 0; n < chord.length; n++) {
    const frequency = hz(chord[n] + 12);
    add(
      start,
      2.95,
      (t, u) =>
        0.023 *
        intensity *
        Math.sin(Math.PI * u) ** 1.5 *
        (Math.sin(2 * Math.PI * frequency * t) +
          0.45 * Math.sin(2 * Math.PI * frequency * 1.002 * t)),
      (n - 2) / 4,
    );
  }
  for (let step = 0; step < 8; step++) {
    const index = [0, 2, 4, 3, 1, 2, 4, 2][step];
    pluck(
      start + (step * beat) / 2,
      chord[index] + 24,
      0.075 * intensity * (step % 2 ? 0.72 : 1),
      Math.sin(step * 1.6) * 0.5,
    );
  }
  const root = hz(chord[0] - 12);
  add(
    start,
    2.3,
    (t) =>
      0.105 *
      intensity *
      Math.min(1, t * 30) *
      Math.exp(-t * 1.5) *
      (Math.sin(2 * Math.PI * root * t) +
        0.22 * Math.sin(4 * Math.PI * root * t)),
  );
  if (bar >= 3 && bar < 22) {
    for (let b = 0; b < 4; b++) {
      if (b % 2 === 0)
        add(
          start + b * beat,
          0.24,
          (t) =>
            0.13 *
            Math.sin(
              2 * Math.PI * (48 * t + (26 * (1 - Math.exp(-t * 30))) / 30),
            ) *
            Math.exp(-t * 19),
        );
      if (b % 2 === 1)
        add(
          start + b * beat,
          0.15,
          (t) => 0.018 * noise() * Math.exp(-t * 33),
          0.2,
        );
      add(
        start + (b + 0.5) * beat,
        0.065,
        (t) => 0.011 * noise() * Math.exp(-t * 64),
        -0.3,
      );
    }
  }
}
for (const time of [7.5, 16, 29.5, 39, 47.5, 55]) {
  // Soft air, followed by an ascending two-note cue that belongs to the bird.
  add(
    time - 0.42,
    0.8,
    (t, u) => 0.025 * noise() * Math.sin(Math.PI * u) ** 3,
    -0.2,
  );
  for (let c = 0; c < 2; c++)
    add(
      time + c * 0.12,
      0.12,
      (t, u) =>
        0.018 *
        Math.sin(2 * Math.PI * ((1650 + c * 450) * t + 2100 * t * t)) *
        Math.sin(Math.PI * u) ** 2,
      0.35,
    );
}
// A small stereo room, deliberately short enough to leave the typography space.
for (const [delay, gain] of [
  [0.118, 0.17],
  [0.237, 0.1],
  [0.369, 0.06],
]) {
  const offset = Math.round(delay * sampleRate);
  for (let i = length - 1; i >= offset; i--) {
    left[i] += right[i - offset] * gain;
    right[i] += left[i - offset] * gain;
  }
}
let peak = 0,
  squared = 0;
for (let i = 0; i < length; i++) {
  const t = i / sampleRate;
  const fade = Math.min(1, t / 0.5, Math.max(0, (seconds - t) / 1.5));
  left[i] *= fade;
  right[i] *= fade;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  squared += left[i] ** 2 + right[i] ** 2;
}
const rms = Math.sqrt(squared / (length * 2));
const gain = Math.min(0.79 / peak, 0.13 / rms);
const wav = Buffer.alloc(44 + length * 4);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(length * 4, 40);
for (let i = 0; i < length; i++) {
  wav.writeInt16LE(Math.round(left[i] * gain * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(right[i] * gain * 32767), 46 + i * 4);
}
const directory = fileURLToPath(new URL("../public/audio/", import.meta.url));
mkdirSync(directory, { recursive: true });
writeFileSync(directory + "paper-and-wings.wav", wav);
console.log(
  JSON.stringify(
    {
      title: "Paper and Wings",
      seconds,
      sampleRate,
      channels: 2,
      bpm: 96,
      peakDb: 20 * Math.log10(peak * gain),
      rmsDb: 20 * Math.log10(rms * gain),
      bytes: wav.length,
    },
    null,
    2,
  ),
);
