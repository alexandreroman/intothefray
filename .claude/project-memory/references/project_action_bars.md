---
name: "Action bar organisation"
description: "One order for every action bar, hand without bar, flat pile bars, out-of-play chips on owner frames"
type: project
---

# Action bar organisation

- Every action bar follows one order: main action, then mark (tokens) or
  look, then leave (discard, move), then a "More actions" ⋯ dropdown.
  The first button is the element's default action.
- Cards in play use icon buttons, piles use words; box tiles count as
  cards. Pile labels stay short (Draw X, Top X, Discard X, Search);
  the tooltip says the rest.
- Pile bars:
  - own deck: Draw 1 (W), Draw X (⇧W) │ Top X (L), Search (K) │
    ⋯ Discard X, Shuffle (U);
  - encounter deck: Reveal (R) │ Top X, Search │ ⋯;
  - discard pile: Search │ Shuffle into deck.
- The card bar has no quick token button: tokens and statuses are added
  from the token menu, the keys (D, T, N…) and the token's − / + pill.
- Hand cards have no floating bar: they are played or discarded by
  dragging, P and Backspace. A bar on the fanned hand is unreadable and
  of little use.
- Out-of-play piles (victory display, set-aside) are reached from small
  chips (icon and count) at the right of the owner frame's name line:
  the villain frame shows the victory display and the scenario's
  set-aside cards, a player frame that player's set-aside cards. A chip
  opens the Browse box. This is step 8 of the plan, not built yet: until
  then the deck and discard bars open them.

**Why:** UX review of 2026-10-20 against DragnCards and OCTGN: the bars
mixed icons and words, moved the same action between elements and hid
frequent actions (Draw X, out-of-play piles) in generic menus.

**How to apply:** the plan, its eight steps and the mockups are in
`docs/superpowers/specs/2026-10-20-action-bars-ux-review.md` (local,
not committed). Build each step only once the user picks it; keep the
spec (§5.3, §5.5, §5.10) in step with what is built.
