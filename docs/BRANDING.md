# Robyn identity

The robin is the shared identity for the homepage, private studio,
editor menu, account screens, browser icons and social preview. Its simplified
silhouette has the same orange breast and downward tail as the original ASCII
sculpture. Keep the small mark simple enough to read at 16px.

The homepage header/footer and social card use the plain wordmark; their large
ASCII bird carries the identity. Application logos and browser icons face right,
toward the workspace. The homepage sculpture continues to face left. Dark studio
headers use natural olive plumage and lighter feet, rather than inverting the
bird to white. The light paper version keeps its forest-coloured body.

- Paper `#e9e8dc`, forest ink `#1b2a20`, rust `#cb4c2c`, olive feather `#7c846c`.
- Space Grotesk wordmark and body; Instrument Serif italic editorial accents.
- `src/config/robin-mark.json` is the geometry/palette source for `RobinMark`
  and the generated favicon, touch icon and reusable public logo.
- `src/config/branding.ts` owns the site name, domain, description and social
  asset references. `social-metadata.ts` supplies consistent Open Graph/X tags.
- `public/brand/robyn-social.png` is a static 1200×630 PNG. The ASCII bird is a
  deterministic still from the actual homepage renderer, with heavier glyphs
  for small link previews. No screenshot of a fake product interface is used.
- `AuthFrame` shares this still and the paper palette across sign-in, recovery
  and invitations. The homepage's animated sculpture is unchanged.
- Orbit graphics inside example artwork remain artwork; navigation uses the robin.

## Regenerating assets

The committed files work without a generation step at build time. Run
`node scripts/generate-brand-assets.mjs <path-to-SpaceGrotesk-500.ttf>` when
changing the source mark or social design. It uses the installed Next/OG,
TypeScript and Sharp packages, plus the bundled Instrument Serif font.

To prepare a static TTF from the existing licensed Space Grotesk variable font,
use Python with `fonttools` and `brotli` installed (a temporary tool environment
is sufficient):

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = TTFont('node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2')
font = instantiateVariableFont(font, {'wght': 500}, inplace=True)
font.flavor = None
font.save('artifacts/qa/branding/SpaceGrotesk-500.ttf')
```

Both font licenses ship in their existing `@fontsource` packages. The generated
images contain rendered glyphs; no new font files are published.

## Search and sharing

The homepage has a unique title/description, canonical robyn.academy URL,
Open Graph and large-image X card with alt text, and WebSite/Organization JSON-LD.
The sitemap includes only the homepage and privacy page. Those pages opt into
indexing; account/private pages inherit `noindex, nofollow`. Robots directives
complement the existing authorization checks and are not an access boundary.

Desktop visual evidence and HTTP metadata verification are saved in
`artifacts/qa/branding/`. Mobile/compact review remains deferred by the user.
