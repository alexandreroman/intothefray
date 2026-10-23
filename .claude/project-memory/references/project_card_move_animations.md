---
name: "Every change of place animates"
description: "Cards travel from origin to destination; hidden cards travel as backs; unseen hands stay subtle"
type: project
---

# Every change of place animates

- Every card the viewer saw that changes place travels from where it was
  to where it went: table spot, the viewer's hand, a pile drawn on the
  table, or the owner frame chip of an out-of-play pile (victory display,
  set-aside), which stands for that pile.
- A card the viewer cannot see travels as a back: out of a face-down pile
  it leaves on its back and turns to its face where it lands face up; a
  card that lands face down stays a back. A card taken face down off the
  table into the viewer's hand turns face up there. The client only
  animates what the view holds, so nothing leaks.
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
- The diff (`animate.ts` `diffViews`) works from the two views, not from
  history lines (the bottom of a deck aside), so undo replays the same
  motions backwards.
- The viewer's own drop never animates twice (`OwnDrop`): on the table
  or in the hand it already lies where it went; onto a pile, each of
  its cards flies there from where it was let go (its landed ghost).
  Another player's drop starts from their ghost. Reduced motion keeps
  only the change glow.

**Why:** decided with the user on 2026-10-20: players follow what happened
at the table without reading the history.

**How to apply:** a new way for a card to change place needs its motion in
`animate.ts` and `motion.svelte.ts`, reusing the kinds `move`, `fly`,
`enter`, `draw`, `under`, `away`, `arrive`, `flip` and the existing timing
constants. Spec 5.5 ("Every change of place animates") holds the rule.
