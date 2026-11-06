---
name: "Touch and phone table"
description: "Touch mode: inspector sheet, hold to drag, pinch; dock mode on small touch screens: dock, hand carousel, small cards"
type: project
---

# Touch and phone table

- **Touch mode** is `TOUCH_MODE_QUERY` (`(hover: none) and (pointer:
  coarse)`, web/src/table/touch.ts): phones and tablets. **Dock mode** is
  touch mode on a small screen (`SMALL_SCREEN_QUERY`), `.app.dock-mode`.
  A mouse or a pen never gets either, at any width.
- Touch mode, every size:
  - A tap on a table card, a pile or a token opens the **inspector**
    (`CardSheet.svelte` in a bottom `Sheet`): the card large, its tokens,
    statuses and modifiers with 44 px − / + steppers, the first menu group
    as big buttons (default in Fray red), the rest as rows, submenus as
    drill-down; the action menu's entries without key hints, refused
    entries left out (`visibleEntries`), and no arrows: arrows are drawn
    with a mouse or a pen only. Its header shows the card's name only,
    centred with margins and an ellipsis (a pile's kind with its count);
    the sheet's accessible name also gives the type and owner. It keeps
    its size across submenus: the entries area keeps the main page's
    height. Token, status and modifier entries and the steppers keep it
    open; every other entry closes it. Flip keeps it open and turns the
    card over in it (360 ms). Reveal from a deck's inspector keeps it open
    and switches it to the revealed card once the table shows it: the
    sheet first eases to the new size, then the card turns; a refused
    reveal leaves it on the deck. Its opening, closing, drill-down,
    counters and presses animate (none under reduced motion). A tap on a
    raised hand card opens it with Play and Discard (`handActions`).
    "Select" enters select mode: taps toggle table cards in the group, a
    pill "N selected · Done" ends it.
  - A press on a table card, pile or marker picks it up after a 300 ms
    hold within 10 px (`gestures.ts` `HOLD_MS`, `HOLD_SLOP`; a 10 ms
    vibration); a quicker move scrolls the table. Hand cards drag at once.
    A second finger lets go of a press that has not moved.
  - On tablets, two fingers pinch-zoom and pan (`touchZoom.ts`) and a
    double tap on an empty spot toggles between the fit zoom and the
    readable zoom (100 %, 150 % when the fit is already about 100 %).
    Pinch and double tap belong to tablets only: phones (dock mode) never
    zoom (no pinch, no double tap, a saved `itf-zoom` ignored), and
    one-finger scrolling stays. The page itself never pinch-zooms on the
    table screen.
  - Card boxes do not focus their filter, so no keyboard pops up.
- Dock mode (phones):
  - A dock (`Dock.svelte`) at the bottom, or a 64 px rail on the left on
    a phone on its side, holds the hand button (hero avatar, mini cards,
    the hand count in the count capsule, see [[project_count_capsule]];
    the drop target "back to hand" during a drag), Undo and History, which
    has no badge. No hand fan, no corner bar; the hero selector floats
    above the dock when it lists two entries or more. During a drag the
    hand button is the only hand target: a table card dropped there goes
    to its owner's hand, a hand card goes back.
  - In dock mode the top bar is always visible, never auto-hides and
    takes its own room above the table (right of the rail on a phone on
    its side), below the notch (`TopBar` `autoHide={false}`).
  - The hand opens as a carousel sheet (`HandSheet.svelte`, non-modal):
    one card at 64 % of the width, Play, Discard, More…; a card dragged up
    out of it goes onto the table.
  - The history opens as a sheet (`HistorySheet.svelte`).
  - Sheets and card boxes take the whole screen. The inspector shows the
    card on top (at most 42 % of the height) with its list under it when
    upright, the card beside its list on its side; the hand sheet on its
    side puts its actions beside the carousel; card boxes open full
    screen with a one-line header and a one-row footer.
  - The table is drawn through one projection (web/src/table/dockLayout.ts,
    dockItems.ts, `TableMap` in rows.ts): the desktop layout at 60 %
    (`DOCK_SCALE`); past the row's indent, units (a card with its stack
    and markers, a deck frame with its piles) flow by table order in even
    slots, wrapping under the indent; rows are as tall as their content
    and keep an empty second line; a drop inserts between neighbours,
    placing the shared x so the card sorts there. Positions on the shared
    table never depend on the phone.
  - A row band no seat has, below a seat's row (a card dropped under the
    last player's band), is drawn in the block of the last seat row above
    it, its units flowing after that row's own (`blockRowOf`); a drop
    there inserts in that seat's band. Every seat row keeps its own block,
    even empty; the villain row is never folded.
  - Owner lines show the hero's (villain's) avatar at the chips' height
    instead of the name (scenario decks keep their name); every chip line
    ends on one shared right edge.
  - The dock zoom is fixed: it fits the widest row's indent plus three
    card slots in the width, never above 100 %.
- The page has `viewport-fit=cover` and every screen keeps clear of the
  safe areas; a web app manifest (`display: standalone`) lets a game
  added to the home screen run full screen on iOS.

**Why:** designed with the user from phone mockups (direction "camera,
inspector and dock"): on a phone the table text is unreadable and hover
does not exist, so cards are read in the inspector, moved by a hold and
the screen goes to the table; tablets get the touch interactions and keep
the desktop layout.

**How to apply:** gate every touch behaviour on touch mode and every
phone layout on dock mode, never on width alone; a new card action
reaches touch through `actionsFor` (the inspector reads the menu
entries); a new table overlay stays clear of the top bar
(`--bar-room`), the dock and the safe areas.
