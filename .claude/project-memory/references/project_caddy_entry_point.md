---
name: "Caddy as the local web server"
description: "Caddy serves web/dist from disk in dev and containers and is the single local entry point"
type: project
---

# Caddy as the local web server

Locally, the web app is served by the official Caddy image (compose
service `web`), straight from `web/dist/` on disk: no web image is built.
Caddy is the single local entry point: it serves the static files and
reverse-proxies `/api/*` and `/ws/*` to the Go server, so the browser
talks to one origin. In `make dev` Caddy is infrastructure, like Redis,
and the frontend is rebuilt by `vite build --watch` (manual page reload,
no HMR). Production is GitHub Pages, cross-origin, with `VITE_API_URL`
and `ALLOWED_ORIGINS`.

**Why:** building an image only to copy static files is weight with no
payoff, and one origin removes the API URL and CORS settings from local
setups. The user accepts a manual reload in dev in exchange for one way
to serve the frontend everywhere.

**How to apply:** keep dev and containers on the same `web/Caddyfile`;
keep `VITE_API_URL` and `ALLOWED_ORIGINS` optional, needed only for
cross-origin deployments; a Vite dev server or a web image is the
user's call.
