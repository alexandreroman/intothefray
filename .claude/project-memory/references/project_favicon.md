---
name: "Full-bleed favicon"
description: "One full-bleed icon for tabs and search engines; pages declare favicon.ico (32x32), rendered from favicon.svg, before it"
type: project
---

# Full-bleed favicon

- One icon serves the browser tab and search engines: `favicon.svg` is a
  full-bleed `#0D111B` square with the mark inside its inscribed circle.
  The PNG icons (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`)
  are full-bleed too: renders of `web/images/touch-icon.html` at 180,
  192 and 512 px.
- `web/public/favicon.ico` (16, 32, 48 px, fully opaque) is rendered from
  `favicon.svg` and served at `/favicon.ico`. `index.html`, from which the
  build writes every page, declares it (`sizes="32x32"`) before
  `favicon.svg`. The render command is in `DEVELOPMENT.md`.

**Why:** Google Search results show the favicon cropped to a circle,
with transparent pixels filled with white (seen on this site's rounded
icon), hence one opaque icon. Google Search supports BMP, GIF, ICO, PNG,
JPEG, PPM and TIFF favicons, SVG not among them
(<https://developers.google.com/search/docs/appearance/favicon-in-search>),
so the pages declare the ICO, which also serves browsers without SVG
icons. Of equally fitting icons, the HTML Living Standard has a user
agent use the last one declared
(<https://html.spec.whatwg.org/multipage/links.html#rel-icon>): declared
first and sized 32x32, the ICO leaves the browsers that take SVG on the
SVG.

**How to apply:** keep every icon free of transparent corners and keep
the mark within the inscribed circle; regenerate `favicon.ico` after any
change to `favicon.svg`.
