---
name: "Compression: HTTP by the proxy, WebSocket by the backend"
description: "Go sends HTTP uncompressed (proxy/CDN compress); WebSockets negotiate permessage-deflate, no context takeover"
type: project
---

# Compression: HTTP by the proxy, WebSocket by the backend

- The Go backend sends every HTTP response uncompressed: no gzip, zstd or
  other `Content-Encoding`, and no `Vary: Accept-Encoding` of its own.
  HTTP compression belongs to the infrastructure in front of the backend:
  Caddy `encode` locally, Cloudflare or equivalent in production.
- Caddy suffixes the `ETag` of a reply it compresses (`"…-gzip"`) and
  strips the suffix from `If-None-Match`; Cloudflare weakens it (`W/`).
  Backend `If-None-Match` checks accept the weak form.
- WebSocket connections negotiate permessage-deflate in
  `CompressionNoContextTakeover` mode, with `coder/websocket`'s default
  512-byte threshold (presence messages stay uncompressed). Proxies do not
  compress WebSocket frames, so the backend does.
- Measured on a four-player game: a view compresses to 14-22 % of its JSON
  size (155 KB to 22 KB after 1,400 actions). Context takeover only gains
  while a view fits the 32 KB deflate window (under about 300 actions) and
  holds about 860 KiB per connection, against about 8 KiB for pooled
  writers.

**Why:** user decision: the proxy or CDN compresses HTTP once for every
route, but neither Caddy nor Cloudflare compresses WebSocket frames, and the
full view sent after every action grows with the log.

**How to apply:** never add an HTTP compression middleware or encoder to
the Go server, and keep ETag checks weak-tolerant; keep the WebSocket
`Accept` in no-context-takeover mode within the VPS memory budget (see
[[project_deployment]]).
