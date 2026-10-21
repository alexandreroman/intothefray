---
name: "Presence message budget"
description: "No presence while nobody else watches; 150 ms throttle, 3-unit dead zone; events bypass it; spectators send none"
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

The client sends no presence at all while no other viewer is connected: the
others are the online players of another colour (`PlayerView.online`) and the
connected spectators (`View.spectators`), both filled by the server from a
`game.Audience`. The viewer's own other tabs do not count, as the server never
relays presence to the sender's token. While alone, the session records the
latest cursor, drag and preview and drops pings; when the count of others
rises, it sends that latest state in one message, so a newcomer sees a drag in
progress. A player's first tab opening or last tab closing re-sends every
connection a full view, a cost tied to joins and leaves, not to activity.

**Why:** keep the Redis op rate of a busy table within a small managed tier
while remote cursors still look smooth.

**How to apply:** route any new presence field through `sendPresence` and
classify it as an event or a move, and add it to the latest state the session
records and re-sends to a newcomer; keep the glide duration derived from
`PRESENCE_INTERVAL_MS`, never a hard-coded value.
