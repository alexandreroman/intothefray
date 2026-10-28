---
name: "Hero selector look and animation"
description: "Hero avatars with hand counts; only the current hero is named; fixed width; 0.3 s slide-in switch"
type: project
---

# Hero selector look and animation

- Each entry of the hero selector is a round avatar of the hero (its art
  through `CardArt`) in a ring of the player's colour, with a badge giving
  the hand size; a deck with no hero yet is a disc of the seat colour.
  Entries are radios named with the full label ("Alex · Spider-Man").
- Only the current entry shows its hero's name, beside its avatar. The
  other entries are greyed (grayscale, dimmed) and take back a little
  colour on hover.
- A switch takes 0.3 s: the ring slides to the new avatar as its colour
  fades, the new name unfolds while the old one folds, and the name text
  slides in from the left (about -18 px) as it fades in, and back out the
  same way. Every name box is as wide as the longest name listed, so the
  selector keeps one width during and after a switch. No motion under
  `prefers-reduced-motion`.
- The ring's place follows the current entry's index (every name before
  it is folded), not a measure taken at the switch, which would find the
  avatars before the names move.
- Keyboard focus rings the focused avatar alone. The selector stays above
  the veil of a raised hand, below the hand itself.

**Why:** designed with the user through mockups: the selector names the
hero in use without growing, and the motion reads as the name coming out
of the avatar.

**How to apply:** see [[project_multi_deck]] for what the selector lists
and selects; the component is `web/src/table/HeroPicker.svelte`.
