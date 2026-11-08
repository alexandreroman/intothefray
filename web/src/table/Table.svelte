<!--
  The table page: the top bar, the table column (one surface for everyone,
  scrolling both ways) and the side column (history), which collapses to a
  slim strip. The preview of the hovered card floats in a corner of the play
  area that focus.ts chooses (chooseCorner): the bottom right, above the zoom
  control, unless it would hide the whole hovered element there, and never
  the hero selector's corner; touch mode previews nothing (lib/screen.ts). On a
  narrow screen and in dock mode there is no side column: the dock, or on a
  tablet a History button in the bottom right corner, opens the history in a
  sheet.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import CardArt from '../components/CardArt.svelte';
  import Icon from '../components/Icon.svelte';
  import { modal } from '../components/modal.svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { MediaQuery } from 'svelte/reactivity';
  import TopBar from '../components/TopBar.svelte';
  import { TOP_BAR_HEIGHT } from '../lib/autoHide.svelte';
  import { byId } from '../lib/byId';
  import { gameCards, knownCard, loadGameCards, loadIndex } from '../lib/catalog';
  import { storedLang } from '../lib/lang';
  import { localizedFace, localizedName } from '../lib/localize';
  import { playerColorVar } from '../lib/playerColor';
  import { getPref, setPref } from '../lib/prefs';
  import type { Rect } from '../lib/rect';
  import { pointerBlur } from '../lib/releaseFocus';
  import {
    NARROW_SCREEN_QUERY,
    PHONE_QUERY,
    SHORT_SCREEN_QUERY,
    SMALL_SCREEN_QUERY,
    TOUCH_MODE_QUERY,
  } from '../lib/screen';
  import type { GameSession } from '../lib/session.svelte';
  import type {
    Action,
    CardView as TableCard,
    FaceRef,
    Index,
    LobbyConfig,
    MarkerName,
    PackFace,
    PileView,
    Point,
    Size,
    View,
  } from '../lib/types';
  import { MARKERS, markerPoint } from '../lib/types';
  import { diffViews, dockMotions, MAX_APART_MS } from './animate';
  import {
    actionsFor,
    canExhaust,
    counterName,
    countersOf,
    deckCount,
    handActions,
    isLocked,
    type ActionItem,
    type CountQuestion,
    type LocalAction,
    type TableElement,
    type TouchOptions,
  } from './actions';
  import ArrowHint from './ArrowHint.svelte';
  import Arrows from './Arrows.svelte';
  import AskCount from './AskCount.svelte';
  import type { LocalBox, ShownBox } from './boxes';
  import CardBox from './CardBox.svelte';
  import CardSheet from './CardSheet.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import Dock, { type DockCard } from './Dock.svelte';
  import {
    cardHeader,
    contextItems,
    pileHeader,
    type ContextAction,
    type ContextEntry,
    type ContextHeader,
  } from './contextItems';
  import DragLayer from './DragLayer.svelte';
  import { dockItems, dockRows, frameItemId, markerItemId } from './dockItems';
  import {
    dockFitWidth,
    dockLayout,
    dockShifts,
    type DockLayout,
    type DockPreview,
  } from './dockLayout';
  import { setDockMode } from './dockMode';
  import { DRAG_THRESHOLD, intersect, sourceOf, takesHandDrop } from './drag';
  import Flights from './Flights.svelte';
  import { backCaption, isHidden, pileBack } from './face';
  import Hand from './Hand.svelte';
  import HandSheet from './HandSheet.svelte';
  import HeroPicker, { type HeroEntry } from './HeroPicker.svelte';
  import HistorySheet from './HistorySheet.svelte';
  import { countersFor, stackCardsOf, type SheetCounter, type StackCard } from './inspector';
  import { interaction, LANDING_MS, type PreviewChange } from './interaction.svelte';
  import { handleKey } from './keys';
  import KeysSheet from './KeysSheet.svelte';
  import {
    contentWidth,
    fanOffsets,
    filledHandCard,
    HAND_CARD,
    HAND_CARD_NARROW,
    HAND_PADDING,
    HAND_REST_DROP,
    type HandInsets,
    handRestDrop,
    isLandscape,
    isOutOfPlay,
    chipsByFrame,
    ownerFrames,
    type OwnerFrame,
    PORTRAIT_CARD,
    SLOT_GAP,
    raisedHandCard,
    restingFanWidth,
    restingStrip,
    smallHandCard,
    smallHandDrop,
    surfaceSize,
  } from './layout';
  import {
    lastRow,
    rowOfSeat,
    rowPitch,
    saveViewMode,
    shownItems,
    spreadRows,
    storedViewMode,
    tableMapOf,
    type TableMap,
    VILLAIN_ROW_HEIGHT,
    type ViewMode,
  } from './rows';
  import { motion } from './motion.svelte';
  import { FINE_GRID, TABLET_GRID } from './grid';
  import Presence from './Presence.svelte';
  import {
    areaOf,
    creditedSeat,
    creditedSeatAmong,
    ownerLook,
    ownSeats,
    seatColor,
    seatDeck,
    seatFullLabel,
    seatHero,
    seatOf,
    seatPlayer,
  } from './seats';
  import { tableCard, tablePile } from './screen';
  import { cardsInBand, dragUnits, isFree } from './selection';
  import TokenPill from './TokenPill.svelte';
  import CardPreview, { type Preview } from './CardPreview.svelte';
  import {
    bottomRoom,
    chooseCorner,
    FOCUS_MARGINS,
    HOME,
    TABLE_EDGE,
    TABLE_EDGE_BOTTOM,
    type Corner,
  } from './focus';
  import SidePanel, { NOTHING_TO_UNDO, UNDO_TIP } from './SidePanel.svelte';
  import Surface, { ownerLineWidth, type OwnerBox } from './Surface.svelte';
  import { backUrl } from './theme';
  import { touchZoom } from './touchZoom';
  import ZoomControl from './ZoomControl.svelte';
  import {
    clampZoom,
    fitZoom,
    forgetZoom,
    saveZoom,
    storedZoom,
    ZOOM_MAX,
    ZOOM_MIN,
    ZOOM_MIN_SMALL,
  } from './zoom';

  let {
    session,
    view,
  }: {
    session: Pick<
      GameSession,
      'act' | 'lobby' | 'lastError' | 'presence' | 'sendPresence' | 'viewGap'
    >;
    view: View;
  } = $props();

  // Card names and images in the language chosen in Options, a separate route: read once.
  const lang = storedLang();

  // The cards of the game are loaded once, then card sizes are looked up synchronously.
  // The table belongs to one game: its id never changes while it is shown.
  let catalog = $state<'loading' | 'ready' | 'failed'>('loading');
  loadGameCards(untrack(() => view.id)).then(
    () => (catalog = 'ready'),
    () => (catalog = 'failed'),
  );

  // Once the pool is loaded, every card image of the game is fetched ahead, so that the browser
  // has it cached before the card first shows. At low priority: the images on screen come first.
  // Leaving the table cancels what is still loading; nothing is fetched when the browser asks to
  // save data (navigator.connection is missing from TypeScript's DOM types).
  $effect(() => {
    const { connection } = navigator as { connection?: { saveData?: boolean } };
    if (catalog !== 'ready' || connection?.saveData) {
      return;
    }
    const preloads: HTMLImageElement[] = [];
    for (const face of gameCards().flatMap((card) => card.faces)) {
      const url = localizedFace(face, lang).images[0];
      if (url === undefined) {
        continue;
      }
      const img = new Image();
      img.fetchPriority = 'low';
      img.src = url;
      preloads.push(img);
    }
    return () => {
      for (const img of preloads) {
        img.src = '';
      }
    };
  });

  /** The face a card shows, in the viewer's language; none while hidden or while the catalog loads. */
  function faceOf(card: TableCard | undefined): PackFace | null {
    if (catalog !== 'ready' || !card?.code || isHidden(card)) {
      return null;
    }
    const face = knownCard(card.code)?.card.faces[card.face];
    return face ? localizedFace(face, lang) : null;
  }

  /** The caption of a card's back: its side deck's label, when that deck has its own back. */
  function captionOf(card: TableCard): string | undefined {
    return backCaption(card, piles);
  }

  /** Every face of a card, as the stage choice lists them, in the viewer's language; none while the catalog loads. */
  function facesOf(card: TableCard): PackFace[] {
    if (catalog !== 'ready' || !card.code) {
      return [];
    }
    const faces = knownCard(card.code)?.card.faces ?? [];
    return faces.map((face) => localizedFace(face, lang));
  }

  /** The English name of a card's face, which a card box's filter matches too; none while the catalog loads. */
  function englishName(card: TableCard, face: number): string | undefined {
    if (catalog !== 'ready' || !card.code) {
      return undefined;
    }
    return knownCard(card.code)?.card.faces[face]?.name;
  }

  /** The name of the face a history line names, in the viewer's language; none while unknown. */
  function historyName(ref: FaceRef): string | undefined {
    if (catalog !== 'ready') {
      return undefined;
    }
    const face = knownCard(ref.card)?.card.faces[ref.face];
    return face ? localizedFace(face, lang).name : undefined;
  }

  function sizeOf(card: TableCard): Size {
    return faceOf(card)?.size ?? 'std';
  }

  // The pack index names the scenario and the modular sets of the top bar's crumb.
  let index = $state.raw<Index | null>(null);
  loadIndex().then(
    (loaded) => (index = loaded),
    // Without names, the top bar shows no crumb.
    () => {},
  );

  /** "Rhino / Bomb Scare": the scenario, then its modular sets. */
  function crumbsOf(config: LobbyConfig, names: Index | null): string[] {
    const scenario = names?.scenarios.find((s) => s.id === config.scenario);
    if (!names || !scenario) {
      return [];
    }
    const modulars = config.modulars.map((code) => {
      const set = names.sets.find((s) => s.code === code);
      return set ? localizedName(set, lang) : code;
    });
    return [localizedName(scenario, lang), ...modulars];
  }

  const crumbs = $derived(crumbsOf(view.config, index));

  const cards = $derived(view.table?.cards ?? []);
  const piles = $derived(view.table?.piles ?? []);
  const cardsById = $derived(byId(cards));

  // ---- The viewer's decks ----

  // The viewer's own seats, one per deck; none for a spectator.
  const own = $derived(ownSeats(view));
  // The deck picked in the hero selector, with Q or by dragging a card to its hand, kept while it is
  // still one of the viewer's.
  let pickedDeck = $state<number | null>(null);
  /** The selected deck: its hand shows, and an action on a shared card is credited to it. */
  const selected = $derived(
    pickedDeck !== null && own.includes(pickedDeck) ? pickedDeck : (own[0] ?? null),
  );

  // Ready all has something to ready: an exhausted card on the table, whoever owns it, not locked.
  const canReadyAll = $derived(
    cards.some((card) => card.zone === 'table' && card.exhausted === true && !isLocked(card)),
  );

  function topOf(pile: PileView): TableCard | undefined {
    // While a card taken from a pile is dragged or waits for the server, the pile shows its top card
    // without it; so it does while a card flies to it.
    const taken = interaction.takenFrom(pile.id);
    // A side deck lists its top card alone: once that card is taken, the next one is unknown.
    if (pile.topFaceUp && taken.includes(null)) {
      return undefined;
    }
    // From the top down, the first card neither taken nor flying.
    const listed = pile.cards ?? [];
    for (let i = listed.length - 1; i >= 0; i--) {
      const id = listed[i];
      if (id !== undefined && !taken.includes(id) && !motion.flying.has(id)) {
        return cardsById.get(id);
      }
    }
    return undefined;
  }

  /** What pointing at a pile does to the preview: it shows its top card, and a deck's back clears it. */
  function previewOfPile(pile: PileView): PreviewChange {
    return topOf(pile) ? 'show' : 'clear';
  }

  // ---- What the surface shows ----

  // "All", or the villain's row and one player's row under it (rows.ts).
  let viewMode = $state<ViewMode>(storedViewMode());
  // The player whose row "Villain + player" shows, once picked.
  let pickedSeat = $state<number | null>(null);

  /**
   * Picks a seat, in the hero selector or otherwise: "Villain + player" shows its row, and when it is
   * one of the viewer's decks, that deck is selected. Another player's seat shows no hand and leaves the
   * selected deck, which shared-card actions stay credited to.
   */
  function selectSeat(seat: number): void {
    if (own.includes(seat)) {
      pickedDeck = seat;
    }
    pickedSeat = seat;
  }

  function changeViewMode(mode: ViewMode): void {
    viewMode = mode;
    saveViewMode(mode);
  }

  /** The decks at the table, one per seat, in seat order, each named with its hero and coloured as its seat. */
  const seatedDecks = $derived(
    view.players
      .flatMap((player) => player.decks.flatMap((deck) => (deck.area ? [seatOf(deck.area)] : [])))
      .sort((a, b) => a - b)
      .map((seat) => ({
        seat,
        name: seatFullLabel(view, seat),
        color: seatColor(view, seat) ?? 0,
      })),
  );
  const seats = $derived(seatedDecks.map((deck) => deck.seat));
  // The viewer's selected deck's row first; a spectator starts with the first seat.
  const shownSeat = $derived.by(() => {
    if (pickedSeat !== null && seats.includes(pickedSeat)) {
      return pickedSeat;
    }
    return selected !== null && seats.includes(selected) ? selected : (seats[0] ?? null);
  });

  // "Villain + player", when there is a choice to make: with one player, "All" already shows the
  // villain and that player.
  const focused = $derived(viewMode === 'focus' && seats.length > 1 && shownSeat !== null);

  // The selected deck's hand, unless "Villain + player" shows another player's row: then no hand shows,
  // as for a spectator, while shared-card actions stay credited to the selected deck.
  const handSeat = $derived(
    focused && shownSeat !== null && !own.includes(shownSeat) ? null : selected,
  );
  // The hands shown: with exactly two own decks on a wide screen, both, side by side in seat order,
  // the selected deck's being the active one; else handSeat's alone.
  const handSeats = $derived.by(() => {
    if (handSeat === null) {
      return [];
    }
    return own.length === 2 && !small.current ? [...own].sort((a, b) => a - b) : [handSeat];
  });

  /** The cards of a seat's hand, in its order. */
  function handOf(seat: number): TableCard[] {
    return (view.table?.hands?.[areaOf(seat)] ?? []).flatMap((id) => {
      const card = cardsById.get(id);
      return card ? [card] : [];
    });
  }

  /** "Your hand", or, beside another one, "Your Spider-Man hand". */
  function handLabel(seat: number): string {
    const hero = handSeats.length > 1 ? seatHero(view, seat) : '';
    return hero ? `Your ${hero} hand` : 'Your hand';
  }

  // The hero selector at the bottom left (HeroPicker): in "Villain + player", every seat, its entry
  // picking the row shown; in "All", the viewer's own decks, its entry picking the hand shown. It
  // shows only with two entries or more: a single hero leaves nothing to pick. In dock mode, a card
  // drawn into a deck's hand flies to its entry when no hand shows it: its badge counts it once the
  // card has landed (motion.drawing), as the dock does.
  const pickerEntries = $derived<HeroEntry[]>(
    seatedDecks
      .filter(({ seat }) => focused || own.includes(seat))
      .map(({ seat, name, color }) => {
        const deck = seatDeck(view, seat);
        return {
          seat,
          label: name,
          name: deck?.heroName ?? seatPlayer(view, seat)?.name ?? '',
          image: deck?.heroImage,
          color: playerColorVar(color),
          handCount: (deck?.handCount ?? 0) - (dockMode ? arrivingIn(seat) : 0),
        };
      }),
  );

  /** How many of a seat's hand cards are still flying in (motion.drawing): none for another player's. */
  function arrivingIn(seat: number): number {
    const hand = view.table?.hands?.[areaOf(seat)] ?? [];
    return hand.filter((id) => motion.drawing.has(id)).length;
  }
  const pickerCurrent = $derived(focused ? shownSeat : selected);
  const pickerShown = $derived(pickerEntries.length > 1 && pickerCurrent !== null);
  // The selector's width in px while it shows, bound out of HeroPicker: on a wide screen, the hands
  // keep to the room right of it. Stale once it is gone.
  let pickerWidth = $state(0);

  // Shift + ← / → steps through the selector's heroes; in "All", through the viewer's own decks.
  const canStepHero = $derived(focused || own.length > 1);

  /** Picks the previous or next hero (Shift + ← / →): in the hero selector, else among own decks. */
  function stepHero(step: -1 | 1): void {
    if (focused && shownSeat !== null) {
      stepAmong(seats, shownSeat, step);
    } else if (selected !== null) {
      stepAmong(own, selected, step);
    }
  }

  /** Selects the seat `step` choices after the current one, round the choices. */
  function stepAmong(choices: readonly number[], current: number, step: number): void {
    const index = choices.indexOf(current);
    selectSeat(choices[(index + step + choices.length) % choices.length] ?? current);
  }

  // Out-of-play piles are not drawn: the chips on their owner's frame open them.
  const piledInPlay = $derived(piles.filter((pile) => !isOutOfPlay(pile)));
  const cardsInPlay = $derived(cards.filter((card) => card.zone === 'table'));

  // What lies at a point of the table, drawn where the view mode shows it (tableMap, below);
  // nothing when hidden. A card or pile keeps its drawn copy while it stays the same, so its view
  // does not redraw.
  const shownPiles = shownItems<PileView>();
  const shownCards = shownItems<TableCard>();
  const tablePiles = $derived.by(() => shownPiles(piledInPlay, tableMap));
  const tableCards = $derived.by(() => shownCards(cardsInPlay, tableMap));

  /** The frames around each owner's deck and discard pile, as drawn. */
  const drawnFrames = $derived.by((): OwnerFrame[] => {
    if (dockView === null) {
      return ownerFrames(tablePiles);
    }
    // Laid out with the rest of the table.
    const layout = dockView;
    return ownerFrames(piledInPlay).flatMap((frame) => {
      const box = layout.itemBox(frameItemId(frame));
      return box === null ? [] : [{ ...frame, ...box }];
    });
  });

  /** The image of the current villain's face, the villain frame's avatar in dock mode; null when none shows. */
  const villainImage = $derived.by((): string | null => {
    const stage = view.table?.stages.find((s) => s.villain);
    const villain = stage && cards.find((c) => c.id === stage.current);
    return faceOf(villain)?.images[0] ?? null;
  });

  /**
   * The avatar an owner's frame shows in place of its name in dock mode: the hero's, the
   * current villain's on the villain's frame; none on a scenario deck's frame, which keeps its name.
   */
  function frameAvatar(frame: OwnerFrame): string | null | undefined {
    if (dockView === null || frame.label !== undefined) {
      return undefined;
    }
    if (frame.owner === -1) {
      return villainImage;
    }
    return seatDeck(view, frame.owner)?.heroImage ?? null;
  }

  /** The frames around each owner's deck and discard pile, named after their owner. */
  const owners = $derived.by(() => {
    const chips = chipsByFrame(drawnFrames, piles);
    return drawnFrames.map((frame, i): OwnerBox => {
      const outOfPlay = chips[i] ?? [];
      const { name: ownerName, color } = ownerLook(view, frame.owner);
      const name = frame.label ?? ownerName;
      const owner: OwnerBox = { frame, name, color, outOfPlay };
      const avatar = frameAvatar(frame);
      if (avatar !== undefined) {
        owner.avatar = avatar;
      }
      // Only a seated deck has a hand: neither the villain nor an empty seat.
      const deck = seatDeck(view, frame.owner);
      if (deck) {
        owner.tip = `${deck.handCount} ${deck.handCount === 1 ? 'card' : 'cards'} in hand`;
      }
      return owner;
    });
  });

  // ---- The screen ----

  // The screen sizes of lib/screen.ts, which the @media rules below write out too.
  const narrow = new MediaQuery(NARROW_SCREEN_QUERY);
  const phone = new MediaQuery(PHONE_QUERY);
  const small = new MediaQuery(SMALL_SCREEN_QUERY);
  const touchMode = new MediaQuery(TOUCH_MODE_QUERY);
  // The short case of a small screen (SMALL_SCREEN_QUERY): a phone on its side.
  const short = new MediaQuery(SHORT_SCREEN_QUERY);

  // Dock mode, a phone held either way on a touch screen: the dock (Dock.svelte) stands in
  // for the hand's fan and the controls at the bottom right, and its buttons open the hand and the
  // history in bottom sheets; the hero selector floats beside it. A mouse or a pen never sees it, at
  // any width.
  const dockMode = $derived(touchMode.current && small.current);
  // On a phone on its side, the dock is a rail down the left edge, the table right of it.
  const dockRail = $derived(dockMode && short.current);
  // A tablet: touch mode outside dock mode. The `.app` element carries it as the `tablet` class.
  const tablet = $derived(touchMode.current && !dockMode);
  // The history column beside the table: none on a narrow screen, nor in dock mode at any width,
  // where the dock's History button opens the history sheet.
  const sidePanel = $derived(!narrow.current && !dockMode);
  // A tablet without the history column (touch mode on a narrow screen, not dock mode): a History
  // button beside the floating Undo opens the history sheet dock mode uses, as a finger
  // has no other way to read the history. A mouse window keeps its corner as it is.
  const historySheetMode = $derived(tablet && narrow.current);
  // The cards and piles below read it too: small cards and small piles.
  setDockMode({
    get current() {
      return dockMode;
    },
    get zoom() {
      return zoom;
    },
  });

  // The window's size, in px: a small screen's hand cards follow it.
  let windowWidth = $state(window.innerWidth);
  let windowHeight = $state(window.innerHeight);

  // The interaction state is shared: it previews nothing in touch mode.
  $effect.pre(() => {
    interaction.setTouchMode(touchMode.current);
  });

  // The scroller pads the surface, so that glows, tilted cards and outlines near an edge show: the
  // play area's gutter (--content-gutter), which the top bar's left edge shares.
  const SCROLL_PADDING = 24;

  // On a small screen the top bar floats over the play area (TopBar): the table starts below it, and
  // what floats at the top of the play area keeps clear of it while it shows. Off dock mode it slides
  // away as the table scrolls down; in dock mode it always shows.
  let scrolledAway = $state(false);
  const barHidden = $derived(scrolledAway && !dockMode);
  // The safe area at the top of the screen, in px (the notch of a phone held upright), measured: in
  // dock mode the top bar sits below it.
  let safeTop = $state(0);
  // The top bar's height, in px, with the notch above it in dock mode.
  const barHeight = $derived(TOP_BAR_HEIGHT + (dockMode ? safeTop : 0));
  // The room the bar keeps at the start of the table, and over the top of the play area, in px.
  const barStart = $derived(small.current ? barHeight : 0);
  const barRoom = $derived(small.current && !barHidden ? barHeight : 0);

  // The table's visible size, in px.
  let visibleWidth = $state(0);
  let visibleHeight = $state(0);
  // The scroller's width, its scrollbar included, in px.
  let scrollerWidth = $state(0);

  // ---- Where the rows are drawn ----

  // Declared before the zoom, whose fit reads the rows as drawn as soon as the table starts, and
  // so is what they depend on: the visible height, the resting hand's strip, the controls' height.

  // The hand's base cards, which the resting hand shows: smaller on a narrow screen, and following
  // the window on a small one, where the resting hand drops by as much of them as elsewhere.
  const baseHandCard = $derived.by(() => {
    if (small.current) {
      return smallHandCard({ w: windowWidth, h: windowHeight });
    }
    return narrow.current ? HAND_CARD_NARROW : HAND_CARD;
  });
  // A small screen drops its cards by the same share as a wide one. So does a narrow touch screen:
  // there the resting strip is the target a finger taps to raise the hand, and the
  // desktop drop would leave only 36 px of its smaller cards showing. A mouse raises the hand by
  // hovering it, so a narrow mouse window keeps the desktop drop.
  const baseHandDrop = $derived(
    small.current || (narrow.current && touchMode.current)
      ? smallHandDrop(baseHandCard.h)
      : HAND_REST_DROP,
  );

  // The room between the resting hand's strip and the controls above it on a small screen, in px
  // (controlsBottom).
  const ABOVE_HAND = 8;

  // The height of the controls at the bottom right (the zoom control, the narrow Undo and History),
  // measured: the rows keep clear of them, and the Focus panel at home sits above them.
  let cornerHeight = $state(0);

  // The room under the table's rows, in px: the resting hand's strip, or the controls at the bottom,
  // whichever is higher. Both as whenever the viewer has decks: from own, not handSeats (which
  // controlsBottom follows), so that showing another player's row keeps the rows where they are.
  const restingRoom = $derived(own.length > 0 ? restingStrip(baseHandCard.h, baseHandDrop) : 0);
  const controlsRoom = $derived(
    (small.current && own.length > 0 ? restingRoom + ABOVE_HAND : TABLE_EDGE_BOTTOM) + cornerHeight,
  );

  // The dock's bar at the bottom of the table in dock mode, 8 px off the window's edge and the safe
  // area under it (Dock.svelte), and 8 px over it. The rail leaves the bottom free.
  const DOCK_ROOM = 8 + 60 + 8;
  // The safe area at the bottom of the screen, in px (the home indicator), measured: the dock sits
  // above it.
  let safeBottom = $state(0);
  // The scroller's padding under the surface, in px: the gutter, or the dock's room above the safe
  // area, so that the bottom of the table scrolls out from under the dock.
  const bottomPadding = $derived(dockMode && !dockRail ? DOCK_ROOM + safeBottom : SCROLL_PADDING);
  // The scroller's padding over the surface, in px: the gutter and the top bar's room.
  const topPadding = $derived(SCROLL_PADDING + barStart);

  // In dock mode no hand nor control lies over the table: the rows keep clear of the dock alone.
  const rowsBottom = $derived(dockMode ? bottomPadding : Math.max(restingRoom, controlsRoom));
  // Numbers, so that the row map, which the layers re-measure on, changes only with them.
  const lastDeckRow = $derived(lastRow(piles));
  // On a tablet (touch mode outside dock mode) the villain's row is drawn at its full height: a row of
  // cards fits between the villain's cards and the first player's row, where a finger lays them. A
  // window short of height scrolls. Elsewhere the villain's row takes rowPitch's default minimum.
  const minVillain = $derived(tablet ? VILLAIN_ROW_HEIGHT : undefined);
  // A finger is less precise than a mouse: on a tablet, drops snap to a coarser grid, which the rows
  // and the dots follow (grid.ts).
  const snapGrid = $derived(tablet ? TABLET_GRID : FINE_GRID);
  // The rows spread over the visible height they have, at zoom 1: the villain's row and two players'
  // rows, or a single deck's one, fill it. Zooming out shows more of the table, it does not spread
  // its rows further (rowPitch).
  const pitch = $derived(
    rowPitch(visibleHeight - topPadding - rowsBottom, lastDeckRow, minVillain, snapGrid.step),
  );
  const shownRow = $derived(
    focused && shownSeat !== null ? rowOfSeat(piles, shownSeat) : undefined,
  );
  const rowMap = $derived(spreadRows(pitch, lastDeckRow, shownRow, minVillain));

  // ---- Dock mode's compact, wrapped table ----

  // In dock mode the table is drawn through one projection (dockLayout.ts): the desktop layout at
  // DOCK_SCALE, each row wrapped at the visible width, the rows stacked by their drawn height.
  // Elsewhere the rows are drawn spread (rowMap), every width as it is.

  /** Where each marker lies on the table; none for a marker the table does not have. */
  const markersOnTable = $derived.by(() => {
    const table = view.table;
    const result: Partial<Record<MarkerName, Point>> = {};
    for (const name of MARKERS) {
      const at = table ? markerPoint(table, name) : undefined;
      if (at) {
        result[name] = at;
      }
    }
    return result;
  });
  // Only read in dock mode: the other view modes never lay them out.
  const dockTableItems = $derived(
    dockItems({
      cards: cardsInPlay,
      piles: piledInPlay,
      frames: ownerFrames(piledInPlay),
      markers: markersOnTable,
      sizeOf,
    }),
  );
  // The rows the seats' decks lie in: a row of none is drawn in the block of the last of them above.
  const seatRows = $derived(seats.map((seat) => rowOfSeat(piles, seat)));
  const dockShownRows = $derived(dockRows(dockTableItems, shownRow, seatRows));
  // The width the rows wrap at, in drawn units: what shows of the surface at the zoom. Unmeasured
  // (before the first layout), nothing wraps.
  const wrapWidth = $derived.by(() =>
    visibleWidth > 0 ? (visibleWidth - 2 * SCROLL_PADDING) / zoom : Number.POSITIVE_INFINITY,
  );
  // How far right of its frame's left edge each owner line reaches, by frame id (Surface.svelte):
  // a frame takes as much room in its row when its line is wider. Every frame shows an avatar but
  // a scenario deck's, which shows its name (frameAvatar).
  const lineWidths = $derived.by(() => {
    const frames = ownerFrames(piledInPlay);
    const chips = chipsByFrame(frames, piles);
    return new Map(
      frames.map((frame, i) => {
        const line = { avatar: frame.label === undefined, chips: chips[i]?.length ?? 0 };
        return [frameItemId(frame), ownerLineWidth(line, zoom)];
      }),
    );
  });
  const dockView: DockLayout | null = $derived(
    dockMode
      ? dockLayout({ items: dockTableItems, rows: dockShownRows, seatRows, wrapWidth, lineWidths })
      : null,
  );
  /** Where every layer draws a point of the table, and reads one back: the one map of the table. */
  const tableMap: TableMap = $derived(dockView ?? tableMapOf(rowMap));

  // ---- A drop shown before it is let go ----

  // During a drag in dock mode, the rows are drawn as if the dragged card lay where the drop would
  // put it (DragLayer feeds it): the units after it pushed along, the slot it left closed up. The
  // cards stay placed by tableMap, which the drop reads; each one pushed aside is drawn shifted
  // from there (a translate, which glides), so that nothing is laid out again but the shifts.

  /** The preview DragLayer last fed, with the view it was made on: a newer view shows no preview. */
  let fedPreview = $state.raw<{ preview: DockPreview; view: View } | null>(null);
  /** The view the shifts drawn last were made on: kept once the preview ends, until the next one. */
  let shiftsView = $state.raw<View | null>(null);
  const dockPreview = $derived(fedPreview?.view === view ? fedPreview.preview : null);
  const previewView: DockLayout | null = $derived(
    dockView !== null && dockPreview !== null
      ? dockLayout({
          items: dockTableItems,
          rows: dockShownRows,
          seatRows,
          wrapWidth,
          lineWidths,
          preview: dockPreview,
        })
      : null,
  );
  /** The layout the table shows, the preview's while there is one. */
  const shownDockView = $derived(previewView ?? dockView);
  const NO_SHIFTS: ReadonlyMap<string, Point> = new Map();
  /** How far each item pushed aside is drawn from its place, in drawn units. */
  const shifts: ReadonlyMap<string, Point> = $derived(
    dockView !== null && previewView !== null
      ? dockShifts(
          dockView,
          previewView,
          dockTableItems.map((item) => item.id),
        )
      : NO_SHIFTS,
  );
  // The shifts glide (a CSS transition) from one preview to the next of the same view, and back
  // when the drag ends on it. A new view draws every card at its new place at once, its own motions
  // playing from where they showed (motion.svelte.ts): the shifts it drops jump with it, as the
  // glide goes off in the same change. That holds for the view answering the viewer's own drop too,
  // whose preview ends in the same change: so the glide follows the view the shifts were made on,
  // not the preview still fed. A change of style transitions by its new transition values, so the
  // first preview made on the new view glides again.
  const shiftsGlide = $derived(shiftsView === null || shiftsView === view);

  function feedPreview(preview: DockPreview | null): void {
    if (preview === null) {
      fedPreview = null;
      return;
    }
    fedPreview = { preview, view };
    shiftsView = view;
  }

  // ---- The zoom ----

  // The zoom the viewer chose (buttons, keys, Ctrl + wheel), remembered; null until then, or since
  // the % label went back to the fit on a phone: the table then shows the screen's default zoom.
  let chosenZoom = $state(storedZoom());
  // Dock mode is a phone too, held either way: on its side it is wider than PHONE_QUERY.
  const zoomMin = $derived(phone.current || dockMode ? ZOOM_MIN_SMALL : ZOOM_MIN);

  // Kept free for a vertical scrollbar when fitting. Measured with the scrollbar or without, the
  // fit would make the scrollbar come and go, and the fit with it.
  const SCROLLBAR_ROOM = 12;

  // The zoom that fits the content's width into the scroller, as they are now.
  // On a narrow screen (PHONE_QUERY) the content keeps an empty card slot at its right, which the
  // fit brings into view and the surface keeps, so that a card can be dropped past the last one.
  const NARROW_FREE_SLOT = PORTRAIT_CARD.w + SLOT_GAP;
  const fittedWidth = $derived(
    contentWidth(tableCards, tablePiles, sizeOf) + (phone.current ? NARROW_FREE_SLOT : 0),
  );
  const widthFit = $derived(
    fitZoom(fittedWidth, scrollerWidth - 2 * SCROLL_PADDING - SCROLLBAR_ROOM, zoomMin),
  );
  // In dock mode the fit brings the widest row's indent and three card slots past it into view:
  // the rows wrap at the width that shows and the table scrolls down.
  const dockFit = $derived(
    fitZoom(
      dockFitWidth(dockTableItems, dockShownRows, seatRows),
      scrollerWidth - 2 * SCROLL_PADDING - SCROLLBAR_ROOM,
      zoomMin,
    ),
  );
  const contentFit = $derived(dockMode ? dockFit : widthFit);
  // The fit holds still while the action menu is open, which any zoom change closes
  // (ContextMenu.svelte), and while a card or a pile is pressed or dragged, which a zoom would move
  // from under the finger: a card another player moves meanwhile changes the content's width.
  const fitHeld = $derived(interaction.contextMenu !== null || interaction.held !== null);
  // The fit the table uses: the content's, caught up once nothing holds it. Not a derived, which
  // could not keep its value while held.
  let fittedZoom = $state(untrack(() => contentFit));
  $effect.pre(() => {
    if (!fitHeld) {
      fittedZoom = contentFit;
    }
  });
  // Until the viewer chooses a zoom: a phone fits the content's width, as a row would not show
  // across it at 100 %, and dock mode fits its widest indent and three cards; a wider screen shows
  // 100 % and scrolls. Live: a resize or a turn across 600 px switches between them.
  const defaultZoom = $derived(phone.current || dockMode ? fittedZoom : 1);
  // Dock mode does not zoom (setZoom): it always shows its fit, whatever zoom another screen
  // chose. The surface size follows the zoom, so it is declared before it.
  const zoom = $derived(
    chosenZoom === null || dockMode ? defaultZoom : clampZoom(chosenZoom, zoomMin),
  );

  // What shows of the surface, in table units, rounded down so that an empty table never scrolls.
  const visibleSurface = $derived({
    w: Math.max(0, Math.floor((visibleWidth - 2 * SCROLL_PADDING) / zoom)),
    h: Math.max(0, Math.floor((visibleHeight - topPadding - bottomPadding) / zoom)),
  });
  // In table units, or drawn units in dock mode: at least what shows. Dock mode's reaches as far
  // as its drawn items and the empty slot after each row, and down its drawn rows.
  const surface = $derived.by(() => {
    if (dockView !== null) {
      return {
        w: Math.max(visibleSurface.w, Math.ceil(dockView.width)),
        h: Math.max(visibleSurface.h, Math.ceil(dockView.height)),
      };
    }
    const size = surfaceSize(tableCards, tablePiles, sizeOf, visibleSurface);
    if (!phone.current) {
      return size;
    }
    return { ...size, w: Math.max(size.w, Math.ceil(fittedWidth)) };
  });

  /** Where each marker lies, as the view mode draws it; none for a marker not shown. */
  const markers = $derived.by(() => {
    const result: Partial<Record<MarkerName, Point>> = {};
    for (const name of MARKERS) {
      const at = markersOnTable[name];
      const drawn = at ? tableMap.toDisplay(at, markerItemId(name)) : null;
      if (drawn) {
        result[name] = drawn;
      }
    }
    return result;
  });

  /** The face the preview shows; none for a card back, which tells nothing more on the table. */
  function previewOf(previewed: TableElement | null): Preview | null {
    if (previewed?.kind === 'pile') {
      const pile = byId(piles).get(previewed.id);
      const top = pile && pile.count > 0 ? topOf(pile) : undefined;
      return top ? previewOfCard(top) : null;
    }
    const card = previewed ? cardsById.get(previewed.id) : undefined;
    return card ? previewOfCard(card) : null;
  }

  function previewOfCard(card: TableCard): Preview | null {
    if (isHidden(card)) {
      return null;
    }
    const face = faceOf(card);
    return {
      images: face?.images ?? [],
      name: face?.name ?? '',
      landscape: face ? isLandscape(face.size) : false,
    };
  }

  // From ids, so the preview follows a flip or a pile's new top card. None while a band is drawn
  // over the cards.
  const preview = $derived(interaction.band ? null : previewOf(interaction.previewed));

  // The preview fades in as it shows and out as it goes; another card swaps in at once. While
  // it fades out, the last one stays drawn, out of the accessibility tree, until its fade-out
  // animation ends.
  let fading = $state<Preview | null>(null);
  let lastPreview: Preview | null = null;

  $effect.pre(() => {
    const current = preview;
    untrack(() => {
      if (current) {
        fading = null;
        lastPreview = current;
        return;
      }
      if (lastPreview && !prefersReducedMotion.current) {
        fading = lastPreview;
      }
      lastPreview = null;
    });
  });

  /** Drops the faded preview; the fade-in of a shown one ends here too, and keeps it. */
  function onPreviewAnimationEnd() {
    if (!preview) {
      fading = null;
    }
  }

  const drawnPreview = $derived(preview ?? fading);

  // ---- The hand and the controls at the bottom ----

  // The raised hand's cards, 80 % of the preview's, 65 % on a tablet (touch mode outside dock
  // mode). At rest, Hand.svelte draws them at the size of the base card at HAND_REST_SCALE, on the
  // base card's fan, and they drop so that as tall a part of them shows as of the base card
  // dropped by baseHandDrop. The card boxes show their tiles at its width, at most 160 px, outside
  // dock mode: as large as a raised hand's cards before a full hand shrinks them (raisedCardOf).
  const raisedCard = $derived(
    raisedHandCard(
      baseHandCard,
      { w: scrollerWidth, h: windowHeight },
      { small: small.current, tablet },
    ),
  );

  // The room between the hands and the controls beside them on a wide screen, in px.
  const CONTROLS_GAP = 32;

  // The width of the controls at the bottom right (the zoom control, the narrow Undo and History),
  // measured: the resting hands keep clear of them (handsRoom).
  let cornerWidth = $state(0);

  // On a wide screen the resting hands keep to the room between the hero selector, when it shows,
  // and the controls at the bottom right, never under them. On a small screen those controls sit
  // above the resting hand. A raised hand's fan reaches on to the table's right edge, over those
  // controls, which the veil covers meanwhile; the hero selector stays clear, to pick another hand.
  const handsRoom = $derived<HandInsets>(
    small.current
      ? { left: 0, right: 0 }
      : {
          left: pickerShown ? TABLE_EDGE + pickerWidth + CONTROLS_GAP : 0,
          right: TABLE_EDGE + cornerWidth + CONTROLS_GAP,
        },
  );

  /**
   * The raised card of a seat's hand: raisedCard, shrunk as the hand grows, never below the base
   * card, so that each card of its fan shows a part of itself (filledHandCard). The fan spreads from
   * the left edge of the hands' room to the table's right edge, less the hand's side padding
   * (Hand.svelte's raisedSlots). At rest, the hand shows the base card all the same (handRestScale,
   * handRestDrop).
   */
  function raisedCardOf(seat: number): { w: number; h: number } {
    const fanWidth = scrollerWidth - handsRoom.left - 2 * HAND_PADDING.side;
    return filledHandCard(raisedCard, baseHandCard, handOf(seat).length, fanWidth);
  }

  // Two resting hands side by side, both over the whole room: each fan is laid out for half of it,
  // and the two sit HANDS_GAP apart, centred together (fanOffsets). Active or not, a resting hand
  // has the same size: neither moves as the active hand changes. Raised, the active one spreads
  // from the left edge of the room to the table's right edge (raisedCardOf).
  const restPlaces = $derived.by(() => {
    const [first, second] = handSeats;
    if (first === undefined || second === undefined) {
      return [];
    }
    const width = Math.max(0, scrollerWidth - handsRoom.left - handsRoom.right) / 2;
    const fanWidth = (seat: number) =>
      restingFanWidth(handOf(seat).length, width, baseHandCard, raisedCardOf(seat));
    return fanOffsets(fanWidth(first), fanWidth(second)).map((offset) => ({ offset, width }));
  });

  // Whether each hand shown is raised, by its place (two hands at most); only the active one ever is.
  let handsOpen = $state([false, false]);
  // A hand no longer shown takes its raised state with it: one shown again in its place starts down.
  // The hands still shown keep theirs, as a hand pinned up by a tap shows another deck's.
  $effect.pre(() => {
    const count = handSeats.length;
    untrack(() => {
      if (handsOpen.slice(count).some(Boolean)) {
        handsOpen = handsOpen.map((open, place) => place < count && open);
      }
    });
  });
  // The active hand is raised: the viewer is busy with it (Presence).
  const handRaised = $derived(handsOpen[handSeats.indexOf(handSeat ?? -1)] ?? false);

  /**
   * The room under the controls at the bottom of the table (the zoom control,
   * the narrow Undo, the hero selector), in px. On a small screen they sit
   * above the resting hand, which would cover them otherwise: above the strip
   * restingStrip gives for the base card (restingRoom, as a hand shows only
   * with own decks), which the resting hand, drawn from its raised cards
   * (handRestDrop), does not rise past.
   */
  const controlsBottom = $derived(
    small.current && handSeats.length > 0 ? restingRoom + ABOVE_HAND : TABLE_EDGE_BOTTOM,
  );

  // ---- The Focus panel's corner ----

  // Bottom right, unless that hides the whole hovered element (focus.ts).
  let focusCorner = $state<Corner>(HOME);
  // What the panel at home clears: the controls at the bottom right (cornerHeight), and how much
  // higher than --edge-bottom they sit.
  const homeControls = $derived(cornerHeight + controlsBottom - TABLE_EDGE_BOTTOM);
  // The controls' box at the bottom right: the keyboard shortcuts sheet lines up on its right edge.
  let cornerBox = $state<HTMLElement>();
  // The panel's size, kept from the last time it showed; a portrait card's until then.
  let focusWidth = $state(320);
  let focusHeight = $state(450);

  /** The hovered card or pile, on the screen. A hovered hand card has no preview to place. */
  function hoveredRect(): DOMRect | null {
    const hovered = interaction.hovered;
    if (!hovered || hovered.kind === 'hand' || !app) {
      return null;
    }
    const selector = hovered.kind === 'pile' ? tablePile(hovered.id) : tableCard(hovered.id);
    return app.querySelector(selector)?.getBoundingClientRect() ?? null;
  }

  /**
   * Measures the play area and the hovered element, then places the panel: called whenever they
   * may have moved (hover, scroll, zoom, resize, the bar sliding).
   */
  function measureFocus(): void {
    // Nothing previewed, nothing to place: it is measured again as soon as a card is.
    if (!preview) {
      return;
    }
    const box = wrap?.getBoundingClientRect();
    if (!box) {
      return;
    }
    // The part under the top bar, while it floats over the play area, does not show.
    const area: Rect = {
      left: box.left,
      top: box.top + barRoom,
      right: box.right,
      bottom: box.bottom,
    };
    focusCorner = chooseCorner({
      current: focusCorner,
      area,
      size: { w: focusWidth, h: focusHeight },
      hovered: hoveredRect(),
      controls: homeControls,
      // The hero selector at the bottom left.
      taken: pickerShown ? ['bottom-left'] : [],
    });
  }

  /** The panel's margins in its corner: off the play area's edges, and above the controls at home. */
  function focusMargin(corner: Corner): string {
    const top = corner.startsWith('top') ? FOCUS_MARGINS.top : 0;
    const bottom = bottomRoom(corner, homeControls);
    const left = corner.endsWith('left') ? FOCUS_MARGINS.side : 0;
    const right = corner.endsWith('right') ? FOCUS_MARGINS.side : 0;
    return `${top}px ${right}px ${bottom}px ${left}px`;
  }

  /**
   * How far the panel moves down in a top corner, off the top bar: a translate, which follows the
   * bar as it slides on the compositor, with no new layout.
   */
  function focusShift(corner: Corner): string | undefined {
    return corner.startsWith('top') ? `0px ${barRoom}px` : undefined;
  }

  // Placed before it is drawn, when what is hovered, the zoom, the play area's or the panel's size change.
  $effect.pre(() => {
    void [
      preview,
      interaction.hovered,
      zoom,
      visibleWidth,
      visibleHeight,
      focusWidth,
      focusHeight,
      pickerShown,
      homeControls,
      barRoom,
    ];
    untrack(measureFocus);
  });

  // The interaction state is shared: a previous game's must not show in the next one.
  $effect(() => () => interaction.reset());

  // The table is exactly the window: the page never scrolls under it, only the surface does
  // (.fixed-screen below). Without this, the resting hand, lowered past the bottom, would make the page
  // scrollable, and a wheel or a drag would scroll the page rather than the surface.
  $effect(() => {
    const page = document.documentElement;
    page.classList.add('fixed-screen');
    return () => page.classList.remove('fixed-screen');
  });

  // ---- Animations ----

  // The view the table was last drawn from: the next one is animated from it.
  // svelte-ignore state_referenced_locally
  let drawnView = view;
  // In dock mode, the layout it was last drawn with: its rows flow, and a card the next view leaves
  // where it lay may be drawn elsewhere (dockMotions). Kept up to date as the screen changes too.
  let drawnDock: DockLayout | null = null;
  $effect.pre(() => {
    const layout = shownDockView;
    const shown = view;
    untrack(() => {
      if (shown === drawnView) {
        drawnDock = layout;
      }
    });
  });

  // Before the new view is drawn, while the cards still show where they were.
  // The viewer's own drop (DragLayer's landing, which ends with this view)
  // already lies where it went on the table or in the hand; onto a pile, it
  // flies there from its landed ghost, still drawn now, and into a stack, it
  // slides from that ghost to its spot in the chain. In dock mode the rows
  // flow: a drop on the table, its ghost landed where it was let go, slides
  // from there to its slot and settles, as one motion, and the cards it
  // pushes along slide too (dockMotions).
  $effect.pre(() => {
    const next = view;
    untrack(() => {
      const prev = drawnView;
      drawnView = next;
      const before = drawnDock;
      const after = shownDockView;
      drawnDock = after;
      if (prev === next) {
        return;
      }
      // Back after a long gap: the table shows as it is now, nothing plays.
      if (session.viewGap > MAX_APART_MS) {
        motion.stop();
        void tick().then(rehoverUnderPointer);
        return;
      }
      let anims = diffViews(prev, next, interaction.landing ?? undefined);
      if (before !== null && after !== null && prev.table && next.table) {
        anims = dockMotions(anims, prev.table, next.table, {
          before: (id) => before.itemBox(id),
          after: (id) => after.itemBox(id),
        });
      }
      void motion
        .animate(app, anims, { before: prev.table, after: next.table }, zoom)
        .then(async () => {
          // Once drawn, then once still: a card turning over or in under the pointer keeps its
          // hover meanwhile, edge-on out of reach of the hit-test (rehoverUnderPointer).
          rehoverUnderPointer();
          await motion.settled();
          rehoverUnderPointer();
          // The hand cards slide to their new slots, and the hand rises or lowers, with CSS
          // transitions, which motion does not wait for. The browser's enter at their end is
          // ignored (a redraw's), so the card that slid under the pointer is hovered here.
          await handSettled();
          // A newer view hovers, once settled, what it put there itself.
          if (drawnView === next) {
            rehoverUnderPointer();
          }
        });
    });
  });

  /** Resolves once the transitions playing in the hand have ended, or were cancelled. */
  async function handSettled(): Promise<void> {
    // Some environments (tests) have no Web Animations: nothing plays there.
    const hands = [...(app?.querySelectorAll('.hand') ?? [])];
    const playing = hands.flatMap((hand) => hand.getAnimations?.({ subtree: true }) ?? []);
    await Promise.allSettled(playing.map((animation) => animation.finished));
  }

  /**
   * Hovers what a new view put under a pointer at rest, whoever acted: the
   * card or hand card there, or nothing once the hovered card went from under
   * it. The ring, the preview and the keys follow. A hovered card turning over
   * or in stays hovered: the pointer still rests on it, edge-on.
   */
  function rehoverUnderPointer(): void {
    const { x, y } = interaction.pointer;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      typeof document.elementFromPoint !== 'function'
    ) {
      return;
    }
    const hovered = interaction.hovered;
    if (hovered?.kind === 'card' && motion.isTurning(hovered.id)) {
      return;
    }
    const under = document.elementFromPoint(x, y);
    const pile = under?.closest<HTMLElement>('.surface .pile');
    if (pile) {
      rehoverPile(pile);
      return;
    }
    const hit = under?.closest<HTMLElement>(
      '.surface .card:not(.pile)[data-id], .hand .hcard[data-id]',
    );
    const id = hit?.dataset.id;
    if (!hit || id === undefined) {
      interaction.rehover(null);
      return;
    }
    interaction.rehover({ kind: hit.classList.contains('hcard') ? 'hand' : 'card', id });
  }

  /**
   * A pile keeps its own hover, which an empty, inert pile does not have. A
   * pile a card was dropped on was never entered, the pointer passing over it
   * during the drag: it is hovered now, the keys acting on it, as entering it
   * would (PileView: a deck that shows its back clears the preview).
   */
  function rehoverPile(element: HTMLElement): void {
    const id = element.dataset.id;
    const pile = id === undefined ? undefined : byId(piles).get(id);
    const hovered = interaction.hovered;
    if (!pile || element.classList.contains('inert')) {
      return;
    }
    if (hovered?.kind === 'pile' && hovered.id === pile.id) {
      return;
    }
    interaction.rehover({ kind: 'pile', id: pile.id }, previewOfPile(pile));
  }

  /**
   * Sends an action, credited to the deck owning the card or pile it
   * touches when that deck is the viewer's, else to the selected deck.
   */
  function act(action: Action, target: TableElement | null = null): number | null {
    const seat = target ? creditedSeat(target, view, selected) : (selected ?? undefined);
    return session.act(action, seat);
  }

  /** The card a key's action is about, if any: the hovered card, or the hand card played. */
  function targetOfKey(action: Action): TableElement | null {
    return action.card ? { kind: 'card', id: action.card } : null;
  }

  $effect(() => () => motion.stop());

  // ---- The hovered element ----

  /** Whether the element is still where it was hovered: on the table, or in the hand. */
  function isPresent(element: TableElement): boolean {
    switch (element.kind) {
      case 'card':
        return cardsById.get(element.id)?.zone === 'table';
      case 'hand':
        return own.some((seat) => view.table?.hands?.[areaOf(seat)]?.includes(element.id));
      case 'pile':
        return piles.some((pile) => pile.id === element.id);
    }
  }

  // An element that left the table takes its hover, its context menu and its arrow mode with it.
  $effect(() => {
    const hovered = interaction.hovered;
    if (hovered && !isPresent(hovered)) {
      interaction.release();
    }
    const from = interaction.arrowFrom;
    if (from !== null && !isPresent({ kind: 'card', id: from })) {
      interaction.endArrow();
    }
  });

  /** The actions of the hovered element, which its keys run (keys.ts). */
  const hoveredItems = $derived.by((): ActionItem[] | { text: string } => {
    // actionsFor reads the catalog's plain Map (are there several faces to
    // flip?): reading the catalog state here recomputes the items once it loads.
    void catalog;
    const hovered = interaction.hovered;
    if (!hovered) {
      return [];
    }
    return actionsFor(hovered, view, lang, interaction.group);
  });

  // Arrows may be drawn: some lie on the table, or the viewer picks one (a mouse's or a pen's only:
  // in touch mode, only those another player drew). Only then do the arrows follow the moving cards
  // frame by frame: the frame counter runs only while read (motion.frame).
  const arrowsShown = $derived(
    (view.table?.arrows ?? []).length > 0 || interaction.arrowFrom !== null,
  );

  // ---- The arrow mode's hint ----

  // Arrows are drawn with a mouse: touch mode offers none.
  const ARROW_HINT = 'Click the card to point at — Esc or a click on an empty spot to cancel.';

  // Above the card the arrow starts from, until the arrow is drawn or cancelled, whatever the
  // pointer hovers meanwhile; not while a Shift + drag draws it, which shows where it goes.
  const arrowHintShown = $derived(interaction.arrowFrom !== null && !interaction.arrowDrag);

  /** The card the arrow starts from, on the table. */
  function arrowSource(): HTMLElement | null {
    const from = interaction.arrowFrom;
    if (from === null || !wrap) {
      return null;
    }
    return wrap.querySelector<HTMLElement>(tableCard(from));
  }

  // ---- The token pill ----

  // Found again by names at every view, so the pill follows its token through
  // redraws; it goes with the token (zero) or the card (off the table). Touch mode has no pill:
  // a tap on a token opens its card's inspector, which has the steppers.
  const counterShown = $derived.by(() => {
    const target = interaction.counter;
    if (!target || view.you.role !== 'player' || interaction.dragging || touchMode.current) {
      return null;
    }
    const card = cardsById.get(target.card);
    if (card?.zone !== 'table') {
      return null;
    }
    // A modifier is signed: only 0 removes it.
    const value = countersOf(card, target.kind)?.[target.name] ?? 0;
    return value !== 0 ? { target, value } : null;
  });

  // A pill that went away must not come back when the token does. A tapped one held its card's
  // hover, which lingers out with it; a mouse still on the card keeps it.
  $effect(() => {
    if (interaction.counter && !counterShown) {
      if (interaction.counterPinned) {
        interaction.unpinCounter();
      } else {
        interaction.hideCounter();
      }
    }
  });

  function counterAnchor(): HTMLElement | null {
    const target = interaction.counter;
    if (!target || !wrap) {
      return null;
    }
    const selector = `[data-counter="${target.kind}:${target.name}"]`;
    return wrap.querySelector<HTMLElement>(`${tableCard(target.card)} ${selector}`);
  }

  function stepCounter(delta: number): void {
    const target = interaction.counter;
    if (target) {
      act(
        { kind: target.kind, card: target.card, name: target.name, delta },
        { kind: 'card', id: target.card },
      );
    }
  }

  // ---- The context menu ----

  /**
   * What the context menu of a table card or pile shows: every action of the
   * element, or why it has none for the viewer ("Belongs to Sam: …"). Nothing
   * for a hand card, nor for an element without either (a card, to a spectator).
   */
  type ContextContent = { entries: ContextEntry[]; note?: string };
  // A table card or pile: what a tap or a right click on the surface opens, the inspector included.
  // A hand card is no such element: it has no context menu and no inspector.
  type SurfaceElement = Exclude<TableElement, { kind: 'hand' }>;

  function contextContentOf(element: TableElement, touch?: TouchOptions): ContextContent | null {
    if (element.kind === 'hand') {
      return null;
    }
    const items = actionsFor(element, view, lang, interaction.group, touch);
    if (!Array.isArray(items)) {
      return { entries: [], note: items.text };
    }
    const entries = contextItems(element, items);
    return entries.length > 0 ? { entries } : null;
  }

  // From the current view: a redraw updates the entries ("Damage (7)").
  const contextContent = $derived.by((): ContextContent | null => {
    // As for the hovered items: actionsFor reads the catalog's plain Map.
    void catalog;
    const open = interaction.contextMenu;
    return open ? contextContentOf(open.element) : null;
  });

  /** The header of a menu or an inspector: what the card or pile is, whose it is; none once it is gone. */
  function headerOf(element: TableElement | undefined): ContextHeader | null {
    if (element?.kind === 'pile') {
      const pile = byId(piles).get(element.id);
      return pile ? pileHeader(pile, view) : null;
    }
    const card = element ? cardsById.get(element.id) : undefined;
    return card ? cardHeader(card, faceOf(card), view) : null;
  }

  const contextHeader = $derived(headerOf(interaction.contextMenu?.element));

  // A redraw that leaves its element without actions (an emptied pile, a card gone) closes it.
  $effect(() => {
    if (interaction.contextMenu && contextContent === null) {
      untrack(() => interaction.closeContextMenu());
    }
  });

  /** The table card or pile an element of the surface belongs to, if any: what a context menu is for. */
  function contextElementOf(target: EventTarget | null): SurfaceElement | null {
    if (!(target instanceof Element)) {
      return null;
    }
    const hit = target.closest<HTMLElement>('.surface .card[data-id]');
    const id = hit?.dataset.id;
    if (!hit || id === undefined) {
      return null;
    }
    return { kind: hit.classList.contains('pile') ? 'pile' : 'card', id };
  }

  /**
   * Opens the element's context menu at that point, unless it has nothing to
   * show. It previews the element as entering it would (PileView: a deck that
   * shows its back clears the preview).
   */
  function openContextMenu(element: SurfaceElement, at: Point): void {
    // A touch screen has the inspector instead, a bottom sheet the finger reaches.
    if (touchMode.current) {
      openInspector(element);
      return;
    }
    if (contextContentOf(element) === null) {
      return;
    }
    const pile = element.kind === 'pile' ? byId(piles).get(element.id) : undefined;
    interaction.openContextMenu(element, at, pile ? previewOfPile(pile) : 'show');
  }

  /**
   * A click on a card in play or a pile, with the main button or a finger,
   * opens its context menu at the pointer; a click on the element whose menu
   * that press closed leaves it closed, and so does the click iOS fires after
   * a long press, which opens nothing. The click that ends a drag, a rubber
   * band or an arrow never gets here (interaction.swallowNextClick). Alt +
   * click pings the spot, and Ctrl + click is macOS's right click, which
   * onTableContextMenu handles. A token or a status has its − / + pill
   * instead, which hovering it shows. In touch mode, a tap opens the
   * inspector, a token's too, or in select mode toggles the card in the group.
   */
  function onTableClick(event: MouseEvent): void {
    if (event.altKey || event.ctrlKey || interaction.isLongTouchClick(event)) {
      return;
    }
    const onCounter =
      event.target instanceof Element && event.target.closest('.surface [data-counter]') !== null;
    if (onCounter && !touchMode.current) {
      return;
    }
    const element = contextElementOf(event.target);
    if (element && selecting) {
      if (element.kind === 'card') {
        toggleSelected(element.id);
      }
      return;
    }
    if (element && !interaction.closedByPress(element)) {
      openContextMenu(element, { x: event.clientX, y: event.clientY });
    }
  }

  /**
   * A right click or a Ctrl + click on macOS on a card or a pile opens its
   * menu, as a click does (the screen prevents the browser's own:
   * preventNativeMenu). On touch, a tap opens it: the contextmenu event a long
   * touch fires (Android) opens nothing.
   */
  function onTableContextMenu(event: MouseEvent): void {
    if (interaction.isTouchContextMenu(event)) {
      return;
    }
    const element = contextElementOf(event.target);
    if (element) {
      openContextMenu(element, { x: event.clientX, y: event.clientY });
    }
  }

  /**
   * Never the browser's menu on the table screen, from a right click or a long touch: on the table,
   * the hand, the token pill or the bottom bars, it would offer to save or copy a card image. On the
   * window, as the table screen is the whole page while it shows; the table's own handler, which
   * opens the action menu on a card or a pile, sees the event first. A text field keeps the browser's
   * menu, to paste in.
   */
  function preventNativeMenu(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, [contenteditable]')) {
      return;
    }
    event.preventDefault();
  }

  /**
   * A chosen entry runs on the menu's element, once the menu is closed. A token entry (`staysOpen`)
   * leaves the menu open, its submenu too, to add the same token again: the entry relabels as the
   * view answers ("Damage (7)").
   */
  function runContextItem(item: ActionItem): void {
    const element = interaction.contextMenu?.element ?? null;
    if (!item.staysOpen) {
      interaction.closeContextMenu();
    }
    runItem(item, element);
  }

  // ---- The inspector (touch mode) ----

  // The element whose inspector (CardSheet.svelte) is open: a table card or pile, which a tap opens
  // in place of the context menu. A hand card has none: it is played or discarded by a drag, or
  // from the hand sheet in dock mode. Its own state, not the context
  // menu's: the sheet is modal, and a modal lets go of the context menu (see below).
  let inspected = $state.raw<SurfaceElement | null>(null);
  // How many times an inspector has opened: each opening draws a sheet of its own. The switch from
  // a deck to the card revealed on it is no opening: the same sheet turns the card over in place.
  let inspectorOpenings = $state(0);

  // The inspector of a card in play offers Select, which enters select mode.
  const SELECT_ENTRY: ContextAction = {
    kind: 'action',
    item: { id: 'select', label: 'Select', group: 0 },
  };

  /**
   * What the inspector lists: the context menu's entries with those of a touch screen (Detach, which
   * a mouse drags), and Select for a card in play.
   */
  function inspectorContentOf(element: TableElement): ContextContent | null {
    const content = contextContentOf(element, { sizeOf });
    const card = element.kind === 'card' ? cardsById.get(element.id) : undefined;
    if (content === null || content.entries.length === 0 || !card || !isFree(card)) {
      return content;
    }
    return { entries: [...content.entries, { kind: 'separator' }, SELECT_ENTRY] };
  }

  // A Reveal run from a deck's inspector: the inspector stays on the deck and waits for the card
  // revealed there, until the server refuses the action of that id or LANDING_MS passes.
  let awaitingReveal = $state.raw<{ pile: string; action: number } | null>(null);
  let awaitingRevealTimer: ReturnType<typeof setTimeout> | undefined;

  function awaitReveal(pile: string, action: number): void {
    awaitingReveal = { pile, action };
    clearTimeout(awaitingRevealTimer);
    awaitingRevealTimer = setTimeout(() => (awaitingReveal = null), LANDING_MS);
  }

  function stopAwaitingReveal(): void {
    awaitingReveal = null;
    clearTimeout(awaitingRevealTimer);
  }

  $effect(() => () => clearTimeout(awaitingRevealTimer));

  /** Whether the inspector is still on the awaited deck, and the server has not refused its Reveal. */
  function stillAwaiting(awaited: { pile: string; action: number }): boolean {
    // The viewer closed the inspector, or opened another, while the reveal was on its way.
    const onDeck = inspected?.kind === 'pile' && inspected.id === awaited.pile;
    return onDeck && session.lastError?.id !== awaited.action;
  }

  // The card revealed on the awaited deck, once the view shows it.
  const revealedOnInspected = $derived.by((): TableCard | undefined => {
    const awaited = awaitingReveal;
    if (awaited === null || !stillAwaiting(awaited)) {
      return undefined;
    }
    return cards.find((card) => card.zone === 'table' && card.onPile === awaited.pile);
  });

  // The element the sheet shows: the revealed card in the very update whose view shows it. The
  // effect below commits it as the inspected element only after that update is drawn: drawn with
  // the deck, its entries, which the revealed card makes refused, would start to leave first.
  const sheetElement = $derived.by((): SurfaceElement | null => {
    return revealedOnInspected ? { kind: 'card', id: revealedOnInspected.id } : inspected;
  });

  // From the current view, as the context menu's: a redraw updates the entries and the counters.
  const inspectorContent = $derived.by((): ContextContent | null => {
    void catalog;
    return sheetElement ? inspectorContentOf(sheetElement) : null;
  });

  const inspectorHeader = $derived(sheetElement ? headerOf(sheetElement) : null);

  // The view that shows a card revealed on the awaited deck switches the inspector to that card, in
  // the same sheet, which turns the deck over to it (CardSheet.svelte). Declared before the effect
  // below, which runs after it: the switch comes first.
  $effect(() => {
    const awaited = awaitingReveal;
    if (awaited === null) {
      return;
    }
    const revealed = revealedOnInspected;
    if (revealed) {
      untrack(() => {
        stopAwaitingReveal();
        inspected = { kind: 'card', id: revealed.id };
      });
    } else if (!stillAwaiting(awaited)) {
      untrack(stopAwaitingReveal);
    }
  });

  // A redraw that takes its element away, or leaves it without actions, closes the inspector.
  $effect(() => {
    if (sheetElement && (inspectorContent === null || !isPresent(sheetElement))) {
      untrack(() => (inspected = null));
    }
  });

  /** A back's image, as CardBack draws it; none when the theme draws the back itself. */
  function backImages(back: TableCard['back']): string[] {
    const url = backUrl(back);
    return url ? [url] : [];
  }

  /** The face the inspector shows: the card's, its back when it lies face down, a pile's top face or back. */
  function inspectorImages(element: TableElement): string[] {
    if (element.kind === 'pile') {
      const pile = byId(piles).get(element.id);
      if (!pile) {
        return [];
      }
      const top = topOf(pile);
      if (top && !isHidden(top)) {
        return faceOf(top)?.images ?? [];
      }
      return backImages(top?.back ?? pileBack(pile));
    }
    const card = cardsById.get(element.id);
    if (!card) {
      return [];
    }
    return isHidden(card) ? backImages(card.back) : (faceOf(card)?.images ?? []);
  }

  /**
   * The face a Flip turns the inspected card to, for the inspector to decode ahead: a face-up card's
   * next face, back to the first after the last (resolveFlip, internal/game). None for a pile, a
   * card the viewer may not see, or a card with a single face, which turns face down to its back.
   */
  function inspectorNextImages(element: TableElement): string[] {
    const card = element.kind === 'card' ? cardsById.get(element.id) : undefined;
    if (!card || isHidden(card)) {
      return [];
    }
    const faces = facesOf(card);
    if (faces.length < 2) {
      return [];
    }
    return faces[(card.face + 1) % faces.length]!.images;
  }

  /**
   * Whether the inspected card lies landscape, as inspectorImages draws it: a face-up card or a pile's
   * face-up top lies as its face; a face-down card, a pile's back and an empty pile are portrait.
   */
  function inspectorLandscape(element: TableElement): boolean {
    let card: TableCard | undefined;
    if (element.kind === 'pile') {
      const pile = byId(piles).get(element.id);
      card = pile ? topOf(pile) : undefined;
    } else {
      card = cardsById.get(element.id);
    }
    return card !== undefined && !isHidden(card) && isLandscape(sizeOf(card));
  }

  /** Whether the inspected element is an exhausted card, which the inspector draws tilted; never a pile. */
  function inspectorExhausted(element: TableElement): boolean {
    const card = element.kind === 'card' ? cardsById.get(element.id) : undefined;
    return card?.exhausted === true;
  }

  /**
   * Whether the inspected element is a card that can tilt, as it offers Exhaust or Ready
   * (canExhaust): the inspector keeps the room of its tilted bounds. Never a pile.
   */
  function inspectorTilts(element: TableElement): boolean {
    const card = element.kind === 'card' ? cardsById.get(element.id) : undefined;
    return card !== undefined && canExhaust(card);
  }

  /** The tokens, statuses and modifiers of a table card, which the inspector steps; none for a pile. */
  function inspectorCounters(element: TableElement): SheetCounter[] {
    const card = element.kind === 'card' ? cardsById.get(element.id) : undefined;
    return card ? countersFor(card) : [];
  }

  /** The stack a table card belongs to, as the inspector's carousel draws it; none for a card on its own or a pile. */
  function inspectorStack(element: TableElement): StackCard[] {
    if (element.kind !== 'card') {
      return [];
    }
    return stackCardsOf(element.id, cards).map((id) => {
      const member: TableElement = { kind: 'card', id };
      const header = headerOf(member);
      return {
        id,
        name: header?.name ?? '',
        images: inspectorImages(member),
        landscape: inspectorLandscape(member),
        counters: inspectorCounters(member),
        scheme: header?.scheme ?? false,
        exhausted: inspectorExhausted(member),
        tilts: inspectorTilts(member),
      };
    });
  }

  /**
   * Shows another card of the inspected card's stack in the inspector: no opening, the same sheet
   * switches to it (CardSheet.svelte), as for a card revealed on a deck.
   */
  function inspectStackCard(id: string): void {
    inspected = { kind: 'card', id };
  }

  /** Opens the element's inspector, unless it has nothing to show. */
  function openInspector(element: SurfaceElement): void {
    if (modal.open || interaction.dragging !== null || inspectorContentOf(element) === null) {
      return;
    }
    inspected = element;
    inspectorOpenings += 1;
  }

  function closeInspector(): void {
    inspected = null;
  }

  // The submenus of actionsFor whose entries add to a card's counters: the inspector stays open on
  // them, and shows the new counter with its steppers.
  const COUNTER_SUBMENUS: readonly string[] = ['tokens', 'statuses', 'modifiers'];

  /** Whether the item is an entry of the inspector's token, status or modifier submenu. */
  function addsCounter(item: ActionItem): boolean {
    return (inspectorContent?.entries ?? []).some(
      (entry) =>
        entry.kind === 'submenu' &&
        COUNTER_SUBMENUS.includes(entry.id) &&
        entry.entries.some((sub) => sub.kind === 'action' && sub.item === item),
    );
  }

  /**
   * Whether the item is a table card's Flip (actionsFor's `flip`, a stage card's too): the inspector
   * stays open and turns the card over in it (CardSheet.svelte). A card revealed on a deck that goes
   * back into it, turned face down, leaves the table: the inspector closes then, as for any card
   * that goes.
   */
  function flipsCard(item: ActionItem, element: TableElement): boolean {
    return element.kind === 'card' && item.id === 'flip';
  }

  /**
   * Whether the item is a table card's Exhaust or Ready (actionsFor's `exhaust`): the inspector stays
   * open and tilts the card in it, or turns it upright (CardSheet.svelte), its button reading Ready
   * or Exhaust as the view answers.
   */
  function exhaustsCard(item: ActionItem, element: TableElement): boolean {
    return element.kind === 'card' && item.id === 'exhaust';
  }

  /** Whether the item is a deck's Reveal (actionsFor's `reveal`), run from that deck's inspector. */
  function revealsFrom(item: ActionItem, element: TableElement): boolean {
    return element.kind === 'pile' && item.id === 'reveal';
  }

  /**
   * A chosen entry runs on the inspector's element, as the menu's does. It closes the inspector
   * first, but for an entry that adds a token, a status or a modifier: the inspector stays open,
   * as for a stepper, for a card's Exhaust or Ready, which it shows tilting, and for a card's Flip,
   * which it shows turning over. A deck's Reveal keeps it open too, and switches it to the revealed
   * card once the view shows it.
   */
  function runInspectorItem(item: ActionItem): void {
    const element = sheetElement;
    if (element === null) {
      return;
    }
    if (revealsFrom(item, element)) {
      const action = runItem(item, element);
      if (action !== null) {
        awaitReveal(element.id, action);
      }
      return;
    }
    if (!addsCounter(item) && !exhaustsCard(item, element) && !flipsCard(item, element)) {
      inspected = null;
    }
    if (item === SELECT_ENTRY.item) {
      enterSelectMode(element.id);
      return;
    }
    runItem(item, element);
  }

  /** A stepper of the inspector: sends what the token pill's − / + sends (stepCounter). */
  function stepInspected(counter: SheetCounter, delta: -1 | 1): void {
    if (sheetElement?.kind === 'card') {
      act(
        { kind: counter.kind, card: sheetElement.id, name: counter.name, delta },
        { kind: 'card', id: sheetElement.id },
      );
    }
  }

  // ---- Select mode (touch mode) ----

  // Touch has no rubber band nor Shift: in select mode, each tap on a table card adds it to the group
  // or takes it out. Done or Escape leaves it; the group stays, to drag or act on.
  let selectMode = $state(false);
  const selecting = $derived(selectMode && touchMode.current);

  /** Enters select mode, the card whose inspector offered it selected. */
  function enterSelectMode(id: string): void {
    selectMode = true;
    const card = cardsById.get(id);
    if (card && isFree(card) && !interaction.group.has(id)) {
      interaction.setGroup(new Set([...interaction.group, id]));
    }
  }

  function leaveSelectMode(): void {
    selectMode = false;
  }

  /** A tap in select mode: the card joins the group, or leaves it. Only a free card can be in it. */
  function toggleSelected(id: string): void {
    const card = cardsById.get(id);
    if (!card || !isFree(card)) {
      return;
    }
    const ids = [...interaction.group];
    const toggled = ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
    interaction.setGroup(new Set(toggled));
  }

  // ---- The dock (dock mode) ----

  // The selected deck, which the dock's hand button shows and opens; none for a spectator.
  const dockDeck = $derived(selected === null ? undefined : seatDeck(view, selected));
  const dockHand = $derived(selected === null ? [] : handOf(selected));
  // A card still flying in (motion.drawing) is hidden in its place on the hand button, and not counted.
  const dockCards = $derived<DockCard[]>(
    dockHand.map((card) => ({
      id: card.id,
      images: faceOf(card)?.images ?? [],
      arriving: motion.drawing.has(card.id),
    })),
  );
  const dockColor = $derived(
    playerColorVar(selected === null ? view.you.color : (seatColor(view, selected) ?? 0)),
  );

  // The viewer's own decks, which the hand sheet's hero selector switches between.
  const ownEntries = $derived(pickerEntries.filter((entry) => own.includes(entry.seat)));

  /**
   * Whether the dock's hand button is the drop target of the drag, by the rule DragLayer follows
   * (takesHandDrop).
   */
  const dockDropActive = $derived.by(() => {
    const held = interaction.dragging;
    if (!dockMode || !held) {
      return false;
    }
    const from = sourceOf(held.element, view, held.card ?? undefined);
    if (!from) {
      return false;
    }
    const units = from.kind === 'card' ? dragUnits(from.card, interaction.group, cards) : [];
    return takesHandDrop(from, units, view);
  });

  // The sheets the dock opens: the selected deck's hand, the history. The corner's History button
  // opens the history one too (historySheetMode).
  let handSheetShown = $state(false);
  let historyShown = $state(false);

  // Out of dock mode (a phone turned into a tablet's size), the hand sheet goes with it; the history
  // sheet goes once neither the dock nor the corner's History button shows (the history column
  // takes over, or a mouse came).
  $effect.pre(() => {
    const handSheetGone = !dockMode;
    const historySheetGone = !dockMode && !historySheetMode;
    untrack(() => {
      if (handSheetGone) {
        handSheetShown = false;
      }
      if (historySheetGone) {
        historyShown = false;
      }
    });
  });

  function openHandSheet(): void {
    if (selected !== null && !modal.open) {
      handSheetShown = true;
    }
  }

  function closeHandSheet(): void {
    handSheetShown = false;
  }

  // The hand card the viewer just played or discarded from the hand sheet, and its seat,
  // until the view shows it out of that hand. If it was the last card, the hand sheet closes: by
  // then the card's rise has been measured from the carousel (motion.animate, before the view is
  // drawn) and plays on above the sheet sliding away. Any other way the hand empties keeps it open.
  let leavingHand = $state.raw<{ id: string; seat: number } | null>(null);

  /** Notes a hand card the viewer sent away from its hand, for the effect below to watch. */
  function watchLeavingHand(id: string): void {
    const seat = own.find((s) => view.table?.hands?.[areaOf(s)]?.includes(id));
    leavingHand = seat === undefined ? null : { id, seat };
  }

  $effect(() => {
    const leaving = leavingHand;
    if (leaving === null) {
      return;
    }
    const hand = view.table?.hands?.[areaOf(leaving.seat)] ?? [];
    if (hand.includes(leaving.id)) {
      return;
    }
    untrack(() => {
      leavingHand = null;
      if (hand.length === 0 && selected === leaving.seat) {
        closeHandSheet();
      }
    });
  });

  /** Whether a hand card may be discarded: handActions offers its Discard and does not refuse it. */
  function handCanDiscard(id: string): boolean {
    const discard = handActions(id, view, sizeOf).find((item) => item.id === 'discard');
    return discard !== undefined && !discard.disabled;
  }

  /** Play or Discard on a card of the hand sheet (handActions): sends what its key sends (keys.ts). */
  function runHandAction(id: string, action: 'play' | 'discard'): void {
    const item = handActions(id, view, sizeOf).find((candidate) => candidate.id === action);
    if (!item || item.disabled) {
      return;
    }
    const result = item.run?.();
    if (result && 'kind' in result) {
      send(result, targetOfKey(result));
      if (result.card !== undefined) {
        watchLeavingHand(result.card);
      }
    }
  }

  function openHistory(): void {
    if (modal.open) {
      return;
    }
    historyShown = true;
  }

  function closeHistory(): void {
    historyShown = false;
  }

  /** The "How many cards?" question being asked, if any. */
  let asking = $state<CountQuestion | null>(null);

  // The pile can shrink while the question is open (another player deals from
  // it): the answer never asks for more cards than it holds, the card revealed on it included.
  const askedPile = $derived(asking ? byId(piles).get(asking.pile) : undefined);
  const askedMax = $derived(
    asking && askedPile && view.table ? Math.min(asking.max, deckCount(askedPile, view.table)) : 0,
  );

  // Nothing is left to ask about once the pile is empty or gone.
  $effect(() => {
    if (asking && askedMax === 0) {
      asking = null;
    }
  });

  /**
   * Runs an action item on its element: the hovered one (a key), or the context menu's. Returns the
   * id of the action sent to the server, if one went out (session.act).
   */
  function runItem(
    item: ActionItem,
    element: TableElement | null = interaction.hovered,
  ): number | null {
    if (!item.run || item.disabled || !element) {
      return null;
    }
    const result = item.run();
    if ('ask' in result) {
      asking = result.ask;
      return null;
    }
    if ('local' in result) {
      runLocal(result, element);
      return null;
    }
    return send(result, element);
  }

  function runLocal(local: LocalAction, element: TableElement): void {
    switch (local.local) {
      case 'browseBox':
        openBrowseBox(local.pile);
        return;
      case 'stageBox': {
        const stage = view.table?.stages.find((s) => s.current === element.id);
        if (stage) {
          localBox = { kind: 'stage', stage: stage.key };
        }
        return;
      }
      case 'arrow':
        interaction.startArrow(local.card);
        return;
    }
  }

  /** Browse needs no server: the box lists the cards of a public pile, spectators' too. */
  function openBrowseBox(pile: string): void {
    localBox = { kind: 'browse', pile };
  }

  function answer(n: number): void {
    const question = asking;
    asking = null;
    if (question) {
      send(question.make(n), { kind: 'pile', id: question.pile });
    }
  }

  function send(action: Action, target: TableElement | null): number | null {
    // A new Look or Search opens its box as soon as its view arrives.
    if (action.kind === 'look' || action.kind === 'search') {
      closingView = false;
    }
    return act(action, target);
  }

  // ---- The card boxes ----

  // Browse and the stage choice are the client's own; Look at top and Search
  // are the server's private view, closed with closeView.
  let localBox = $state<LocalBox | null>(null);
  // The private view was closed here: its box is gone before the server's answer.
  let closingView = $state(false);

  $effect(() => {
    if (!view.table?.private) {
      closingView = false;
    }
  });

  // From the current view, so that the box follows what other players do.
  const shownBox = $derived.by((): ShownBox | null => {
    const table = view.table;
    const opened = table?.private;
    if (opened && !closingView) {
      const pile = byId(piles).get(opened.pile);
      return pile ? { kind: 'pile', pile, mode: opened.mode, cards: opened.cards } : null;
    }
    if (localBox?.kind === 'browse') {
      const id = localBox.pile;
      const pile = byId(piles).get(id);
      // Public piles list their cards bottom to top.
      return pile
        ? { kind: 'pile', pile, mode: 'browse', cards: [...(pile.cards ?? [])].reverse() }
        : null;
    }
    if (localBox?.kind === 'stage') {
      const key = localBox.stage;
      const stage = table?.stages.find((s) => s.key === key);
      return stage ? { kind: 'stage', stage } : null;
    }
    return null;
  });

  // What the box's actions touch: its pile, or nothing for the stage choice.
  const boxTarget = $derived<TableElement | null>(
    shownBox?.kind === 'pile' ? { kind: 'pile', id: shownBox.pile.id } : null,
  );

  /**
   * Sends a box action, credited to the card it touches before the box's pile:
   * an own card of a shared pile (victory display, scenario area, encounter discard) goes to
   * the card's seat, not the selected deck.
   */
  function actInBox(action: Action): number | null {
    const touched: TableElement[] = [];
    if (action.card) {
      touched.push({ kind: 'card', id: action.card });
    }
    if (boxTarget) {
      touched.push(boxTarget);
    }
    return session.act(action, creditedSeatAmong(touched, view, selected));
  }

  /** Tells one box from another, so that a new box starts afresh. */
  const boxKey = $derived.by(() => {
    if (shownBox?.kind === 'pile') {
      return `${shownBox.mode}:${shownBox.pile.id}`;
    }
    return shownBox ? `stage:${shownBox.stage.key}` : '';
  });

  // A dialog (a card box, the count question, the shortcuts sheet, a
  // confirmation) freezes the table under its backdrop: its context menu,
  // preview, selection and any press or drag under way go.
  $effect(() => {
    if (modal.open) {
      untrack(() => {
        interaction.release();
        interaction.letGo();
        forgetEmptyPress();
      });
    }
  });

  function closeBox(shuffle: boolean): void {
    if (shownBox?.kind === 'pile' && shownBox.mode !== 'browse') {
      // Act returns null when nothing was sent: the box then stays, as the server never closes it.
      const close: Action = shuffle
        ? { kind: 'closeView', where: 'shuffle' }
        : { kind: 'closeView' };
      const sent = act(close, boxTarget);
      closingView = sent !== null;
      return;
    }
    localBox = null;
  }

  /** The table card an element belongs to, if any: arrows link table cards only. */
  function tableCardOf(element: Element | null): string | undefined {
    return element?.closest<HTMLElement>('.surface .card:not(.pile)')?.dataset.id;
  }

  /** A click on an empty spot clears the viewer's own arrows, from any of their decks, when there are any. */
  function clearOwnArrows(): void {
    const arrows = view.table?.arrows ?? [];
    if (arrows.some((arrow) => own.includes(arrow.seat))) {
      act({ kind: 'arrowClear' });
    }
  }

  /** A press on one of the table's scrollbars: on the scroller, past its content. */
  function onScrollbar(event: PointerEvent, target: HTMLElement): boolean {
    if (target !== wrap) {
      return false;
    }
    const box = target.getBoundingClientRect();
    const offsetX = event.clientX - box.left - target.clientLeft;
    const offsetY = event.clientY - box.top - target.clientTop;
    return offsetX > target.clientWidth || offsetY > target.clientHeight;
  }

  /** An empty spot: the table itself, its surface, or the frame around an owner's piles. */
  function isEmptySpot(target: HTMLElement): boolean {
    return (
      target === wrap ||
      target.classList.contains('table') ||
      target.classList.contains('surface') ||
      target.closest('.ownerbox') !== null
    );
  }

  /** Draws the arrow being picked to that card: the server draws arrows between two table cards only. */
  function endArrowAt(to: string | undefined): void {
    const from = interaction.arrowFrom;
    if (from !== null && to && to !== from) {
      act({ kind: 'arrowAdd', card: from, target: to }, { kind: 'card', id: from });
    }
    interaction.endArrow();
    // The press that picks the target goes on to the card as a click, which would open its
    // context menu; so would a Shift + drag released on its own card.
    interaction.swallowNextClick();
  }

  /**
   * In the capture phase, so that the card pressed does not see it. One press
   * does the first of: picking the target of the arrow mode (or cancelling
   * it), starting a Shift + drag arrow from a card, or, on an empty spot,
   * releasing the selection, then, once let go, either selecting the cards a
   * rubber band touched or clearing the group and the viewer's own arrows.
   */
  function onTablePointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (interaction.arrowFrom !== null && !interaction.arrowDrag) {
      event.preventDefault();
      event.stopPropagation();
      endArrowAt(tableCardOf(target));
      return;
    }
    // The chips of an owner's frame are buttons of their own: a press on one is neither a ping
    // nor an empty spot, which would let go of the selection and could start a rubber band.
    if (target.closest('.surface .chip')) {
      return;
    }
    // In select mode a tap toggles a card in the group (onTableClick), and nothing else: the press
    // reaches neither the element, whose press would let go of the group (DragLayer), nor an empty
    // spot's handling, which would clear it. A press on a selected card goes on: a hold drags the group.
    if (selecting) {
      const id = tableCardOf(target);
      if (id === undefined || !interaction.group.has(id)) {
        event.stopPropagation();
        return;
      }
    }
    // Alt + click pings the spot; spectators cannot ping.
    if (event.altKey && event.button === 0 && presenceLayer?.ping(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const pressed = tableCardOf(target);
    if (event.shiftKey && event.button === 0 && pressed && view.you.role === 'player') {
      // Neither a drag of the card nor a text selection.
      event.preventDefault();
      event.stopPropagation();
      interaction.startArrow(pressed, true);
      return;
    }
    if (isEmptySpot(target)) {
      interaction.release();
      // Not with another button, nor while scrolling the table with its scrollbars: the arrows a
      // click clears cannot be brought back.
      if (event.button === 0 && !onScrollbar(event, target)) {
        emptyPress = {
          pointerId: event.pointerId,
          start: { x: event.clientX, y: event.clientY },
          canBand: canBand(event),
          banded: false,
        };
      }
    }
  }

  // ---- The rubber band ----

  /**
   * A press on an empty spot: it may become a rubber band. `banded` stays once
   * it has, even when Esc took the band away.
   */
  type EmptyPress = { pointerId: number; start: Point; canBand: boolean; banded: boolean };

  /** The press on an empty spot under way, until it is let go. */
  let emptyPress: EmptyPress | null = null;

  /**
   * Only a player draws a band, with a mouse or a pen and no modifier key:
   * a finger drag scrolls the table, Alt pings and Shift draws arrows.
   */
  function canBand(event: PointerEvent): boolean {
    return (
      view.you.role === 'player' &&
      event.pointerType !== 'touch' &&
      !event.altKey &&
      !event.shiftKey
    );
  }

  /** The band between two points of the screen, cut to the table: what lies past it does not show. */
  function bandBetween(from: Point, to: Point): Rect {
    const band = {
      left: Math.min(from.x, to.x),
      top: Math.min(from.y, to.y),
      right: Math.max(from.x, to.x),
      bottom: Math.max(from.y, to.y),
    };
    const table = wrap?.getBoundingClientRect();
    return table ? intersect(band, table) : band;
  }

  /** The free table cards drawn, measured on the screen: those a band can select. */
  function freeCardBoxes(): ReadonlyMap<string, Rect> {
    const boxes: [string, Rect][] = [];
    for (const card of cards) {
      if (!isFree(card)) {
        continue;
      }
      const rect = app?.querySelector(tableCard(card.id))?.getBoundingClientRect();
      if (rect) {
        boxes.push([card.id, rect]);
      }
    }
    return new Map(boxes);
  }

  /** The band follows the pointer once it has moved past the drag threshold. */
  function onPointerMove(event: PointerEvent): void {
    interaction.pointerMoved(event);
    const press = emptyPress;
    if (!press?.canBand || event.pointerId !== press.pointerId) {
      return;
    }
    // No button down any more: it was let go outside the window, and its pointerup was missed.
    if (event.buttons === 0) {
      forgetEmptyPress();
      return;
    }
    const at = { x: event.clientX, y: event.clientY };
    if (interaction.band === null) {
      // Esc took the band away: it does not come back for this press.
      if (press.banded) {
        return;
      }
      if (Math.hypot(at.x - press.start.x, at.y - press.start.y) < DRAG_THRESHOLD) {
        return;
      }
      // What the press started selecting in the page's text goes: the band takes the gesture.
      window.getSelection()?.removeAllRanges();
      press.banded = true;
    }
    interaction.band = bandBetween(press.start, at);
  }

  /**
   * A press on an empty spot let go: a band selects the cards it touches,
   * none when it touches nothing, and one Esc took away selects nothing; a
   * plain click clears the group and the viewer's own arrows.
   */
  function endEmptyPress(event: PointerEvent): void {
    const press = emptyPress;
    if (!press || event.pointerId !== press.pointerId) {
      return;
    }
    const band = interaction.band;
    forgetEmptyPress();
    if (!press.banded) {
      interaction.clearGroup();
      clearOwnArrows();
      return;
    }
    if (band !== null) {
      interaction.setGroup(new Set(cardsInBand(band, freeCardBoxes())));
    }
    // The click that ends the band is no click on an empty spot or a card: the arrows stay, no menu opens.
    interaction.swallowNextClick();
  }

  function forgetEmptyPress(): void {
    emptyPress = null;
    interaction.band = null;
  }

  /** A Shift + drag arrow goes to the card the button is let go over. */
  function onPointerUp(event: PointerEvent): void {
    if (interaction.arrowDrag) {
      endArrowAt(tableCardOf(document.elementFromPoint(event.clientX, event.clientY)));
    }
    endEmptyPress(event);
  }

  /** A finger that scrolls the table, among others, cancels its press: it is no click. */
  function onPointerCancel(): void {
    if (interaction.arrowDrag) {
      interaction.endArrow();
    }
    forgetEmptyPress();
  }

  function onKeydown(event: KeyboardEvent): void {
    // Escape leaves select mode and keeps the group, which the table's Escape would clear. Taking the key keeps
    // fullscreen (see the "Escape in fullscreen" project memory note).
    if (selecting && event.key === 'Escape' && !modal.open) {
      event.preventDefault();
      leaveSelectMode();
      return;
    }
    handleKey(event, {
      view,
      items: hoveredItems,
      zoom,
      setZoom: zoomWithButtons,
      run: runItem,
      act: (action) => send(action, targetOfKey(action)),
      showKeys: showKeySheet,
      selectNextDeck: () => {
        if (selected !== null) {
          stepAmong(own, selected, 1);
        }
      },
      canStepHero,
      stepHero,
      canReadyAll,
      sizeOf,
    });
  }

  // ---- The keyboard shortcuts sheet ----

  let keySheetShown = $state(false);
  let keysButton = $state<HTMLButtonElement>();

  function toggleKeySheet(): void {
    keySheetShown = !keySheetShown;
  }

  function showKeySheet(): void {
    keySheetShown = true;
  }

  function hideKeySheet(): void {
    keySheetShown = false;
  }

  function undo(): void {
    act({ kind: 'undo' });
  }

  // Remembered per viewer: the table takes the width the history leaves.
  const HISTORY_COLLAPSED_KEY = 'itf-history-collapsed';
  let historyCollapsed = $state(getPref(HISTORY_COLLAPSED_KEY) === '1');

  function toggleHistory(): void {
    historyCollapsed = !historyCollapsed;
    setPref(HISTORY_COLLAPSED_KEY, historyCollapsed ? '1' : '0');
  }

  let wrap = $state<HTMLElement>();
  let app = $state<HTMLElement>();
  let presenceLayer = $state<ReturnType<typeof Presence>>();

  // A new view or a zoom moves the elements under a pointer at rest: the ones
  // it lands on are not hovered by the viewer.
  $effect.pre(() => {
    void view;
    void zoom;
    interaction.redrawn();
  });

  // The selected cards that left the table, went onto a pile, or lie in a row no longer shown drop out
  // of the group: a group drag must not move cards the viewer cannot see.
  $effect.pre(() => {
    const current = tableCards;
    untrack(() => interaction.pruneGroup(current));
  });

  /**
   * Zooms around a point of the screen, keeping the table point under it in
   * place. Without a point, zooms from the left edge, so the decks and
   * identities stay in view. Dock mode does not zoom, nor remember a zoom: a
   * phone always shows its fit, and a pinch only moves the table about.
   */
  async function setZoom(wanted: number, pointX?: number, pointY?: number): Promise<void> {
    if (dockMode) {
      return;
    }
    const from = zoom;
    const next = clampZoom(wanted, zoomMin);
    // The viewer chose it, even when it does not change: the table no longer fits its width.
    chosenZoom = next;
    saveZoom(next);
    if (next === from || !wrap) {
      return;
    }
    const box = wrap.getBoundingClientRect();
    const x = pointX ?? box.left;
    const y = pointY ?? box.top + box.height / 2;
    const scale = next / from;

    // What lies under the point now, in zoomed px of the surface (past the scroller's padding,
    // which keeps the top bar's room at the top on a small screen): the page is not redrawn
    // before the tick.
    const paddingTop = topPadding;
    const underX = wrap.scrollLeft + x - box.left - SCROLL_PADDING;
    const underY = wrap.scrollTop + y - box.top - paddingTop;

    await tick();

    wrap.scrollLeft = Math.max(0, SCROLL_PADDING + underX * scale - (x - box.left));
    wrap.scrollTop = Math.max(0, paddingTop + underY * scale - (y - box.top));
  }

  // The wheel can zoom finer than the 10 % steps: it keeps its own target so
  // small trackpad moves add up instead of rounding away.
  let wheelTarget: number | null = null;

  // What a double tap does not zoom on: an element of the table, which a tap acts on.
  const NOT_EMPTY = '.card, .marker, [data-counter], .chip, button';

  // Touch mode: two fingers pinch-zoom the table and pan it, and a double tap on an empty spot
  // toggles between 100 % and 150 % (touchZoom.ts). The zoom they choose is remembered, as the
  // buttons' is. In dock mode they zoom nothing (setZoom), but two fingers still pan the table and
  // the page itself never pinch-zooms.
  const fingerZoom = touchZoom({
    enabled: () => touchMode.current,
    zoom: () => zoom,
    setZoom: (wanted, x, y) => {
      wheelTarget = null;
      void setZoom(wanted, x, y);
    },
    isEmptySpot: (target) => target instanceof Element && target.closest(NOT_EMPTY) === null,
  });

  function zoomWithButtons(wanted: number): void {
    wheelTarget = null;
    void setZoom(wanted);
  }

  /** Back to the zoom that fits the table's width, which follows the window and the table again. */
  function fitToWidth(): void {
    wheelTarget = null;
    chosenZoom = null;
    forgetZoom();
  }

  function onWheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    const from = wheelTarget ?? zoom;
    wheelTarget = Math.min(ZOOM_MAX, Math.max(zoomMin, from * Math.exp(-event.deltaY * 0.01)));
    void setZoom(wheelTarget, event.clientX, event.clientY);
  }
</script>

<svelte:window
  onpointermove={onPointerMove}
  onpointerdowncapture={(event) => interaction.pointerPressed(event)}
  onclickcapture={(event) => interaction.clicked(event)}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  onkeydown={onKeydown}
  oncontextmenu={preventNativeMenu}
  onresize={measureFocus}
  bind:innerWidth={windowWidth}
  bind:innerHeight={windowHeight}
/>

<!--
  The hand sheet's header: the hero selector to switch between the viewer's decks, or the one deck's
  hero alone.
-->
{#snippet deckPicker()}
  {#if ownEntries.length > 1 && selected !== null}
    <HeroPicker
      entries={ownEntries}
      current={selected}
      label="Hand shown"
      compact
      onpick={selectSeat}
    />
  {:else if dockDeck}
    <span class="deck-avatar" style:--seat={dockColor} aria-hidden="true">
      {#if dockDeck.heroImage}
        <CardArt src={dockDeck.heroImage} aspect={1} />
      {/if}
    </span>
  {/if}
{/snippet}

<!-- The zoom is set on the whole page, so a layer outside the table (a drag ghost) can follow it. -->
<div
  class="app"
  class:arrowing={interaction.arrowFrom !== null}
  class:dragging={interaction.dragging !== null}
  class:history-collapsed={historyCollapsed && sidePanel}
  class:banding={interaction.band !== null}
  class:compact={small.current}
  class:touch={touchMode.current}
  class:dock-mode={dockMode}
  class:dock-rail={dockRail}
  class:tablet
  style:--z={zoom}
  style:--you={playerColorVar(view.you.color)}
  style:--edge="{TABLE_EDGE}px"
  style:--edge-bottom="{TABLE_EDGE_BOTTOM}px"
  style:--controls-bottom="{controlsBottom}px"
  style:--content-gutter="{SCROLL_PADDING}px"
  style:--bar-start="{barStart}px"
  style:--bar-room="{barRoom}px"
  style:--table-bottom={dockMode ? `${bottomPadding}px` : undefined}
  bind:this={app}
>
  <div class="top">
    <TopBar
      spectators={view.spectators}
      {crumbs}
      onend={view.you.host ? () => session.lobby('end') : undefined}
      viewMode={seats.length > 1 ? viewMode : undefined}
      onviewmode={changeViewMode}
      readyAll={own.length > 0
        ? { disabled: !canReadyAll, run: () => act({ kind: 'readyAll' }) }
        : undefined}
      scroller={wrap}
      autoHide={!dockMode}
      bind:hidden={() => barHidden, (hidden) => (scrolledAway = hidden)}
    />
  </div>

  <div
    class="tablewrap"
    role="presentation"
    bind:this={wrap}
    bind:clientHeight={visibleHeight}
    bind:clientWidth={visibleWidth}
    bind:offsetWidth={scrollerWidth}
    onpointerdowncapture={onTablePointerDown}
    onclick={onTableClick}
    oncontextmenu={onTableContextMenu}
    onwheel={onWheel}
    onscroll={measureFocus}
    {@attach fingerZoom}
  >
    <div class="table">
      <Surface
        cards={tableCards}
        piles={tablePiles}
        {owners}
        {topOf}
        {faceOf}
        {captionOf}
        onbrowse={openBrowseBox}
        width={surface.w}
        height={surface.h}
        {markers}
        markersMovable={view.you.role === 'player'}
        canDrag={(element) => sourceOf(element, view) !== null}
        {shifts}
        glide={shiftsGlide}
        grid={snapGrid}
      />
      <!-- The arrows follow the cards while they move. -->
      <Arrows
        {view}
        root={app}
        layout={[zoom, surface, tableMap, arrowsShown ? motion.frame : 0]}
        raised={interaction.dragging !== null || interaction.landing !== null || motion.moving}
      />
    </div>
  </div>

  <Presence
    bind:this={presenceLayer}
    {view}
    presence={session.presence}
    send={(fields) => session.sendPresence(fields)}
    away={modal.open || handRaised || handSheetShown}
    root={app}
    {zoom}
    {faceOf}
    {tableMap}
    layout={[surface, tableMap]}
  />

  {#if interaction.band}
    {@const band = interaction.band}
    <div
      class="band"
      aria-hidden="true"
      style:left="{band.left}px"
      style:top="{band.top}px"
      style:width="{band.right - band.left}px"
      style:height="{band.bottom - band.top}px"
    ></div>
  {/if}

  {#if catalog === 'failed'}
    <p class="notice" role="alert">Card data could not be loaded: cards show as placeholders.</p>
  {/if}

  <!--
    The bottom right corner of the table. Touch screens have no Z key: without the side column,
    Undo floats there, left of the zoom control. On a tablet (historySheetMode), History shares
    Undo's bar, as in the dock: it opens the history sheet. On a small screen, Undo and the zoom
    control share one bar above the resting hand. In dock mode the dock has Undo and History, and
    the zoom is fixed (setZoom).
  -->
  {#if !dockMode}
    <div
      class="corner"
      class:floatbar={small.current}
      bind:this={cornerBox}
      bind:clientHeight={cornerHeight}
      bind:offsetWidth={cornerWidth}
    >
      {#if narrow.current}
        <div class="undo floatbar">
          <!-- aria-disabled rather than disabled, so that the tooltip saying why still shows. -->
          <button
            class="btn-ghost"
            aria-label={UNDO_TIP}
            data-tip={view.canUndo ? UNDO_TIP : NOTHING_TO_UNDO}
            aria-disabled={!view.canUndo}
            onclick={() => {
              if (view.canUndo) {
                undo();
              }
            }}
            {@attach pointerBlur}
          >
            <Icon name="undo" />
          </button>
          {#if historySheetMode}
            <!-- The dock's History button, at Undo's size. -->
            <button
              class="btn-ghost"
              aria-label="History"
              data-tip="History"
              onclick={openHistory}
              {@attach pointerBlur}
            >
              <Icon name="history" />
            </button>
          {/if}
        </div>
        {#if small.current}
          <span class="floatbar-sep" aria-hidden="true"></span>
        {/if}
      {/if}
      <!--
      Touch mode has no keyboard: no shortcuts button. The % label goes back to a phone's fit,
      or to 100 % on a wider screen.
    -->
      <ZoomControl
        {zoom}
        onzoom={zoomWithButtons}
        onfit={phone.current ? fitToWidth : undefined}
        onkeys={touchMode.current ? undefined : toggleKeySheet}
        keysShown={keySheetShown}
        bind:keysButton
      />
    </div>
  {/if}

  <!--
    In dock mode too, compact, floating above the dock or right of the rail: there it is the only way
    to pick the player shown in "Villain + player", and to switch decks without opening the hand.
  -->
  {#if pickerShown && pickerCurrent !== null}
    <div class="seatpick">
      <HeroPicker
        entries={pickerEntries}
        current={pickerCurrent}
        label={focused ? 'Player shown' : 'Hand shown'}
        compact={small.current}
        onpick={selectSeat}
        bind:width={pickerWidth}
      />
    </div>
  {/if}

  {#if keySheetShown}
    <KeysSheet
      anchor={keysButton}
      alignTo={cornerBox}
      severalDecks={own.length > 1}
      severalHeroes={canStepHero}
      onclose={hideKeySheet}
    />
  {/if}

  <!--
    The hands, clipped to the table's column: their backdrop reaches its edges and no further. In
    dock mode, the dock's hand button opens the hand in a sheet instead.
  -->
  {#if !dockMode}
    <div class="hands">
      <!--
      Keyed by place, not by seat: a single hand stays the same one as Q or the selector shows
      another deck's, so a hand pinned up by a tap stays up to read that one too.
    -->
      {#each handSeats as seat, i (i)}
        {@const cardSize = raisedCardOf(seat)}
        <Hand
          cards={handOf(seat)}
          {faceOf}
          {captionOf}
          {cardSize}
          restCardSize={baseHandCard}
          restDrop={handRestDrop(baseHandCard, baseHandDrop, cardSize)}
          {seat}
          color={playerColorVar(seatColor(view, seat) ?? 0)}
          label={handLabel(seat)}
          active={seat === handSeat}
          onactivate={() => selectSeat(seat)}
          inset={handsRoom}
          restPlace={restPlaces[i]}
          hidden={handRaised && seat !== handSeat}
          bind:open={handsOpen[i]}
        />
      {/each}
    </div>
  {/if}

  {#if dockMode}
    <Dock
      hand={dockCards}
      seat={selected ?? undefined}
      avatar={dockDeck?.heroImage ? [dockDeck.heroImage] : null}
      heroName={dockDeck?.heroName ?? ''}
      color={dockColor}
      canUndo={view.canUndo ?? false}
      dropActive={dockDropActive}
      landscape={dockRail}
      onhand={openHandSheet}
      onundo={undo}
      onhistory={openHistory}
    />
    <!-- The safe areas under the dock and over the table, measured (safeBottom, safeTop). -->
    <div class="safe-bottom" aria-hidden="true" bind:clientHeight={safeBottom}></div>
    <div class="safe-top" aria-hidden="true" bind:clientHeight={safeTop}></div>
  {/if}

  {#if handSheetShown && selected !== null}
    <HandSheet
      cards={dockHand}
      {faceOf}
      seat={selected}
      landscape={dockRail}
      picker={deckPicker}
      canDiscard={handCanDiscard}
      onplay={(id) => runHandAction(id, 'play')}
      ondiscard={(id) => runHandAction(id, 'discard')}
      onclose={closeHandSheet}
    />
  {/if}

  {#if historyShown}
    <HistorySheet
      log={view.log}
      canUndo={view.canUndo ?? false}
      onundo={undo}
      onclose={closeHistory}
      nameOf={historyName}
    />
  {/if}

  <Flights {faceOf} {captionOf} />

  <DragLayer
    {view}
    {zoom}
    root={app}
    {faceOf}
    {sizeOf}
    {tableMap}
    grid={snapGrid}
    {selected}
    act={(action, element) => act(action, element.kind === 'marker' ? null : element)}
    onhand={selectSeat}
    ondrag={(drag) => session.sendPresence({ drag })}
    onpreview={feedPreview}
    lastError={session.lastError}
  />

  {#if arrowHintShown && wrap}
    <ArrowHint anchor={arrowSource} text={ARROW_HINT} bounds={wrap} {zoom} version={view} />
  {/if}

  {#if interaction.contextMenu && contextHeader && contextContent && wrap}
    <!-- Created afresh for each opening: the focus it gives back is the one before that opening. -->
    {#key interaction.contextMenu}
      <ContextMenu
        header={contextHeader}
        entries={contextContent.entries}
        note={contextContent.note}
        at={interaction.contextMenu.at}
        bounds={wrap}
        {zoom}
        onrun={runContextItem}
        onclose={() => interaction.closeContextMenu()}
      />
    {/key}
  {/if}

  {#if sheetElement && inspectorHeader && inspectorContent}
    <!-- Created afresh for each opening, as the menu: the focus it gives back is the one before it. -->
    {#key inspectorOpenings}
      <CardSheet
        header={inspectorHeader}
        entries={inspectorContent.entries}
        note={inspectorContent.note}
        images={inspectorImages(sheetElement)}
        nextImages={inspectorNextImages(sheetElement)}
        landscape={inspectorLandscape(sheetElement)}
        exhausted={inspectorExhausted(sheetElement)}
        tilts={inspectorTilts(sheetElement)}
        counters={inspectorCounters(sheetElement)}
        stack={inspectorStack(sheetElement)}
        cardId={sheetElement.kind === 'card' ? sheetElement.id : undefined}
        onrun={runInspectorItem}
        onstep={stepInspected}
        onpick={inspectStackCard}
        onclose={closeInspector}
      />
    {/key}
  {/if}

  {#if selecting}
    <div class="notice selectbar" role="group" aria-label="Select mode">
      <span>{interaction.group.size} selected</span>
      <span aria-hidden="true">·</span>
      <button class="btn-ghost done" onclick={leaveSelectMode}>Done</button>
    </div>
  {/if}

  {#if counterShown}
    <TokenPill
      anchor={counterAnchor}
      label={counterName(counterShown.target.kind, counterShown.target.name)}
      value={counterShown.value}
      signed={counterShown.target.kind === 'modifier'}
      {zoom}
      version={view}
      onstep={stepCounter}
    />
  {/if}

  {#if shownBox}
    {#key boxKey}
      <CardBox
        box={shownBox}
        {view}
        {facesOf}
        {englishName}
        {sizeOf}
        readOnly={view.you.role !== 'player'}
        {selected}
        act={actInBox}
        lastError={session.lastError}
        onclose={closeBox}
        tileWidth={raisedCard.w}
      />
    {/key}
  {/if}

  {#if asking}
    <AskCount
      title={asking.title}
      question={asking.question}
      max={askedMax}
      ok={asking.ok}
      onconfirm={answer}
      oncancel={() => (asking = null)}
    />
  {/if}

  {#if sidePanel}
    <aside class="side" id="history-panel" aria-label="History">
      <SidePanel
        log={view.log}
        canUndo={view.canUndo}
        onundo={undo}
        collapsed={historyCollapsed}
        ontoggle={toggleHistory}
        controls="history-panel"
        nameOf={historyName}
      />
    </aside>
  {/if}

  {#if drawnPreview}
    <!-- Created again in its new corner: it fades in there. -->
    {#key focusCorner}
      <div
        class="peek {focusCorner}"
        class:land={drawnPreview.landscape}
        class:leaving={!preview}
        style:margin={focusMargin(focusCorner)}
        style:translate={focusShift(focusCorner)}
        onanimationend={onPreviewAnimationEnd}
        bind:offsetWidth={focusWidth}
        bind:offsetHeight={focusHeight}
      >
        <CardPreview preview={drawnPreview} hidden={!preview} />
      </div>
    {/key}
  {/if}
</div>

<style>
  /* While the table shows, the page is exactly the window and never scrolls. */
  :global(html.fixed-screen),
  :global(html.fixed-screen body) {
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
  }

  /*
    Exactly the window. What lies past its edges, as the resting hand lowered under the bottom, is
    clipped: it never reaches the page, which would scroll.
  */
  .app {
    /*
      The height of a button in the bars floating at the bottom of the table (the zoom control, the
      narrow screen's Undo, the hero selector): with the same padding and the same room under them
      (--edge-bottom), the bars share their top and bottom edges.
    */
    --bar-button: 32px;
    /*
      Above every card, whose z-index the server raises with each move (it only grows): the
      out-of-play chips (Surface.svelte) and the markers (MarkerToken.svelte).
    */
    --above-cards: 100000;
    display: grid;
    height: 100vh;
    height: 100dvh;
    overflow: clip;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr) 320px;
    grid-template-areas:
      'top top'
      'table side';
    transition: grid-template-columns 0.2s ease;
    /* Something held down opens no callout of the system on iOS (save, copy, share an image). */
    -webkit-touch-callout: none;
  }

  /* A text field keeps its callout, to paste in. */
  .app :global(:is(input, textarea, [contenteditable])) {
    -webkit-touch-callout: default;
  }

  /* A finger needs taller targets in the bars at the bottom. */
  .app.touch {
    --bar-button: 44px;
  }

  /* The history collapsed to a strip: the table takes the rest. */
  .app.history-collapsed {
    grid-template-columns: minmax(0, 1fr) 44px;
  }

  /*
    The bar's icons sit close to the window's edge, over the side panel, not the play area. The
    table pads by the side safe areas itself (dock mode, below; elsewhere they are 0): the bar
    adds none of its own.
  */
  .top {
    --bar-gutter-end: 8px;
    --bar-inset-left: 0px;
    --bar-inset-right: 0px;
    grid-area: top;
  }

  /*
    No stacking context of its own: the arrows inside it stack with the page's layers
    (Arrows.svelte), while the surface isolates the cards' own z-indexes.
  */
  .tablewrap {
    grid-area: table;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: #2c3654 transparent;
    position: relative;
    background: var(--table-bg);
    min-width: 0;
  }

  /*
    As wide and tall as the surface, which the padding keeps off the scroller's edges, and off the
    top bar floating over it (--bar-start).
  */
  .table {
    position: relative;
    width: max-content;
    padding: calc(var(--content-gutter) + var(--bar-start)) var(--content-gutter)
      var(--content-gutter);
  }

  /*
    Rings drawn around the rounded card, for cards and piles alike, on the card's box rather than on its
    image: the white ring of the hovered element and of the cards of the hovered history line,
    and the drop outlines, then the rings the card draws itself. All lie on one box.
  */
  .table :global(.card.hovered)::before,
  .table :global(.card.highlighted)::before,
  .table :global(.card.drop-target)::before,
  .table :global(.card.drop-pile)::before {
    content: '';
  }

  .table :global(.card.hovered)::before,
  .table :global(.card.highlighted)::before,
  .table :global(.card.drop-target)::before,
  .table :global(.card.drop-pile)::before,
  .table :global(.card > .rring),
  .table :global(.card > .sring) {
    position: absolute;
    inset: 1%;
    border-radius: 6px;
    pointer-events: none;
    z-index: 1;
  }

  /* The hovered card or pile, or the one whose context menu is open, has a white ring. */
  .table :global(.card.hovered)::before,
  .table :global(.card.highlighted)::before {
    box-shadow:
      0 0 0 2px #ffffffb0,
      0 0 22px 6px #ffffff38;
  }

  /*
    The card or pile another player previews: the hover ring, in their colour. Drawn by the card
    itself (CardView, PileView), it moves, turns and tilts with it.
  */
  .table :global(.card > .rring) {
    box-shadow:
      0 0 0 2px var(--c),
      0 0 22px 6px color-mix(in srgb, var(--c) 22%, transparent);
  }

  /* A card the rubber band selected: a ring and a halo, in the viewer's colour. */
  .table :global(.card > .sring) {
    box-shadow:
      0 0 0 2px var(--you),
      0 0 0 7px color-mix(in srgb, var(--you) 22%, transparent);
  }

  /* Where a drop would go: under a card (the threat orange), or onto a pile. */
  .table :global(.card.drop-target)::before {
    outline: 3px dashed var(--warn);
    outline-offset: 2px;
  }

  .table :global(.card.drop-pile)::before {
    outline: 3px dashed var(--sel);
    outline-offset: 3px;
  }

  /*
    The backs of the cards and piles the table draws, and of their drag ghosts (DragLayer,
    Presence), are 80 % of a hand card: their frame, label and deck caption shrink with them, so
    a long caption ("INVOCATION") fits. CardBack keeps the hand's sizes for the hand and the flights.
  */
  .app :global(.card .back) {
    font-size: 10px;
    letter-spacing: 0.8px;
    box-shadow:
      inset 0 0 0 6px var(--bg),
      inset 0 0 0 7px var(--frame);
  }

  .app :global(.card .caption) {
    max-width: calc(100% - 13px);
    padding: 3px 9px 3px 6px;
    border-radius: 3px;
    font-size: 10px;
    letter-spacing: 0.8px;
  }

  /* The 10-unit grid shows more clearly while something is dragged. */
  .app.dragging {
    --dot: #34405f;
  }

  /*
    Whatever lies under the pointer while something is dragged, the pointer holds it. Important:
    the grab and pointer cursors of the cards and piles are set by their own components.
  */
  .app.dragging,
  .app.dragging :global(*) {
    cursor: grabbing !important;
  }

  /*
    The rubber band, on the screen in the viewer's colour: over the cards and the arrows at rest,
    under the controls and the hand. Nothing gets text-selected while it is drawn.
  */
  .band {
    position: fixed;
    z-index: 2;
    border: 1px dashed var(--you);
    border-radius: 2px;
    background: color-mix(in srgb, var(--you) 12%, transparent);
    pointer-events: none;
  }

  .app.banding {
    user-select: none;
    -webkit-user-select: none;
  }

  /* Picking the card an arrow points at. */
  .app.arrowing :global(.surface .card) {
    cursor: crosshair;
  }

  .side {
    grid-area: side;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-left: 1px solid var(--panel-2);
    min-height: 0;
  }

  /*
    Under the top bar floating over the table (--bar-room), following it as it slides: on its
    translate, which the compositor moves with no new layout.
  */
  .notice {
    grid-area: table;
    align-self: start;
    justify-self: center;
    z-index: 40;
    margin: 8px 0 0;
    translate: 0 var(--bar-room);
    transition: translate 0.2s ease;
    padding: 4px 14px;
    background: var(--panel-2);
    border: 1px solid var(--accent);
    border-radius: 999px;
    font-size: 13px;
  }

  /* The select mode's pill (touch mode): a notice with its Done button, a finger's size. */
  .selectbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px 0 16px;
  }

  .selectbar .done {
    min-height: 44px;
    padding: 0 12px;
    border-radius: 999px;
    color: var(--accent);
    font-weight: 600;
  }

  /*
    The hands' column: the table's, laid out as one cell for the hands and the veil, clipped across
    only. It takes no pointer and makes no stacking context: the hands and the veil stack with the
    page's layers.
  */
  .hands {
    grid-area: table;
    display: grid;
    grid-template: 'table' minmax(0, 1fr) / minmax(0, 1fr);
    overflow-x: clip;
    pointer-events: none;
  }

  /*
    At the bottom left, as the zoom control at the bottom right, but above the veil (Hand.svelte,
    2550): the hero selector shows in full while a hand is raised, to pick another one. Below the
    raised hand (2600), which covers it on a small screen.
  */
  .seatpick {
    grid-area: table;
    align-self: end;
    justify-self: start;
    z-index: 2575;
    margin: 0 0 var(--edge-bottom) var(--edge);
  }

  /*
    On a small screen, above the bar at the bottom right (--controls-bottom, then that bar: its
    buttons, its 4 px padding and 1 px border both ways, and 8 px between): on a phone, the two
    would meet.
  */
  .app.compact .seatpick {
    margin-bottom: calc(var(--controls-bottom) + var(--bar-button) + 18px);
  }

  /*
    Dock mode: just above the dock's bar (--table-bottom, its room above the safe area), on its left
    edge. As the dock, under the top bar and the sheets.
  */
  .app.dock-mode .seatpick {
    z-index: 30;
    margin: 0 0 var(--table-bottom) calc(8px + env(safe-area-inset-left));
  }

  /* The rail: at the top of the table right of it, under the top bar (--bar-room, the notch included). */
  .app.dock-rail .seatpick {
    align-self: start;
    margin: calc(var(--bar-room) + 8px) 0 0 8px;
  }

  /* As the zoom control: under the veil and the raised hand. */
  .corner {
    grid-area: table;
    align-self: end;
    justify-self: end;
    z-index: 30;
    margin: 0 var(--edge) var(--edge-bottom) 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /*
    A small screen: Undo and the zoom control share one bar, above the resting hand's strip
    (--controls-bottom), so that neither covers the hand.
  */
  .app.compact .corner {
    margin-bottom: var(--controls-bottom);
    gap: 2px;
  }

  .app.compact .corner .undo,
  .app.compact .corner :global(.zoomctl) {
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
  }

  /* Undo, and History beside it on a tablet. */
  .undo {
    display: flex;
    gap: 2px;
  }

  .undo button {
    width: var(--bar-button);
    height: var(--bar-button);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    color: var(--text-soft);
  }

  .undo :global(svg) {
    width: 18px;
    height: 18px;
    stroke-width: 2;
  }

  /*
    Dock mode: the top bar always shows, below the notch, its background behind the notch too; the
    table keeps the room of both at its start (--bar-start). Over the table, as the bar itself
    (TopBar.svelte, 100): positioned, or the scroller would cover its background.
  */
  .app.dock-mode .top {
    position: relative;
    z-index: 100;
    padding-top: env(safe-area-inset-top);
    background: var(--bg);
  }

  /* With the bar at the bottom, the bottom of the table scrolls out from under the dock. */
  .app.dock-mode .table {
    padding-bottom: var(--table-bottom);
  }

  /* The rail: the table, and all that floats over it, keep right of the rail and the notch. */
  .app.dock-rail {
    padding-left: calc(64px + env(safe-area-inset-left));
  }

  /* The safe area at the bottom of the screen, as tall as it is: measured, never seen. */
  .safe-bottom {
    position: fixed;
    left: 0;
    bottom: 0;
    width: 0;
    height: env(safe-area-inset-bottom);
    visibility: hidden;
    pointer-events: none;
  }

  /* The safe area at the top of the screen, likewise. */
  .safe-top {
    position: fixed;
    left: 0;
    top: 0;
    width: 0;
    height: env(safe-area-inset-top);
    visibility: hidden;
    pointer-events: none;
  }

  /* The one deck's hero in the hand sheet's header, ringed with its seat's colour. */
  .deck-avatar {
    flex: none;
    position: relative;
    width: 36px;
    height: 36px;
    overflow: hidden;
    border-radius: 50%;
    background: var(--seat);
    box-shadow: 0 0 0 3px var(--seat);
  }

  @media (max-width: 900px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'top'
        'table';
    }
  }

  /*
    On a small screen the top bar floats over the top of the play area, which takes the window's
    whole height: sliding away, it shows the table under it, and nothing else moves. A short screen
    wider than a narrow one (a short window with a mouse) keeps the history column, which then
    runs from the top of the window: the bar floats over the play area only, its icons on the play
    area's edge. Dock mode never has the column (below).
  */
  .app.compact {
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: 'table side';
  }

  .app.compact .top {
    --bar-gutter-end: var(--content-gutter);
    grid-area: table;
    align-self: start;
  }

  /* Without the history column, the bar spans the window, its icons close to the window's edge. */
  @media (max-width: 900px) {
    .app.compact {
      grid-template-areas: 'table';
    }

    .app.compact .top {
      --bar-gutter-end: 8px;
    }
  }

  /*
    Dock mode has no history column at any width, even on a large phone on its side: the table
    takes the window and the bar's icons sit close to the window's edge. On a notched phone on its
    side, the table and its bar keep clear of the right safe area (0 upright), the icons 8px from
    its edge; the rail keeps clear of the left one (.app.dock-rail).
  */
  .app.dock-mode {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'table';
    padding-right: env(safe-area-inset-right);
  }

  .app.dock-mode .top {
    --bar-gutter-end: 8px;
  }

  /*
    The preview, in a corner of the play area that focus.ts chooses (chooseCorner): the bottom
    right, above the zoom control, unless it would hide the whole hovered element there, and
    never the hero selector's corner. Still while the table scrolls under it. As the zoom
    control: over the table, under the other players' presence (2500), the veil and the raised
    hand (2600). Never so tall that it leaves the table; the pointer goes through it.
  */
  .peek {
    grid-area: table;
    align-self: start;
    justify-self: end;
    z-index: 30;
    position: relative;
    /*
      A 358 px wide portrait card in its 10 px padding and 1 px border, never wider than 45 % of
      the table, nor so tall that it reaches the zoom control: the top bar and the corners keep
      200 px. Keep in step with previewCardWidth (layout.ts): the raised hand's cards follow this
      card.
    */
    width: min(380px, 45%, calc((100dvh - 200px) * 5 / 7 + 20px));
    padding: 10px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    box-shadow: 0 14px 36px #000000a6;
    pointer-events: none;
    /* In a top corner, it follows the top bar as it slides (focusShift). */
    transition: translate 0.2s ease;
  }

  /* A landscape card: 498 px wide. */
  .peek.land {
    width: min(520px, 45%);
  }

  /* In another corner, when home would hide the whole hovered element (focus.ts). */
  .peek.top-left,
  .peek.bottom-left {
    justify-self: start;
  }

  .peek.bottom-left,
  .peek.bottom-right {
    align-self: end;
  }

  /* It fades in as it shows, or at its new corner, and out as it goes (onPreviewAnimationEnd). */
  .peek {
    animation: focus-in 0.11s ease-out;
  }

  .peek.leaving {
    animation: focus-out 0.11s ease-in forwards;
  }

  @keyframes focus-in {
    from {
      opacity: 0;
    }
  }

  @keyframes focus-out {
    to {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .peek,
    .peek.leaving {
      animation: none;
    }

    .peek,
    .notice {
      transition: none;
    }

    .app {
      transition: none;
    }
  }
</style>
