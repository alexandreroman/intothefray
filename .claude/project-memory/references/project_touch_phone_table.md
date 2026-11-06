---
name: "Touch and phone table"
description: "Touch mode: inspector sheet, hold to drag, pinch; tablets: inspector follows the orientation, History sheet, 44 px targets; dock mode on small touch screens: dock, hand carousel, small cards"
type: project
---

# Touch and phone table

- **Touch mode** is `TOUCH_MODE_QUERY` (`(hover: none) and (pointer:
  coarse)`, web/src/lib/screen.ts): phones and tablets. **Dock mode** is
  touch mode on a small screen (`SMALL_SCREEN_QUERY`), `.app.dock-mode`;
  a **tablet** is touch mode outside dock mode, `.app.tablet`. A screen
  whose main pointer is a mouse or a pen never gets either, at any width.
- Touch mode, every size:
  - A tap on a table card, a pile or a token opens the **inspector**
    (`CardSheet.svelte` in a bottom `Sheet`): the card large, its tokens,
    status tabs and modifier badges drawn on its image (`CardCounters`),
    where they change: a tap on one opens a − / + pill. A status's pill
    is − / + like a token's: its tab shows its count ("Tough ×2"), and
    − at 1 removes it.
    A card of a stack shows the whole stack as a carousel on the card's
    line, the neighbours peeking at its sides, each card with its own
    tokens; a swipe or a tap on a neighbour switches the sheet to it.
    The switch changes the column at once (no fade, no row slides). Where
    the column lies beside the card (a tablet's portrait card, every card
    on a tablet on its side, a phone on its side) it takes what the shown
    card's entries need, up to the card's height; where it lies under
    the card it keeps the height of the first switch, so the card does
    not move. Every carousel card keeps its face, image and token
    elements mounted, so nothing reloads. A swipe switches as the middle
    passes the midpoint (6 px slack), not at scroll end; a tap switches
    at once.
    The first menu group shows as big buttons (default in Fray red; laid
    out as [[project_no_lone_button]] says), the rest as rows, submenus as
    drill-down; the action menu's entries without key hints, refused
    entries left out (`visibleEntries`), and no arrows: arrows are drawn
    with a mouse or a pen only. The inspector has no title line: the
    sheet's accessible name gives the name, type and owner, a pile's
    kind and count. It keeps
    its size across submenus: the entries area keeps the main page's
    height. Token, status and modifier entries and the pills keep it
    open; every other entry closes it. Flip keeps it open and turns the
    card over in it (360 ms). Reveal from a deck's inspector keeps it open
    and switches it to the revealed card once the table shows it: the
    sheet first eases to the new size, then the card turns; a refused
    reveal leaves it on the deck. In a turn, the name and the entries show
    the new side from the start, at once (no button fades, no row slides):
    a revealed card's actions replace the deck's as the reveal lands; only
    the face turns, and the layout follows it once edge-on. Its opening,
    closing, drill-down, counters and presses animate (none under reduced
    motion). A tap on a
    raised hand card lifts it to read it, a second one lets it go: the
    fan's cards are played and discarded by drag and drop; the inspector
    serves table cards and piles.
    "Select" enters select mode: taps toggle table cards in the group, a
    pill "N selected · Done" ends it.
  - Every bottom sheet (inspector, hand, history; `Sheet.svelte`) closes
    by a finger swipe down from anywhere on it: past 10 px mostly
    downward it follows the finger, unless the area under the finger is
    scrolled down (that scrolls back up first); sideways and upward moves
    stay the content's (carousels, a hand card dragged up). Let go past
    60 px or flung (> 0.5 px/ms), it closes; else it springs back
    (160 ms). A mouse or a pen drags the grab handle only.
  - A press of a finger or a pen on a table card, pile or marker picks it
    up after a 300 ms
    hold within 10 px (`gestures.ts` `HOLD_MS`, `HOLD_SLOP`; a 10 ms
    vibration); a quicker move scrolls the table. Hand cards drag at once,
    and so does a mouse.
    A second finger lets go of a press that has not moved.
  - A mouse, a trackpad or a pen on a touch-mode screen (an iPad with a
    trackpad, an Apple Pencil) leaves the screen in touch mode. Its hover
    raises the resting hand as on a desktop and takes over a hand a
    finger pinned (the hand follows the pointer from then on), but no
    hand card pops under it, and its click or tap lifts no hand card:
    lifting a card to read it is a finger's tap.
  - On tablets, two fingers pinch-zoom and pan (`touchZoom.ts`) and a
    double tap on an empty spot toggles between 100 % and 150 % (from any
    other zoom it goes to 150 %).
    Pinch and double tap belong to tablets only: phones (dock mode) never
    zoom (no pinch, no double tap, a saved `itf-zoom` ignored), and
    one-finger scrolling stays. The page itself never pinch-zooms on the
    table screen.
  - Card boxes do not focus their filter, so no keyboard pops up.
  - No card preview and no keyboard-shortcuts button (the keys still
    work); the top bar's buttons are 44 px high (`TopBar.svelte`), the
    hero selector's step arrows 44 px wide.
- Tablets (touch mode off dock mode) keep the desktop layout, fitted to a
  finger:
  - The inspector follows the screen's orientation (`SIDEWAYS_QUERY`,
    `(orientation: landscape)`; turning the tablet lays it out again).
    A portrait card lies beside its actions either way, as on a phone on
    its side: the card `min(460px, 70dvh)` high on the left, the main
    buttons and rows (44 px) in one column on its right, the only part
    that scrolls, at most as high as the card, in a sheet at most 760 px
    wide (`Sheet` `wide`, other sheets 480 px).
  - On a tablet on its side every card lies beside its actions, a scheme
    included, at full size: a landscape card as wide as a portrait card
    is high (460 × 329 px), top-aligned, the column about 340 px wide
    and at most the room high. That sheet is as wide as its content
    (`Sheet` `fit`), up to the window less 16 px a side: ≈ 890 × 390 px
    for a main scheme at 1180 × 820.
  - On a tablet upright a scheme lies above its actions: the card on
    top, centred, three quarters as wide as a portrait card is high, the
    actions full width under it, the sheet scrolling as a whole.
  - Wherever the column lies beside the card (dock mode on its side
    too), a column shorter than the card is centred on its height (a
    stack's: on the shown card); a taller one scrolls from its top.
    Submenu pages are centred the same way. A stack follows its main
    card. A face that changes shape (a flip, a scheme revealed from a deck's
    inspector) changes layout once edge-on in its turn; a revealed scheme
    shows as it is, landscape, with no handling of its own.
  - The inspector has one gutter, in every layout (phones too): what
    stands out of the card (status tabs, modifier badges: 6 table units
    at the card's zoom) plus 12 px, ≈ 30 px on a tablet. It sets the
    space between the sheet's edge and the card, between the card and
    its column, between the column and the sheet's edge, and under the
    card (`--gutter` in CardSheet.svelte).
  - Without the history column (a narrow screen), a History button beside
    the floating Undo opens the history sheet dock mode uses
    (`historySheetMode` in Table.svelte); the history column shows on
    wider tablets, as on desktop.
  - On a narrow screen the resting hand drops by the same share of its
    card as on a wide one, so its strip is a finger's target (see
    [[project_hand_sizes]]).
  - The history panel's buttons and the card box's footer and filter are
    44 px high, and the hero selector's avatars have 44 px hit areas, the
    avatars drawn at their own size (`.app.tablet`).
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
    one card as large as the sheet's room allows (upright at most 80 % of
    its width, on its side as high as the sheet), with Play and Discard
    only; a card
    dragged up out of it goes onto the table. It closes when the viewer's
    own Play or Discard empties the hand.
  - A card played or discarded from the hand rises and fades out where it
    was shown: the hand sheet or the dock's hand button
    (`RiseFlight` in motion.svelte.ts, 300 ms).
  - The history opens as a sheet (`HistorySheet.svelte`) from the dock's
    or rail's History button.
  - Dock mode never shows the history panel nor its strip, at any width:
    the table takes the window, the bar's icons 8 px from its right safe
    edge.
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
    instead of the name, then the out-of-play chips right after it,
    left-aligned, so that they line up on the left across rows; a
    scenario deck shows its name, its chips after it. That name takes
    its frame's drawn width less its chips, cut with an ellipsis and a
    tooltip (`--name-fit`). A frame takes, in its row, the width of its
    owner line when the line is wider (`ownerLineWidth` in Surface.svelte,
    the `lineWidths` input of `dockLayout`): what follows starts on the
    first half column past the line and a gap, so no owner line runs
    over another frame, line or card.
  - During a drag the rows lay themselves out as if the dragged unit lay
    in its drop slot (the `preview` input of `dockLayout`): the
    cards after it glide aside (180 ms, none under reduced motion) and
    glide back on a cancel. Markers never travel with the dragged card:
    they anchor, as after the drop, to the card nearest them.
  - The dock zoom is fixed, never above 100 %: it fits in the width the
    widest indent of the rows' frames and piles plus three card slots
    (`dockFitWidth`). Owner lines do not count: a row whose owner line is
    wider than its frame starts its cards further right, and fewer slots
    show past it.
  - A table card's counters take three disjoint regions
    (`dockCounterLayout`, web/src/table/dockCounters.ts), at a fixed
    screen size, numbers 11 px: tokens in a column of touching discs on
    the right edge (bottom-up, damage in the corner; a scheme top-down,
    threat in the corner), statuses as initial chips ("S", "T×2", "R2")
    in a row under the title band from the left, modifiers as whole
    badges ("+1 DEF") in a column up from the bottom-left corner,
    standing out of the left edge only as far as a badge wider than the
    room left of the tokens needs. A full region shows what fits but one,
    then "+N"; the inspector shows them all. The "+N" has no behaviour of
    its own: a tap on it opens the card's inspector, as a tap anywhere
    else on the card does.
- The page has `viewport-fit=cover` and every screen keeps clear of the
  safe areas, its top bar included (the bar's edges follow the content
  column's safe padding). A web app manifest (`display: standalone`,
  `start_url` and `scope` `./`, the site root under the base path) lets
  the app run full screen from the home screen on iOS; its icon opens
  Home, whatever page was added, since a game expires after 24 h. The
  icons' render recipe is in DEVELOPMENT.md (see [[project_favicon]]).

**Why:** designed with the user from phone mockups (direction "camera,
inspector and dock"): on a phone the table text is unreadable and hover
does not exist, so cards are read in the inspector, moved by a hold and
the screen goes to the table. Tablets have the room for the desktop
layout; what they adapt is what a mouse does and a finger cannot (hover
to raise the hand or read the history, small targets), and a sheet up to
760 px wide uses their room to show the card large. Decided with the
user: a tablet's hand cards play by drag and drop; a tablet on its side
has width to spare, and a scheme stacked above its actions ran out of
height there, so every card lies beside its actions; upright, a scheme
reads best above them; the column is centred on the card. Also decided
with the user: touch mode follows the screen's main pointer alone, so a
mouse, trackpad or pen on a touch screen gets no mode of its own (a pen's
hover moving the hand and a pen tap lifting nothing are accepted); the
dock zoom ignores owner lines, a simple fit over a slot more in view;
the "+N" counter opens the inspector like the rest of the card, which
already shows every counter.

**How to apply:** gate every touch behaviour on touch mode and every
phone layout on dock mode, never on width alone; a new card action
reaches touch through `actionsFor` (the inspector reads the menu
entries); a new table overlay stays clear of the top bar
(`--bar-room`), the dock and the safe areas.
