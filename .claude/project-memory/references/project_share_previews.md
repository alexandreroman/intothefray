---
name: "Share previews and SEO"
description: "Build-written meta tags; invite /g/?id=<id> answers 200 via g/index.html; share images; about/options SPA-only"
type: project
---

# Share previews and SEO

- Share previews live in static HTML, since preview bots run no JS.
  `web/seo.ts`, a build-only Vite plugin, writes them from
  `web/src/lib/pages.ts` (titles for every route, previews for home,
  game and 404):
  - `index.html`: title, description, canonical, Open Graph,
    `twitter:card` `summary_large_image`, JSON-LD `WebApplication`;
  - `g/index.html`: the invite page, "Join an Into the Fray game",
    `noindex`, no canonical or `og:url`;
  - `404.html`: home title, description and image, no canonical or
    `og:url`, so a shared deep link is not folded into the home page;
  - `robots.txt` (allow all) and `sitemap.xml` (home only).
- The invite link and the in-game address bar are `/g/?id=<id>`, which
  lands on the real file `g/index.html` and answers 200 on GitHub Pages.
- `/about` and `/options` have no page of their own: they reach the SPA
  through `404.html`.
- Absolute URLs come from `SITE_URL`: CI passes the `base_url` of
  `actions/configure-pages`; the default is `https://intothefray.xyz`.
- Share images are 1200×630 PNGs in `web/public/og/` (`home.png`, and
  `invite.png` with a yellow "You're invited" caption), plus
  `apple-touch-icon.png` (180×180). They use the Ink & Signal look with
  the logo mark and no card art. Their HTML sources are in `web/images/`,
  rendered with headless Chrome (command in `DEVELOPMENT.md`).
- The tab title follows the screen: "Into the Fray · Play Marvel
  Champions in your browser", "About · Into the Fray", "Options · Into
  the Fray", "Game · Into the Fray"; `APP_INSTANCE` adds "(name)" after
  "Into the Fray".
- Page text names Marvel Champions and stays an unofficial fan project,
  in line with the About screen's disclaimer.

**Why:** shared links (above all invites) need a rich preview and a 200
response, which GitHub Pages gives only to real files; the user keeps
about and options as SPA screens without pages of their own.

**How to apply:** a new route's tab title goes in `pages.ts`; a change to
the share images re-renders the PNGs from `web/images/`. See
[[project_tech_stack]], [[project_deployment]],
[[project_visual_identity]], [[project_about_screen]].
