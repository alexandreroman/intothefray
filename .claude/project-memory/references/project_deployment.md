---
name: "Deployment architecture"
description: "Frontend on GitHub Pages at intothefray.xyz, backend on an OVH VPS at api.intothefray.xyz, DNS on Cloudflare"
type: project
---

# Deployment architecture

- Frontend: GitHub Pages at `https://intothefray.xyz` (custom domain at the
  root, so the build's base path is `/`). The repository variable `API_URL`
  is `https://api.intothefray.xyz`; `pages.yml` passes it as `VITE_API_URL`.
- Backend: an OVH VPS (Ubuntu 26, 2 GB of RAM) at
  `https://api.intothefray.xyz`, running the Go server and its own Redis
  (in memory, not exposed). `ALLOWED_ORIGINS` is `https://intothefray.xyz`.
- DNS: Cloudflare manages `intothefray.xyz`.
  - The apex points at GitHub Pages DNS-only (grey cloud), so GitHub
    issues and renews its certificate.
  - `api` points at the VPS through the Cloudflare proxy (orange cloud):
    it hides the VPS address, compresses responses (the backend sends
    them uncompressed) and carries the WebSockets (the server pings every
    30 s, below Cloudflare's 100 s idle timeout).
  - SSL mode Full (strict), with a Cloudflare Origin CA or DNS-01 Let's
    Encrypt certificate on the VPS; the VPS firewall accepts 443 from
    Cloudflare's addresses only.
- Memory budget on the 2 GB VPS (measured 2026-10-20): Go server about
  25-50 MB; a game in Redis about 30 KB at start, 350 KB after 1,000
  actions, 700 KB after 3,000 (one seat), two to three times that with
  four seats. Redis gets a `maxmemory` cap (about 512 MB, `noeviction`),
  the Go server `GOMEMLIMIT` (about 256 MiB), and the VPS a swap file.

**Why:** decided 2026-10-20. A path-routed same-origin API on
`intothefray.xyz/api` would need a Cloudflare Worker (Origin Rules cannot
change the origin on the free plan) and the Cloudflare proxy in front of
GitHub Pages, whose certificate renewals fail behind it; a separate `api`
subdomain avoids both, and CORS is already supported.

**How to apply:** keep the frontend talking to the API through
`VITE_API_URL` and the backend's CORS list through `ALLOWED_ORIGINS`;
a single backend instance with its own Redis has no managed-Redis quota,
but the backend stays stateless and portable.
