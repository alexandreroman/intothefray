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

**Why:** Google Search results show the favicon cropped to a circle,
with transparent pixels filled with white (seen on this site's rounded
icon). For a document that declares no icon, the HTML Living Standard
lets user agents fetch `/favicon.ico` from the root of its origin
(<https://html.spec.whatwg.org/multipage/links.html#rel-icon>): the root
file answers them.

**How to apply:** keep every icon free of transparent corners and keep
the mark within the inscribed circle; regenerate `favicon.ico` after any
change to `favicon.svg`.
