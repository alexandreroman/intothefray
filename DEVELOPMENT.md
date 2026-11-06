# Development

How to build, run, test and deploy Into the Fray. For what the app does,
see the [README](README.md).

## Prerequisites

- Go 1.27 or later
- Docker (or Podman) with Compose, to run Redis and Caddy locally
- [Air](https://github.com/air-verse/air) for hot reload
- [golangci-lint](https://golangci-lint.run/) v2 for static checks
- Node.js and [pnpm](https://pnpm.io/) at the versions pinned in
  `mise.toml` (`mise install` with [mise](https://mise.jdx.dev/))

## Local stack

```bash
make dev
```

`make dev` starts Redis and Caddy in containers, installs the web
dependencies, then runs the Go server under Air and the web build in
watch mode. Open <http://localhost:8080>: Caddy serves `web/dist` and
proxies `/api/*` and `/ws/*` to the server on port 9000. The server
reloads on save; the web app is rebuilt on save, without hot module
replacement, so reload the page.

`make app-up` runs the same stack fully in containers, on the same ports:
stop one before starting the other. Redis and the server are published on
`127.0.0.1` only; the web port listens on every interface, so a phone on
the local network can open the app. With Podman, pass
`COMPOSE="podman compose"` to `make` unless its `docker` command is set
up.

## Make targets

Run `make` to list them all. The common ones:

```bash
make dev          # Redis + Caddy in containers, Air, web build
make test         # Go tests with the race detector
make check        # tests, web-check, then golangci-lint
make web-install  # install the web dependencies (needed by check)
make web-check    # svelte-check, ESLint + Prettier, Vitest
make web-build    # production build into web/dist/
make build        # bin/intothefray
make sources      # card image sources, packs/images/sources.json
make packs        # card packs in packs/dist/
make infra-down   # stop Redis and Caddy
make app-up       # build the web app, then run the whole stack
make app-down     # stop and remove the containerised stack
```

`pnpm bench` in `web/` times the table redraw after a server update
(`BENCH_CARDS` sets the card count, 120 by default).

## Configuration

| Variable          | Description                | Default                    |
| ----------------- | -------------------------- | -------------------------- |
| `PORT`            | Server HTTP port           | `9000`                     |
| `REDIS_URL`       | Redis connection           | `redis://localhost:6379/0` |
| `ALLOWED_ORIGINS` | Cross-origin frontends     | empty                      |
| `GAME_TTL`        | Idle game expiry           | `24h`                      |
| `MARVELCDB_URL`   | Deck source                | `https://marvelcdb.com`    |
| `WEB_PORT`        | Local web port (Caddy)     | `8080`                     |
| `REDIS_PORT`      | Local Redis host port      | `6379`                     |
| `VITE_API_URL`    | API origin, web build only | same origin                |
| `APP_INSTANCE`    | Instance name in tab title | empty                      |
| `SITE_URL`        | Site URL, web build only   | `https://intothefray.xyz`  |

`ALLOWED_ORIGINS` is a comma-separated list of `scheme://host[:port]`
origins; same-origin requests always pass. `SITE_URL` is the absolute
URL of the web app, base path included, with no trailing slash; the build
writes it into the share previews, `robots.txt` and `sitemap.xml`. Set
variables in `.env`, or in `.env.local` for the development targets
only.

## Card packs

`make packs` fetches the card data (marvelcdb, completed by mc4db, and
Cerebro) and the French names (mc4db, fr.marvelcdb, cgbuilder), caches
them in `packs/.cache`, merges the hand-written files of
`packs/curated/`, and writes `packs/dist/`. Commit the regenerated files
with the change that caused them; never edit `packs/dist/` by hand.

Card images are served from `https://img.intothefray.xyz`.
`make sources` lists the candidate images of every face in
`packs/images/sources.json`; `packs/images/manifest.json` gives each face
its image URLs on the CDN. `make packs` fails without the manifest and
drops a card that has a face without an English image. Its report lists
the French coverage and the records taken from mc4db. The merging rules
are documented in `internal/packgen/`; the curated formats in
`internal/packgen/curated/`.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`,
with three jobs: `go` (build, race tests, golangci-lint), `web`
(svelte-check, ESLint, Prettier, Vitest, build) and `docker` (image
build, `compose.yaml` and Caddyfile validation). It does not regenerate
`packs/dist/`.

## Deployment

On `main` (a push, or a manual run of `ci.yml` to republish), once the
checks pass:

1. `publish` pushes `ghcr.io/alexandreroman/intothefray`, tagged with the
   commit SHA and `main`;
2. `pages` deploys the web app to GitHub Pages at
   `https://intothefray.xyz`;
3. `deploy-backend` asks the
   [intothefray-infra](https://github.com/alexandreroman/intothefray-infra)
   repository to deploy that image on the VPS at
   `https://api.intothefray.xyz`.

Repository settings: Pages source set to GitHub Actions with the custom
domain `intothefray.xyz`; the `API_URL` variable
(`https://api.intothefray.xyz`, required by the Pages build); the
`INFRA_DISPATCH_TOKEN` secret, a fine-grained token with Contents read
and write on `intothefray-infra` only (without it, the backend deployment
is skipped with a warning). The GHCR package is public. The backend runs
with `ALLOWED_ORIGINS=https://intothefray.xyz`.

`GET /api/version` and the Options screen report the commit of the
server and of the app, so a mismatch between the two shows at once.

### Pages and share previews

Link previews and search engines do not run the app, so the web build
(`web/seo.ts`) writes their tags (title, description, Open Graph,
Twitter card, robots) into the static files, from the page metadata of
`web/src/lib/pages.ts`:

| File           | Served for                    | Content                 |
| -------------- | ----------------------------- | ----------------------- |
| `index.html`   | `/`                           | home preview, indexed   |
| `g/index.html` | a game, `/g/?id=<id>`         | invite preview, noindex |
| `404.html`     | any other URL (`/about`, ...) | home preview            |
| `robots.txt`   | `/robots.txt`                 | allows all, sitemap URL |
| `sitemap.xml`  | `/sitemap.xml`                | the home page           |

GitHub Pages has no rewrite: it answers any other URL with `404.html`, a
404 response that still starts the app, which then shows the route. The
home page alone has a canonical URL and JSON-LD; the files served at many
URLs have none, so a preview keeps the link shared. CI sets `SITE_URL` to
the Pages site URL from `actions/configure-pages`. The local Caddy
follows the same rules, except that other URLs get `index.html` with a
200. Search engines read `robots.txt` at the root of a domain only.

The share images, `web/public/og/home.png` and `invite.png`
(1200×630), and `web/public/apple-touch-icon.png` (180×180) are
screenshots of the HTML pages in `web/images/`, which are not published.
After a change to one of them, render it again with headless Chrome
(`chrome` stands for the Chrome or Chromium binary), here the home
image:

```bash
cd web
chrome --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1200,630 --virtual-time-budget=5000 \
  --screenshot=public/og/home.png "file://$PWD/images/home.html"
```

`invite.html` gives `public/og/invite.png` the same way;
`touch-icon.html` gives `public/apple-touch-icon.png` with
`--window-size=180,180`. The pages load the Archivo font from Google
Fonts, so render them online.

`web/public/favicon.ico` (16, 32 and 48 px) is served at `/favicon.ico`,
where crawlers look for a favicon by default; the pages declare
`favicon.svg` only. After a change to `favicon.svg`, render it again with
headless Chrome and ImageMagick (`magick`):

```bash
cd web
chrome --headless=new --disable-gpu --hide-scrollbars \
  --window-size=512,512 --screenshot=/tmp/favicon.png \
  "file://$PWD/public/favicon.svg"
magick /tmp/favicon.png -alpha off \
  -define icon:auto-resize=48,32,16 public/favicon.ico
```

Every icon is full-bleed, with no transparent corners: Google crops a
favicon into a circle and fills its transparent pixels with white.

## Architecture

```mermaid
graph TD
    B[Browser: Svelte SPA] -->|static files| P[GitHub Pages]
    B -->|WebSocket + REST| S[Go server instances]
    S --> R[(Redis: game state, connection leases, pub/sub)]
    S -->|decks| M[marvelcdb.com API]
    B -->|card images| I[img.intothefray.xyz: Cloudflare R2]
```

The Go instances are stateless and share game state through Redis. The
server embeds every card pack; the web app ships only the pack index and
loads a game's cards from `GET /api/games/{id}/cards`. The module map is
in [CLAUDE.md](CLAUDE.md#modules).
