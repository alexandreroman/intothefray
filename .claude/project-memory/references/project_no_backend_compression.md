---
name: "No compression in the backend"
description: "The Go backend never compresses HTTP or WebSocket traffic; the proxy or CDN in front of it does"
type: project
---

# No compression in the backend

- The Go backend sends every HTTP response uncompressed: no gzip, zstd or
  other `Content-Encoding`, and no `Vary: Accept-Encoding` of its own.
- WebSocket connections keep `coder/websocket`'s default
  `CompressionDisabled` (no permessage-deflate).
- Compression belongs to the infrastructure in front of the backend:
  Caddy `encode` locally, Cloudflare or equivalent in production.
- Caddy suffixes the `ETag` of a reply it compresses (`"…-gzip"`) and
  strips the suffix from `If-None-Match`; Cloudflare weakens it (`W/`).
  Backend `If-None-Match` checks accept the weak form.

**Why:** user decision: compression is an infrastructure concern, handled
once by the proxy or CDN for every route.

**How to apply:** never add a compression middleware, encoder or
permessage-deflate option to the Go server; when a route needs smaller
responses, rely on the proxy and keep ETag checks weak-tolerant.
