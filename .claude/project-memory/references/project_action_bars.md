---
name: "Action menu organisation"
description: "A click or right click opens the action menu of cards, piles and box tiles; chips open out-of-play piles"
type: project
---

# Action menu organisation

- Table cards in play, piles and box tiles act through their **action
  menu**: a click (no drag) or a right click opens it at the pointer, a
  tap on touch (a long press opens nothing). Hover only rings, previews
  and targets keys; a hovered token shows its −/+ pill.
- A click or tap on a token or status disc opens no menu; it shows the
  −/+ pill, which a tap pins until a tap elsewhere or Esc. In touch mode
  (no hover, coarse pointer) nothing is ever previewed. Under a coarse
  pointer, menu entries, chips and pill buttons have at least 44 px hit
  areas.
- The menu's title is an eyebrow in the owner's colour (card type and
  stage, or the pile's owner) above the card name, or the pile kind with
  its count pill.
- Entries follow one order, separated by group: the default action in
  bold (Exhaust, Draw 1, Reveal, Search, Browse…, Play on a box tile),
  the rest of the main group, then look actions, "Add a token" and "Add
  a status" submenus, Discard and the Move to submenu, then "Draw an
  arrow" for a card in play. Each entry shows its key; a refused one is
  greyed with its reason.
- Pile entries: own deck Draw 1 (W), Draw X (⇧W) │ Top X (L), Search (K)
  │ Discard 1 (X or ⌫), Discard X (⇧X), Shuffle (U); encounter deck
  Reveal (R) │ Top X, Search │ Discard 1, Discard X, Shuffle; discard pile
  Search │ Shuffle into deck. Dragging the top of an own deck (or the
  encounter deck) onto its discard pile discards it, as Discard 1 does.
  Labels are short; only a refused entry has a tooltip (its reason). The stage
  choice reads "Change card…".
- A hero side deck has the own deck's entries, Draw 1 and Draw X drawing
  from it; Discard 1 and Discard X only when it has a side discard pile
  (Invocation), which has a discard pile's entries. A side card's Move to
  names its deck ("Top of Sense deck"); without a side discard it has no
  Discard, and X and Backspace do nothing on it.
- Card keys beside the menu: E exhaust, F flip, X discard (Backspace
  too), H hand, B bottom of deck (a side card's side deck), V change
  card (villain / main scheme), A arrow; C stays Confused.
- Another player's deck or side deck shows "Belongs to …" in its menu
  instead of entries. A click on a selected card opens that card's menu
  and keeps the group selection.
- Hand cards are played by dragging, P, and X or Backspace to discard. On touch,
  a tap on the lowered hand raises and pins it; a tap on a card then
  selects (lifts) it; a tap on the table, Esc, a downward swipe, a drop on
  the table or a dialog lowers it.
- Tokens come from the submenus, the keys and the token pill.
- Out-of-play piles (victory display, set-aside) are reached from chips
  (icon and count) at the right of the owner frame's name line; an
  empty chip is dimmed and inert.

**Why:** UX review of 2026-10-20 against DragnCards and OCTGN, then the
user's choice that one complete, labelled menu replaces the bars.

**How to apply:** new actions go into `actionsFor` (keys and menu read
it); the review and its steps are in
`docs/superpowers/specs/2026-10-20-action-bars-ux-review.md` (local).
