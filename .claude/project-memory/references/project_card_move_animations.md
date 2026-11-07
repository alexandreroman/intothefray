---
name: "Every change of place animates"
description: "Cards travel from origin to destination; hidden cards travel as backs; held-up cards lift, sway and settle"
type: project
---

# Every change of place animates

- Every card the viewer saw that changes place travels from where it was
  to where it went: table spot, the viewer's hand, a pile drawn on the
  table, or the owner frame chip of an out-of-play pile (victory display,
  set-aside), which stands for that pile. A card leaving a chip starts
  as a portrait table card (112×157 units at the zoom) centred on it,
  so it travels at a card's size, never squashed or turned a quarter
  (`measureOrigin` in `motion.svelte.ts`); a card going to a chip
  shrinks into the chip's box and fades out into it, evenly over the
  last 45 % of its flight (`CHIP_FADE_FROM` = 0.55, `PileFlight.fades`),
  for every viewer, single cards and groups alike. A card going to a chip
  that turns over does so first, where it starts, as a table card turned
  over does (360 ms, edge-on half way, held up), then flies to the chip
  (420 ms) and fades out over the last 45 % of that flight (`flipsFirst`,
  `CHIP_FLIP_MS`): turning at the end of its way, it would be all but
  faded out. A card leaving a chip shows at full opacity all along.
- A card the viewer cannot see travels as a back: out of a face-down pile
  it leaves on its back and turns to its face where it lands face up; a
  card that lands face down stays a back. A card taken face down off the
  table into the viewer's hand turns face up there, followed under its
  new id (`freshIdOf` in `animate.ts`). The client only animates what
  the view holds, so nothing leaks.
- A card flying to a pile turns over on its way when it lands on
  another side than it showed (`turnOf` in `animate.ts`): a face-up
  card put on a deck turns face down, a face-down card or a deck's
  hidden top dropped on a discard pile turns face up; a card that
  keeps its side flies as it is; to a chip, it turns over before it
  flies. The same rule holds for every viewer.
- A hand the viewer does not see stays subtle: a card going into it slides
  down and fades out where it was; a card coming out of it rises into its
  pile, or turns face up where it lands on the table.
- At most 5 cards fly between the same two piles in one view (a discard
  shuffled back), the top ones.
- Cards flying onto a pile that shows its cards land in the order they
  lie there, bottom first, so the last to land is the top the pile keeps
  (`inPileOrder` in `animate.ts`): a group discard, Discard X from a deck.
- The diff (`animate.ts` `diffViews`) works from the two views, so undo
  replays the same motions backwards. Only what the views cannot tell
  comes from the new history lines: a card put at the bottom of a deck, a
  shuffle, whether a line is an undo, and the colour of the change glow
  (the actor of the last new line). The client matches the server's
  English wording of those lines (`internal/game/narrate.go` names the
  verbs).
- The viewer's own drop never travels twice (`OwnDrop`): on the table
  or in the hand it already lies where it went (on the table, it settles:
  see below; in dock mode, it slides into its slot: see below); onto a
  pile, each of its cards flies there from where it was let go (its
  landed ghost). A drop that tucks into a stack (`OwnDrop.tucks`) lands
  where it was let go,
  and each of its cards, a carried chain included, slides from its ghost
  to the spot the server lays the chain out at (`move` or `enter` marked
  `dropped`). Another player's drop starts from their ghost. When a
  tucked card leaves a stack, the cards after it slide to their new
  spots for every viewer. Every card tucked into a stack (own or another
  player's drop, played under from a hand or a pile, a carried chain as
  one block; `tuck` on `move` or `enter`, `tucksOf` in `animate.ts`)
  slides in under it in two steps: drawn above the stack, it shifts out
  to half its own size down and to the right of its slot (200 ms, ease-
  out), then, at its own z-index, slides up into the slot beneath the
  stack (200 ms, ease-in-out). The raised z-index lives only in the
  animation. Cards closing a chain's gap, or put back by an undo, slide
  as any move does. Reduced motion keeps only the change glow.
- A card turning over (`flip`) or turning in (`turnIn`, a stage card)
  under a pointer at rest keeps its hover: the ring, the preview and the
  keys follow its new face at once, for every viewer. Edge-on, it is out
  of reach of the pointer, so the rehover after a view and the card's
  `pointerleave` leave it hovered while it turns (`motion.isTurning`).
- Cards feel physical, discreetly. A card held up off the table (dragged,
  turning over, flying) is 6 % larger (`LIFT_SCALE`) and its `.shade`
  falls 5 px down and to the right (`LIFT_SHADE`): the light comes from
  the top left. Both constants live in `motion.svelte.ts`; the drag layer
  hands them to the ghosts' CSS as `--lift-scale` and `--lift-shade`.
- The viewer's own drag ghosts sway with the pointer's horizontal speed
  (`sway.ts`): a spring-damped lean, clockwise to the right, ±6° at most,
  upright again once the pointer rests, each ghost about its own centre
  (groups and stacks alike). A `requestAnimationFrame` loop in
  `DragLayer.svelte` writes `--sway` on the layer, only while the spring
  moves. The sway is local: presence sends nothing for it, and other
  players' ghosts stay upright at their 1.04 lift.
- A dropped ghost stays held up where it landed until the view shows the
  card. A drop on the table then settles (`settle`): 1.06 → 0.98 → 1 over
  220 ms (`SETTLE_MS`), the shade back under it, upright from the ghost's
  lean. A tucked drop, a flight or a slide leaves from the ghost at its
  lifted size.
- In dock mode the flow draws a drop on the table in its slot, not under
  the finger: its ghost lands where it was let go (`landingCorner` in
  `DragLayer.svelte`), and once the view shows it, each of its cards
  (a stack's, a group's, a hand card, a deck's top) slides from its ghost
  into its slot and settles there as one motion (`settles` on the `move`
  or `enter` that `dockMotions` makes of a `settle`; `#slideAndSettle` in
  `motion.svelte.ts`): 345 ms, the slide over `MOVE_MS` (250 ms,
  `MOVE_EASING`), the settle (1.06 → 0.98 → 1, shade back under it) from
  half way through it (`LAND_SETTLES_AT`), upright from the ghost's lean
  over the slide. The slot follows the view, measured where it draws the
  card. Markers, desktops and tablets land on their grid spot.
- In dock mode a card going into one of the viewer's hands (a `draw`
  out of a pile, or a table card taken back by an action, an undo
  included) flies from its pile or spot to where that hand shows
  (`#dockFlight`, `dockLanding` in `motion.svelte.ts`): its own mini on
  the dock's hand button (the last mini past the fourth card), landing
  at the mini's size; on the rail, the avatar; for another of the
  viewer's decks, its hero selector entry. Into an avatar or an entry,
  it shrinks to a portrait card as high as it and fades out over the
  last 45 % of its way (`CHIP_FADE_FROM`). It turns face up on the way
  out of a hidden pile, the draws 70 ms apart (`FLY_STAGGER_MS`), and
  the avatar (or the entry) pulses on each landing: `scale` 1 → 1.12 →
  1, 200 ms. With the hand sheet open on that hand, the copy flies into
  its carousel slot, drawn over the sheet. Until a copy lands, its card
  is in `motion.drawing`: the dock's mini and the sheet's card keep
  their place unseen (opacity), and the dock's count, the sheet's and
  the hero selector badge leave it out, so each count steps up as its
  card lands. No target found, it leaves its pile as another player's
  draw does (`drawAway`).
- A table card turning over (`flip`, `turnIn`) rises to 1.06 at edge-on
  and comes back down; one that slides in the same view is not lifted, as
  both play on `scale`. Copies flying to a pile (not under it) or into the
  hand rise to 1.06 at 45 % of the way.
- A card exhausted or readied on the table tilts to its new angle
  (`tilt`, 180 ms) through the same diff, so a view after a reconnection
  gap, or under reduced motion, plays nothing. The tilt plays on the CSS
  `rotate` property, like the drag sway, apart from the `transform` the
  flip turns, the `translate` a move slides and the `scale` a lift or a
  settle plays on; a card never plays two motions on one property. A
  card that comes onto the table exhausted lands tilted.
- A table pile's count steps aside while an animation plays on the pile,
  and comes back with the final count (see [[project_pile_count_hush]]).

**Why:** decided with the user: players follow what happened
at the table without reading the history, and cards feel physical and
alive without drawing attention, while staying cheap to paint (no filter on
table cards, no box-shadow animation; see [[project_card_paint_cost]]).
On a phone the hand is the dock's button: the cards flying into it, one
after the other, show the hand forming there. With the hand sheet open,
the sheet covers the table: the copy flying into the carousel over it is
the simplest motion that still lands where the card shows.

**How to apply:** a new way for a card to change place needs its motion in
`animate.ts` and `motion.svelte.ts`, reusing the kinds of `Anim` (`move`,
`fly`, `enter`, `draw`, `drawAway`, `under`, `away`, `arrive`, `flip`,
`tilt`, `turnIn`, `reveal`, `shuffle`, `marker`, `glow`, `settle`), the existing
timing constants and `LIFT_SCALE` / `LIFT_SHADE` for a card held up. Reduced
motion keeps only the change glow and the static lift of a drag ghost.
