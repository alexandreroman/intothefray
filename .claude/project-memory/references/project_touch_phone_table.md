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
    with a mouse or a pen only. Token, status and modifier entries and the
    steppers keep it open; every other entry closes it. Its opening,
    closing, drill-down, counters and presses animate (none under reduced
    motion). A tap on a raised hand card opens it with Play and Discard
    (`handActions`). "Select" enters select mode: taps toggle table cards
    in the group, a pill "N selected · Done" ends it.
  - A press on a table card, pile or marker picks it up after a 300 ms
    hold within 10 px (`gestures.ts` `HOLD_MS`, `HOLD_SLOP`; a 10 ms
    vibration); a quicker move scrolls the table. Hand cards drag at once.
    A second finger lets go of a press that has not moved.
  - Two fingers pinch-zoom and pan (`touchZoom.ts`); a double tap on an
    empty spot toggles between the fit zoom and the readable zoom (100 %,
    150 % when the fit is already about 100 %). The page itself never
    pinch-zooms on the table screen.
  - Card boxes do not focus their filter, so no keyboard pops up.
- Dock mode (phones):
  - A dock (`Dock.svelte`) at the bottom, or a 64 px rail on the left on
    a phone on its side, holds the hand button (hero avatar, mini cards,
    count; the drop target "back to hand" during a drag), Undo and
    History with an unread badge (lines newer than the last seen line's
    time). No hand fan, no corner bar; the hero selector floats above the
    dock when it lists two entries or more. During a drag the hand button
    is the only hand target: a table card dropped there goes to its
    owner's hand, a hand card goes back.
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
  - Every table card and every pile is drawn at 60 % (`DOCK_SCALE`,
    web/src/table/dockPiles.ts), full face, from its top-left corner; each
    owner frame and its piles shrink about the frame's top-left corner, so
    the frame wraps them. The drawn box is the hit area, drop target,
    ghost and flight size. Layout and positions are those of every other
    screen.
  - Until the viewer chooses a zoom, the table fits its content in both
    directions (never above 100 %), upright or on its side.
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
