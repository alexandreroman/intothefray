---
name: "Action menu organisation"
description: "A click or right click opens the action menu of cards, piles and box tiles; chips open out-of-play piles"
type: project
---

# Action menu organisation

- Table cards in play, piles and box tiles act through their **action
  menu**: a click (no drag) or a right click opens it at the pointer; in
  touch mode a tap shows the same entries in the inspector sheet
  (refused entries left out, no Draw an arrow) and a 300 ms hold picks
  the card up (see [[project_touch_phone_table]]).
  Hover only rings, previews and targets keys; a hovered token shows its
  −/+ pill.
- A click on a token or status disc opens no menu; it shows the −/+ pill.
  In touch mode a tap on it opens the card's inspector. A hovered token's
  pill holds while the pointer stays in the box spanning the token's
  bounding box and the pill (an exhausted card's 15° tilt leaves a gap
  below the pill); out of that box, it goes after the 100 ms linger. In
  touch mode (no hover, coarse pointer) nothing is ever previewed. Under
  a coarse pointer, menu entries, chips and pill buttons have at least
  44 px hit areas.
- The menu's title is an eyebrow in the owner's colour (card type and
  stage, or the pile's owner) above the card name, or the pile kind with
  its count pill, which counts a card revealed on the deck.
- Entries follow one order, separated by group: the default action in
  bold (Exhaust, Draw 1, Reveal, Take top card to hand, Search, Browse…,
  Play on a box tile),
  the rest of the main group, then look actions, "Add a token", "Add a
  status" and "Add a modifier" submenus, Discard and the Move to
  submenu, then "Draw an arrow" for a card in play. Each entry that has
  a key shows it (the modifier entries have none); a refused one is
  greyed with its reason.
- Detach is a touch inspector entry only, for a tucked card in play: in
  the first group right after the default and Flip (a plain tile), no
  key; a mouse or a pen drags the card off its stack instead. The
  inspector passes `TouchOptions` (`sizeOf`) to `actionsFor`, which adds
  it; the mouse menu and the keys call `actionsFor` without them. Never
  for spectators. See [[project_stack_moves]].
- A villain, a main scheme, a side scheme and a player side scheme never
  offer Exhaust (menu, E key, inspector): their default is Flip when they
  have one, else "Change card…". One already exhausted still offers
  Ready. A card whose face is unknown (face down, not in the catalog)
  keeps Exhaust (`canExhaust` in actions.ts).
- Pile entries: own deck Draw 1 (W), Draw X (⇧W), Reveal (R) │ Top X
  (L), Search (K) │ Discard 1 (X or ⌫), Discard X (⇧X), Set aside X │
  Shuffle (U); encounter deck Reveal (R) │ Top X, Search │ Discard 1,
  Discard X, Set aside X │ Shuffle; own discard pile (an own side
  discard pile too) Take top card to hand (H) │ Search (K) │ Shuffle
  into deck; any other discard pile Search, plus Shuffle into deck where
  the viewer may use it. Take top
  card to hand is the own discard pile's default, as Draw 1 is the own
  deck's; it sends `toHand` for the top card, which goes to its owner's
  hand, and is refused (greyed with its reason, left out of the
  inspector) for an encounter card or another player's card, as the
  engine refuses them. In a pile's box a tile offers "Take to hand" on a
  discard pile, "Draw" on a deck. Shuffle is always
  its own last group (`GROUP_SHUFFLE`). Dragging the top of
  an own deck (or the encounter deck) onto its discard pile discards it,
  as Discard 1 does. A deck's top card dropped right over its own deck
  cancels the drag: the deck is outlined as a target and nothing is sent.
  Dropped beside the deck, it is placed on the table; a card lying over
  the deck takes it instead.
  A card dropped on or near its home deck goes on top of it, as Move to ▾
  "Top of deck" does; another deck of its owner takes it only right over
  it (see [[project_discard_destinations]]). Bottom of deck is a Move to
  ▾ entry (B) only, never a drop target.
  Labels are short; only a refused entry has a tooltip (its reason). The
  stage choice reads "Change card…".
- A hero side deck has the own deck's entries, Draw 1 and Draw X drawing
  from it; Reveal only when it hides its top card (Labor, Gift, Weather;
  see [[project_deck_reveal]]); Discard 1 and Discard X only when its
  cards are discarded somewhere: to a side discard pile (Invocation),
  which has a discard pile's entries, or to the deck's bottom (Sense). A
  side card's Move to names its deck ("Top of Sense deck"); a card whose
  deck discards nowhere (Weather, Labor, Gift) has no Discard, and X and
  Backspace do nothing on it (see [[project_discard_destinations]]).
- Set aside X (`asideTop`, no key) moves the top X cards of an own deck
  to its owner's set-aside pile, of the classic encounter deck to the
  scenario's, in one action with one history line ("set aside the top 17
  cards of their deck"); the end state is X "Set aside" moves. Side
  decks and scenario decks have none. The player types X: the table
  computes no "half of the deck" (Balance the Scales).
- Card keys beside the menu: E exhaust, F flip (a stage card with
  several faces too), X discard (Backspace too), H hand, B bottom of
  deck (a side card's side deck), V change card (villain / main
  scheme), A arrow; C stays Confused.
  A card revealed on a deck has no Exhaust (E) and no status or modifier
  entries; it keeps the token submenu and keys; on an own deck, W draws it
  (see [[project_deck_reveal]]).
- Another player's deck or side deck shows "Belongs to …" in its menu
  instead of entries. A click on a selected card opens that card's menu
  and keeps the group selection.
- Hand cards are played by dragging, P, and X or Backspace to discard. On
  touch, a tap on the lowered hand raises and pins it; a tap on a card then
  lifts it to read it (a hand card plays and discards by drag and drop);
  a tap on the table, Esc, a downward swipe, a drop on the
  table or a dialog lowers it. The card a tap lifted goes down as soon
  as a drag of a hand card starts: another card of the fan (reordered
  or played) or the lifted card itself, which lands unselected
  (`lift()` in `interaction.svelte.ts`). A mouse or a pen never selects
  a hand card, so its hover is unaffected.
  In dock mode the hand is a carousel sheet (see
  [[project_touch_phone_table]]).
- A hand card dragged back over its own fan reorders the hand: the fan
  rises, opens a dashed slot where the card would go and draws the card
  at hand size. A hand's only card has no other place in it: the fan
  opens no slot and stays down, and a drop over it sends nothing
  (`ownHandTarget` in `drag.ts`). A hand card over its own hand is never
  shown to the other players.
- Tokens come from the submenus, the keys and the token pill.
- An entry of "Add a token", "Add a status" or "Add a modifier" adds its
  counter and leaves the menu and its submenu open where they are, the
  entry relabelled with the new count ("Damage (3)", "Tough (2)") or
  greyed at the ±99 modifier limit, under the pointer, so the same
  counter goes on again with another click (`ActionItem.staysOpen`, set
  by `counterMenu` and `modifierMenu`). Every other entry closes the
  menu. Escape (the submenu first, then the menu), Tab, a press outside,
  a scroll, a zoom or a resize close it.
- Out-of-play piles (scenario areas, victory display, set-aside) are
  reached from chips
  (icon and count) at the right of the owner frame's name line; an
  empty chip is dimmed and inert.
- Spectators get no card menu, stage cards included: the "Change card…"
  box is for players only and always offers the choice
  (`spectatorActions` returns nothing for cards in play). Public piles
  offer them Browse… only.

**Why:** a UX review against DragnCards and OCTGN; the user chose one
complete, labelled menu per card, pile and box tile. A one-card hand has
nothing to reorder, so its fan offers no place for its card (user
decision). A drag in the hand is a new gesture: the card lifted to be
read drops back into the fan rather than stay popped over it (user
decision). A card often takes several counters at once (damage, threat,
Tough ×2, +2 ATK), so the three counter submenus stay open for another
click, all alike (user decision).

**How to apply:** new actions go into `actionsFor` (keys and menu read
it).
