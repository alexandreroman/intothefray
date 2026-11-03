---
name: "Every change of place animates"
description: "Cards travel from origin to destination; hidden cards travel as backs; unseen hands stay subtle"
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
  shrinks into the chip's box.
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
  keeps its side flies as it is. The same rule holds for every viewer.
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
- The viewer's own drop never animates twice (`OwnDrop`): on the table
  or in the hand it already lies where it went; onto a pile, each of its
  cards flies there from where it was let go (its landed ghost). A drop
  that tucks into a stack (`OwnDrop.tucks`) lands where it was let go,
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
- A card exhausted or readied on the table tilts to its new angle
  (`tilt`, 180 ms) through the same diff, so a view after a reconnection
  gap, or under reduced motion, plays nothing. The tilt plays on the CSS
  `rotate` property, apart from the `transform` the flip turns and the
  `translate` a move slides. A card that comes onto the table exhausted
  lands tilted.

**Why:** decided with the user: players follow what happened
at the table without reading the history.

**How to apply:** a new way for a card to change place needs its motion in
`animate.ts` and `motion.svelte.ts`, reusing the kinds of `Anim` (`move`,
`fly`, `enter`, `draw`, `drawAway`, `under`, `away`, `arrive`, `flip`,
`tilt`, `turnIn`, `reveal`, `shuffle`, `marker`, `glow`) and the existing timing
constants. Spec 5.5 ("Every change of place animates") holds the rule.
