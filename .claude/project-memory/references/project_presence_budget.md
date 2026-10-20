---
name: "Presence message budget"
description: "Presence is throttled to 150 ms with a 3-unit dead zone; events bypass it; spectators send none"
type: project
---

# Presence message budget

Every presence message a client sends costs one Redis PUBLISH on the server,
and the backend may run on Redis Cloud's free tier (100 ops/s). The web client
therefore sends cursor and drag moves at most once per 150 ms
(`PRESENCE_INTERVAL_MS`), holds moves shorter than 3 table units until the
pointer settles, and sends events (ping, preview, cursor leaving, drag start
and end) at once, merged with any waiting move; a drag's end follows its last
move in a message of its own, so the landing ghost sits where the drag ended.
Remote cursors and drag ghosts glide linearly over the same interval when a
message moves them, and follow the table at once when it scrolls, zooms or
resizes. The server refuses all presence from spectators.

**Why:** keep the Redis op rate of a busy table within a small managed tier
while remote cursors still look smooth.

**How to apply:** route any new presence field through `sendPresence` and
classify it as an event or a move; keep the glide duration derived from
`PRESENCE_INTERVAL_MS`, never a hard-coded value.
