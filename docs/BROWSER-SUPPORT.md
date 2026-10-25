# Browser and accessibility baseline

Updated October 25, 2026. The invited studio, all thirteen Crafts and Research are desktop-only. Compact native editors are outside the pilot. The initial entry check requires a viewport of at least 1200 CSS pixels, a fine pointer and hover. It is a presentation check, not proof of GPU/codec support. A temporarily narrowed window preserves an already-open editor and its unsaved state.

| Environment | Evidence / support claim |
| --- | --- |
| Desktop Chromium | Recorded production Craft/Research acceptance and isolated browser regressions. This is the tested baseline |
| User's Chrome Home profile | Intended ordinary Chrome profile; historical startup comparison remains a scoped case. Do not interpret it as failure of every current editor |
| Edge desktop | Intended Chromium-family browser; separate branded-browser acceptance not completed |
| Safari / Firefox / additional GPUs | Unverified. Do not claim native-editor compatibility until the actual round trip passes |
| Chromium mobile emulation | Public homepage/entry presentation recorded at 390 × 844; native editor not mounted on unsupported first entry |
| Physical phones/tablets | Public-site acceptance pending. No native compact-editor claim |

The homepage's recorded axe pass covers that page and those states. It does not certify thirteen native applications or a complete screen-reader workflow. New support/privacy pages are checked separately with the candidate build. Tests must use real UI state transitions, including retained iframe identity and unsaved content, rather than matching implementation text.

Before expanding the baseline, record browser/OS/version, GPU and available graphics/media features, then test: keyboard-only navigation and visible focus; 200% zoom and a narrowed/restored open editor; forced colors/high contrast; reduced motion; screen-reader names/status/error announcements; native Open/Save/Save As/Copy with exact file preservation; media playback/seek after URL expiry; and recovery after a network interruption. Preserve the exact output revision and do not approve paid work just to check presentation.

If an editor cannot initialize on a particular environment, explain the supported desktop setup and offer saved-file download/support. Do not tear down an already-open editor merely because a capability probe or window size changes.
