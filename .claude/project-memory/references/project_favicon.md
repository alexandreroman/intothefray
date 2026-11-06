---
name: "Full-bleed favicon"
description: "One full-bleed icon for tabs and search engines; favicon.ico at the root, rendered from favicon.svg"
type: project
---

# Full-bleed favicon

- One icon serves the browser tab and search engines: `favicon.svg` is a
  full-bleed `#0D111B` square with the mark inside its inscribed circle.
  The PNG icons (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`)
  are full-bleed too: renders of `web/images/touch-icon.html` at 180,
  192 and 512 px.
- `web/public/favicon.ico` (16, 32, 48 px, fully opaque) is rendered from
  `favicon.svg` and served at `/favicon.ico`; `index.html` declares only
  the SVG. The render command is in `DEVELOPMENT.md`.

**Why:** Google crops a favicon into a circle and fills transparent
pixels with white, and crawlers fetch `/favicon.ico` by default
(<https://developers.google.com/search/docs/appearance/favicon-in-search>).

**How to apply:** keep every icon free of transparent corners and keep
the mark within the inscribed circle; regenerate `favicon.ico` after any
change to `favicon.svg`.
