# Craft refresh acceptance — October 29, 2026

All six final A6 candidates passed official native CLI → actual WASM edit → authenticated local BFF/private Storage immutable save → checked download → native continuation. The parent and editor ran locally in an isolated QA project. These records do not establish CDN deployment, employee LLM continuation or production rollout.

| App | Upstream / adapter | Browser edit and native continuation |
| --- | --- | --- |
| PhotoCraft | 0.17.0 / 0.3.0 | Layer opacity 65% survived saving; native continuation changed it to 40%. Both layers retained. |
| VectorCraft | 0.18.0 / 0.3.0 | Browser added a second rectangle; native continuation added a second ellipse. |
| LightCraft | 0.15.0 / 0.3.0 | Contrast 23 and original PNG bytes survived saving; native clarity 8 retained contrast 23. |
| SoundCraft | 0.14.0 / 0.3.0 | −4 dB and two MIDI notes survived saving; native continuation changed volume to −6 dB. |
| DesignCraft | 0.14.0 / 0.3.0 | Added frame survived; native continuation added another. Two pages and exact editable story retained. |
| FigCraft | 0.12.1 / 0.3.0 | Browser ellipse produced four nodes; native continuation produced five. Original frame retained. |

Each BFF run confirmed one immutable save, checked every stored file hash, finished clean with no pending save, and reported no browser, bridge or asset errors. Five additional filesystem-backed isolated-host loops passed; LightCraft uses its actual BFF loop as the round-trip evidence. [The sanitized hash record](craft-refresh-a6-20261029.json) includes source, patch, core, font, adapter and individually reproduced adapter-input hashes. All six adapters reproduced byte-for-byte from the recorded inputs.

The SolidCraft peer review found no blocking issue. An additional linked-design loop used the frozen final 0.26.1 / 0.1.0 candidate, saved two native files while preserving child bytes, and reopened and continued natively (volume 8125 → 11125 mm³). This extra loop used an isolated filesystem-backed host. The separate actual BFF proof covers five saves, lost Save As acknowledgement recovery, frozen later edits and Copy. [Its sanitized record](solidcraft-linked-review-20261029.json) keeps these scopes distinct.

All recorded screenshots were inspected locally; private screenshots, receipt/reference data and transfer URLs are excluded. Exact patch checks, six browser builds, 20 affected package tests and five shared font tests passed. VectorCraft serves all three fonts compiled at its official release font pin; 30 listed optional faces are absent from that pin and uncompiled.
