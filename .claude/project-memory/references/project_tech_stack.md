---
name: "Tech stack choices"
description: "Go stateless backend + Redis, Svelte 5 SPA hosted apart on GitHub Pages, and why"
type: project
---

# Tech stack choices

- Backend in Go, stateless and horizontally scalable; Redis (in memory)
  holds every game's state and fans out updates between instances. No
  other database.
- Frontend in TypeScript with Svelte 5 + Vite, built as a static SPA and
  served separately from the backend (GitHub Pages or equivalent), with
  History API path routes (`/`, `/options`, `/g/<id>`) under the build's
  base path. Caddy falls back to `index.html` for app routes; GitHub
  Pages serves a `404.html` copy of it, and the workflow takes the base
  path from `actions/configure-pages`. Routes are path URLs only, with no
  hash routing.
- Real time over WebSocket; clients send intents, the server applies them.

**Why:** Go, Redis, TypeScript and separate static hosting are the user's
requirements; Svelte was picked for fine-grained updates on a table with
many small changes and animations.

**How to apply:** keep the backend free of in-process game state; never
serve the frontend from the Go binary.
