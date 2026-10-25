<!--
  The table page: the top bar, the table column (one surface for everyone,
  scrolling both ways) and the side column (history), which collapses to a
  slim strip. The preview of the hovered card floats over the table's bottom
  right corner; touch mode previews nothing (touch.ts). On a narrow screen
  there is no side column.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { modal } from '../components/modal.svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { MediaQuery } from 'svelte/reactivity';
  import Tooltip from '../components/Tooltip.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { TOP_BAR_HEIGHT } from '../lib/autoHide.svelte';
  import { gameCards, knownCard, loadGameCards, loadIndex } from '../lib/catalog';
  import { storedLang } from '../lib/lang';
  import { localizedFace, localizedName } from '../lib/localize';
  import { getPref, setPref } from '../lib/prefs';
  import { SMALL_SCREEN_QUERY } from '../lib/screen';
  import { selectionIndicator } from '../lib/selectionIndicator';
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
    Size,
    View,
  } from '../lib/types';
  import { MARKERS, markerPoint } from '../lib/types';
  import { diffViews, MAX_APART_MS } from './animate';
  import {
    actionsFor,
    counterName,
    countersOf,
    deckCount,
    isLocked,
    type ActionItem,
    type CountQuestion,
    type LocalAction,
    type TableElement,
  } from './actions';
  import ArrowHint from './ArrowHint.svelte';
  import Arrows from './Arrows.svelte';
  import AskCount from './AskCount.svelte';
  import type { LocalBox, ShownBox } from './boxes';
  import CardBox from './CardBox.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import {
    cardHeader,
    contextItems,
    pileHeader,
    type ContextEntry,
    type ContextHeader,
  } from './contextItems';
  import DragLayer from './DragLayer.svelte';
  import { DRAG_THRESHOLD, intersect, sourceOf, type Point, type Rect } from './drag';
  import Flights from './Flights.svelte';
  import { backCaption, isHidden } from './face';
  import Hand from './Hand.svelte';
  import { interaction, type PreviewChange } from './interaction.svelte';
  import { handleKey } from './keys';
  import KeysSheet from './KeysSheet.svelte';
  import {
    contentWidth,
    HAND_CARD,
    HAND_CARD_NARROW,
    HAND_REST_DROP,
    handRestDrop,
    isOutOfPlay,
    chipsByFrame,
    ownerFrames,
    raisedHandCard,
    restingStrip,
    smallHandCard,
    smallHandDrop,
    surfaceSize,
  } from './layout';
  import {
    ALL_ROWS,
    focusRows,
    lastRow,
    rowOfSeat,
    saveViewMode,
    storedViewMode,
    type ViewMode,
  } from './rows';
  import { motion } from './motion.svelte';
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
    seatOf,
  } from './seats';
  import { cardsInBand, isFree } from './selection';
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
  import SidePanel from './SidePanel.svelte';
  import Surface, { type OwnerBox } from './Surface.svelte';
  import { TOUCH_MODE_QUERY } from './touch';
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

  // P5a-R2: the cards of the game are loaded once, then card sizes are looked up synchronously.
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
  const cardsById = $derived(new Map(cards.map((card) => [card.id, card])));

  // ---- The viewer's decks ----

  // The viewer's own seats, one per deck (spec 5); none for a spectator.
  const own = $derived(ownSeats(view));
  // The deck picked in the player selector, with Q or by dragging a card to its hand, kept while it is
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
    const topId = (pile.cards ?? [])
      .filter((id) => !taken.includes(id) && !motion.flying.has(id))
      .at(-1);
    return topId === undefined ? undefined : cardsById.get(topId);
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
   * Picks a seat, in the player selector or otherwise: "Villain + player" shows its row, and when it is
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
  // villain and that player. The player selector at the bottom left, listing every seat, shows only
  // then: "All" already shows every hero.
  const focused = $derived(viewMode === 'focus' && seats.length > 1 && shownSeat !== null);

  // The selected deck's hand, unless "Villain + player" shows another player's row: then no hand shows,
  // as for a spectator, while shared-card actions stay credited to the selected deck.
  const handSeat = $derived(
    focused && shownSeat !== null && !own.includes(shownSeat) ? null : selected,
  );
  const handCards = $derived(
    handSeat !== null
      ? (view.table?.hands?.[areaOf(handSeat)] ?? []).flatMap((id) => {
          const card = cardsById.get(id);
          return card ? [card] : [];
        })
      : undefined,
  );

  const rowMap = $derived(
    focused && shownSeat !== null
      ? focusRows(rowOfSeat(piles, shownSeat), lastRow(piles))
      : ALL_ROWS,
  );

  // Shift + ← / → steps through the selector's heroes; in "All", through the viewer's own decks.
  const canStepHero = $derived(focused || own.length > 1);

  /** Picks the previous or next hero (Shift + ← / →): in the player selector, else among own decks. */
  function stepHero(step: -1 | 1): void {
    if (focused && shownSeat !== null) {
      stepSeat(shownSeat, step);
    } else {
      stepOwnDeck(step);
    }
  }

  /** Picks the seat `step` swatches after the current one in the player selector, round it. */
  function stepSeat(current: number, step: number): void {
    const choices = seatedDecks.map((deck) => deck.seat);
    const index = choices.indexOf(current);
    selectSeat(choices[(index + step + choices.length) % choices.length] ?? current);
  }

  /** Selects the viewer's deck `step` decks after the selected one, round their decks. */
  function stepOwnDeck(step: number): void {
    if (selected === null) {
      return;
    }
    const index = own.indexOf(selected);
    selectSeat(own[(index + step + own.length) % own.length] ?? selected);
  }

  // The arrow keys in the player swatches, as in any radio group.
  const SEAT_STEPS: Record<string, number> = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  };

  /** Moves the choice, and the keyboard focus with it, to the next or previous swatch. */
  async function onSeatKey(event: KeyboardEvent, current: number): Promise<void> {
    const step = SEAT_STEPS[event.key];
    if (step === undefined) {
      return;
    }
    // Taken: the table's own shortcuts must not see it.
    event.preventDefault();
    const group = event.currentTarget as HTMLElement;
    stepSeat(current, step);
    await tick();
    group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }

  /** What lies at a height of the table, drawn where the view mode shows it; nothing when hidden. */
  function shown<T extends { y: number }>(items: T[]): T[] {
    return items.flatMap((item) => {
      const y = rowMap.toDisplay(item.y);
      return y === null ? [] : [{ ...item, y }];
    });
  }

  // Out-of-play piles are not drawn: the chips on their owner's frame open them.
  const tablePiles = $derived(shown(piles.filter((pile) => !isOutOfPlay(pile))));
  const tableCards = $derived(shown(cards.filter((card) => card.zone === 'table')));

  /** The frames around each owner's deck and discard pile, named after their owner. */
  const owners = $derived.by(() => {
    const frames = ownerFrames(tablePiles);
    const chips = chipsByFrame(frames, piles);
    return frames.map((frame, i): OwnerBox => {
      const outOfPlay = chips[i] ?? [];
      const { name: ownerName, color } = ownerLook(view, frame.owner);
      const name = frame.label ?? ownerName;
      // Only a seated deck has a hand: neither the villain nor an empty seat.
      const deck = seatDeck(view, frame.owner);
      if (!deck) {
        return { frame, name, color, outOfPlay };
      }
      const inHand = `${deck.handCount} ${deck.handCount === 1 ? 'card' : 'cards'} in hand`;
      return { frame, name, color, tip: inHand, outOfPlay };
    });
  });

  // ---- The screen ----

  // The breakpoints of the @media rules below. On a narrow screen the side
  // column goes: the history is not shown.
  const narrow = new MediaQuery('max-width: 900px');
  // A phone held upright: the table zooms further out, and fits its width until the viewer zooms.
  const phone = new MediaQuery('max-width: 600px');
  // A phone either way up: the top bar floats over the play area, the hand's cards follow the
  // window, and the controls at the bottom right gather in one bar above the resting hand.
  const small = new MediaQuery(SMALL_SCREEN_QUERY);
  const touchMode = new MediaQuery(TOUCH_MODE_QUERY);

  // The window's size, in px: a small screen's hand cards follow it.
  let windowWidth = $state(window.innerWidth);
  let windowHeight = $state(window.innerHeight);

  // The interaction state is shared: it previews nothing in touch mode.
  $effect.pre(() => {
    interaction.setTouchMode(touchMode.current);
  });

  // ---- The zoom ----

  // The zoom the viewer chose (buttons, keys, Ctrl + wheel), remembered; null until then, or since
  // the % label went back to the fit on a phone: the table then shows the screen's default zoom.
  let chosenZoom = $state(storedZoom());
  const zoomMin = $derived(phone.current ? ZOOM_MIN_SMALL : ZOOM_MIN);

  // The scroller pads the surface, so that glows, tilted cards and outlines near an edge show.
  const SCROLL_PADDING = 24;
  // Kept free for a vertical scrollbar when fitting. Measured with the scrollbar or without, the
  // fit would make the scrollbar come and go, and the fit with it.
  const SCROLLBAR_ROOM = 12;

  // On a small screen the top bar floats over the play area, and slides away as the table scrolls
  // down (TopBar): the table starts below it, and what floats at the top of the play area keeps
  // clear of it while it shows.
  let barHidden = $state(false);
  // The room the bar keeps at the start of the table, and over the top of the play area, in px.
  const barStart = $derived(small.current ? TOP_BAR_HEIGHT : 0);
  const barRoom = $derived(small.current && !barHidden ? TOP_BAR_HEIGHT : 0);

  // The table's visible size, in px.
  let visibleWidth = $state(0);
  let visibleHeight = $state(0);
  // The scroller's width, its scrollbar included, in px.
  let scrollerWidth = $state(0);

  // The zoom that fits the content's width into the scroller, as they are now.
  const contentFit = $derived(
    fitZoom(
      contentWidth(tableCards, tablePiles, sizeOf),
      scrollerWidth - 2 * SCROLL_PADDING - SCROLLBAR_ROOM,
      zoomMin,
    ),
  );
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
  // across it at 100 %; a wider screen shows 100 % and scrolls. Live: a resize or a turn across
  // 600 px switches between the two.
  const defaultZoom = $derived(phone.current ? fittedZoom : 1);
  // The surface size follows it, so it is declared before it.
  const zoom = $derived(chosenZoom === null ? defaultZoom : clampZoom(chosenZoom, zoomMin));

  // In table units: at least what shows, rounded down so that an empty table never scrolls.
  const surface = $derived(
    surfaceSize(tableCards, tablePiles, sizeOf, {
      w: Math.max(0, Math.floor((visibleWidth - 2 * SCROLL_PADDING) / zoom)),
      h: Math.max(0, Math.floor((visibleHeight - 2 * SCROLL_PADDING - barStart) / zoom)),
    }),
  );

  /** Where each marker lies, as the view mode draws it; none for a marker the table does not have. */
  const markers = $derived.by(() => {
    const table = view.table;
    const result: Partial<Record<MarkerName, Point>> = {};
    for (const name of MARKERS) {
      const at = table ? markerPoint(table, name) : undefined;
      const [placed] = at ? shown([at]) : [];
      if (placed) {
        result[name] = placed;
      }
    }
    return result;
  });

  /** The face the preview shows; none for a card back, which tells nothing more on the table. */
  function previewOf(previewed: TableElement | null): Preview | null {
    if (previewed?.kind === 'pile') {
      const pile = piles.find((p) => p.id === previewed.id);
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
      landscape: face?.size === 'land' || face?.size === 'dland',
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

  // The hand's base cards, which the resting hand shows: smaller on a narrow screen, and following
  // the window on a small one, where the resting hand drops by as much of them as elsewhere.
  const baseHandCard = $derived.by(() => {
    if (small.current) {
      return smallHandCard({ w: windowWidth, h: windowHeight });
    }
    return narrow.current ? HAND_CARD_NARROW : HAND_CARD;
  });
  const baseHandDrop = $derived(small.current ? smallHandDrop(baseHandCard.h) : HAND_REST_DROP);

  // The raised hand's cards, 80 % of the preview's. At rest, Hand.svelte draws them at the size of
  // the base card at HAND_REST_SCALE, on the base card's fan, and they drop so that as tall a part
  // of them shows as of the base card dropped by baseHandDrop.
  const raisedCard = $derived(
    raisedHandCard(baseHandCard, { w: scrollerWidth, h: windowHeight }, { small: small.current }),
  );
  const handDrop = $derived(handRestDrop(baseHandCard, baseHandDrop, raisedCard));

  // The room between the resting hand's strip and the controls above it on a small screen, in px.
  const ABOVE_HAND = 8;

  /**
   * The room under the controls at the bottom of the table (the zoom control,
   * the narrow Undo, the player selector), in px. On a small screen they sit
   * above the resting hand, which would cover them otherwise: above the strip
   * restingStrip gives for the base card, which the resting hand, drawn from its
   * raised cards (handRestDrop), does not rise past.
   */
  const controlsBottom = $derived(
    small.current && handCards !== undefined
      ? restingStrip(baseHandCard.h, baseHandDrop) + ABOVE_HAND
      : TABLE_EDGE_BOTTOM,
  );

  // ---- The Focus panel's corner ----

  // Bottom right, unless that hides the whole hovered element (focus.ts).
  let focusCorner = $state<Corner>(HOME);
  // The height of the controls at the bottom right (the zoom control, the narrow Undo): the panel sits above them.
  let cornerHeight = $state(0);
  // What the panel at home clears: those controls, and how much higher than --edge-bottom they sit.
  const homeControls = $derived(cornerHeight + controlsBottom - TABLE_EDGE_BOTTOM);
  // The controls' box at the bottom right: the keyboard shortcuts sheet lines up on its right edge.
  let cornerBox = $state<HTMLElement>();
  // The panel's size, kept from the last time it showed; a portrait card's until then.
  let focusWidth = $state(320);
  let focusHeight = $state(450);
  // The play area and the hovered element on the screen, measured when they may have moved
  // (hover, scroll, zoom, resize, the bar sliding).
  let focusArea: Rect | null = null;
  let focusHovered: DOMRect | null = null;

  /** The hovered card or pile, on the screen. A hovered hand card has no preview to place. */
  function hoveredRect(): DOMRect | null {
    const hovered = interaction.hovered;
    if (!hovered || hovered.kind === 'hand' || !app) {
      return null;
    }
    const id = CSS.escape(hovered.id);
    const selector = `.surface ${hovered.kind === 'pile' ? '.pile' : '.card:not(.pile)'}[data-id="${id}"]`;
    return app.querySelector(selector)?.getBoundingClientRect() ?? null;
  }

  /** Measures the play area and the hovered element, then places the panel. */
  function measureFocus(): void {
    // Nothing previewed, nothing to place: it is measured again as soon as a card is.
    if (!preview) {
      return;
    }
    // The part under the top bar, while it floats over the play area, does not show.
    const area = wrap?.getBoundingClientRect();
    focusArea = area
      ? { left: area.left, top: area.top + barRoom, right: area.right, bottom: area.bottom }
      : null;
    focusHovered = hoveredRect();
    placeFocus();
  }

  /** Places the panel against the rects last measured. */
  function placeFocus(): void {
    if (!preview || !focusArea) {
      return;
    }
    const next = chooseCorner({
      current: focusCorner,
      area: focusArea,
      size: { w: focusWidth, h: focusHeight },
      hovered: focusHovered,
      controls: homeControls,
      // The player selector at the bottom left.
      taken: focused ? ['bottom-left'] : [],
    });
    focusCorner = next;
  }

  /** The panel's margins in its corner: off the play area's edges and the top bar, and above the controls at home. */
  function focusMargin(corner: Corner): string {
    const top = corner.startsWith('top') ? FOCUS_MARGINS.top + barRoom : 0;
    const bottom = bottomRoom(corner, homeControls);
    const left = corner.endsWith('left') ? FOCUS_MARGINS.side : 0;
    const right = corner.endsWith('right') ? FOCUS_MARGINS.side : 0;
    return `${top}px ${right}px ${bottom}px ${left}px`;
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
      focused,
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

  // Before the new view is drawn, while the cards still show where they were.
  // The viewer's own drop (DragLayer's landing, which ends with this view)
  // already lies where it went on the table or in the hand; onto a pile, it
  // flies there from its landed ghost, still drawn now.
  $effect.pre(() => {
    const next = view;
    untrack(() => {
      const prev = drawnView;
      drawnView = next;
      if (prev === next) {
        return;
      }
      // Back after a long gap: the table shows as it is now, nothing plays.
      if (session.viewGap > MAX_APART_MS) {
        motion.stop();
        void tick().then(rehoverUnderPointer);
        return;
      }
      const anims = diffViews(prev, next, interaction.landing ?? undefined, session.viewGap);
      void motion
        .animate(app, anims, { before: prev.table, after: next.table }, zoom)
        .then(async () => {
          // Once drawn, then once still: a card turning over is edge-on, out of reach, meanwhile.
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
    const playing = app?.querySelector('.hand')?.getAnimations?.({ subtree: true }) ?? [];
    await Promise.allSettled(playing.map((animation) => animation.finished));
  }

  /**
   * Hovers what a new view put under a pointer at rest, whoever acted (spec
   * 5.8): the card or hand card there, or nothing once the hovered card went
   * from under it. The ring, the preview and the keys follow.
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
    const under = document.elementFromPoint(x, y);
    const pile = under?.closest<HTMLElement>('.surface .pile');
    if (pile) {
      rehoverPile(pile);
      return;
    }
    const hit = under?.closest<HTMLElement>(
      '.surface .card:not(.pile, .ghost)[data-id], .hand .hcard[data-id]',
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
    const pile = piles.find((p) => p.id === id);
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
   * Sends an action, credited (spec 5) to the deck owning the card or pile it
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
    const role = view.you.role;
    if (!hovered || role === undefined) {
      return [];
    }
    return actionsFor(hovered, view, { areas: view.you.areas, role }, lang, interaction.group);
  });

  // ---- The arrow mode's hint ----

  // A touch screen has no Esc key, and taps rather than clicks.
  const ARROW_HINT = 'Click the card to point at — Esc or a click on an empty spot to cancel.';
  const ARROW_HINT_TOUCH = 'Tap the card to point at — tap an empty spot to cancel.';

  // Above the card the arrow starts from, until the arrow is drawn or cancelled, whatever the
  // pointer hovers meanwhile; not while a Shift + drag draws it, which shows where it goes.
  const arrowHintShown = $derived(interaction.arrowFrom !== null && !interaction.arrowDrag);

  /** The card the arrow starts from, on the table. */
  function arrowSource(): HTMLElement | null {
    const from = interaction.arrowFrom;
    if (from === null || !wrap) {
      return null;
    }
    return wrap.querySelector<HTMLElement>(
      `.surface .card:not(.pile)[data-id="${CSS.escape(from)}"]`,
    );
  }

  // ---- The token pill ----

  // Found again by names at every view, so the pill follows its token through
  // redraws; it goes with the token (zero) or the card (off the table).
  const counterShown = $derived.by(() => {
    const target = interaction.counter;
    if (!target || view.you.role !== 'player' || interaction.dragging) {
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
    return wrap.querySelector<HTMLElement>(`.surface .card[data-id="${target.card}"] ${selector}`);
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

  function contextContentOf(element: TableElement): ContextContent | null {
    const role = view.you.role;
    if (role === undefined || element.kind === 'hand') {
      return null;
    }
    const items = actionsFor(
      element,
      view,
      { areas: view.you.areas, role },
      lang,
      interaction.group,
    );
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

  /** The header of the menu: what the card or pile is, whose it is; none once it is gone. */
  const contextHeader = $derived.by((): ContextHeader | null => {
    const element = interaction.contextMenu?.element;
    if (element?.kind === 'pile') {
      const pile = piles.find((p) => p.id === element.id);
      return pile ? pileHeader(pile, view) : null;
    }
    const card = element ? cardsById.get(element.id) : undefined;
    return card ? cardHeader(card, faceOf(card), view) : null;
  });

  // A redraw that leaves its element without actions (an emptied pile, a card gone) closes it.
  $effect(() => {
    if (interaction.contextMenu && contextContent === null) {
      untrack(() => interaction.closeContextMenu());
    }
  });

  /** The table card or pile an element of the surface belongs to, if any: what a context menu is for. */
  function contextElementOf(target: EventTarget | null): TableElement | null {
    if (!(target instanceof Element)) {
      return null;
    }
    const hit = target.closest<HTMLElement>('.surface .card:not(.ghost)[data-id]');
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
  function openContextMenu(element: TableElement, at: Point): void {
    if (contextContentOf(element) === null) {
      return;
    }
    const pile = element.kind === 'pile' ? piles.find((p) => p.id === element.id) : undefined;
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
   * instead, which hovering it shows, or tapping it on touch.
   */
  function onTableClick(event: MouseEvent): void {
    if (event.altKey || event.ctrlKey || interaction.isLongTouchClick(event)) {
      return;
    }
    if (event.target instanceof Element && event.target.closest('.surface [data-counter]')) {
      return;
    }
    const element = contextElementOf(event.target);
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

  /** A chosen entry runs on the menu's element, once the menu is closed. */
  function runContextItem(item: ActionItem): void {
    const element = interaction.contextMenu?.element ?? null;
    interaction.closeContextMenu();
    runItem(item, element);
  }

  /** The "How many cards?" question being asked, if any. */
  let asking = $state<CountQuestion | null>(null);

  // The pile can shrink while the question is open (another player deals from
  // it): the answer never asks for more cards than it holds, the card revealed on it included.
  const askedPile = $derived(asking ? piles.find((pile) => pile.id === asking?.pile) : undefined);
  const askedMax = $derived(
    asking && askedPile && view.table ? Math.min(asking.max, deckCount(askedPile, view.table)) : 0,
  );

  // Nothing is left to ask about once the pile is empty or gone.
  $effect(() => {
    if (asking && askedMax === 0) {
      asking = null;
    }
  });

  /** Runs an action item on its element: the hovered one (a key), or the context menu's. */
  function runItem(item: ActionItem, element: TableElement | null = interaction.hovered): void {
    if (!item.run || item.disabled || !element) {
      return;
    }
    const result = item.run();
    if ('ask' in result) {
      asking = result.ask;
    } else if ('local' in result) {
      runLocal(result, element);
    } else {
      send(result, element);
    }
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

  function send(action: Action, target: TableElement | null): void {
    // A new Look or Search opens its box as soon as its view arrives.
    if (action.kind === 'look' || action.kind === 'search') {
      closingView = false;
    }
    act(action, target);
  }

  // ---- The card boxes ----

  // Browse and the stage choice are the client's own; Look at top and Search
  // are the server's private view (ruling P5c-R1), closed with closeView.
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
      const pile = piles.find((p) => p.id === opened.pile);
      return pile ? { kind: 'pile', pile, mode: opened.mode, cards: opened.cards } : null;
    }
    if (localBox?.kind === 'browse') {
      const id = localBox.pile;
      const pile = piles.find((p) => p.id === id);
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
   * an own card of a shared pile (victory display, encounter discard) goes to
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
    // Alt + click pings the spot (spec 5.8); spectators cannot ping.
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
      // Ruling P5c-R7: not with another button, nor while scrolling the table with its scrollbars.
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
      const selector = `.surface .card:not(.pile, .ghost)[data-id="${CSS.escape(card.id)}"]`;
      const rect = app?.querySelector(selector)?.getBoundingClientRect();
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
   * plain click clears the group and, ruling P5c-R7, the viewer's own arrows.
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
    handleKey(event, {
      view,
      items: hoveredItems,
      zoom,
      setZoom: zoomWithButtons,
      run: runItem,
      act: (action) => send(action, targetOfKey(action)),
      showKeys: showKeySheet,
      selectNextDeck: () => stepOwnDeck(1),
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
  let handRaised = $state(false);

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
   * identities stay in view.
   */
  async function setZoom(wanted: number, pointX?: number, pointY?: number): Promise<void> {
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
    const paddingTop = SCROLL_PADDING + barStart;
    const underX = wrap.scrollLeft + x - box.left - SCROLL_PADDING;
    const underY = wrap.scrollTop + y - box.top - paddingTop;

    await tick();

    wrap.scrollLeft = Math.max(0, SCROLL_PADDING + underX * scale - (x - box.left));
    wrap.scrollTop = Math.max(0, paddingTop + underY * scale - (y - box.top));
  }

  // The wheel can zoom finer than the 10 % steps: it keeps its own target so
  // small trackpad moves add up instead of rounding away.
  let wheelTarget: number | null = null;

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

  // Not an onwheel attribute: preventing the page zoom needs a non-passive listener.
  $effect(() => {
    if (!wrap) {
      return;
    }
    const target = wrap;
    target.addEventListener('wheel', onWheel, { passive: false });
    return () => target.removeEventListener('wheel', onWheel);
  });
</script>

<!--
  The player selector of "Villain + player": which player's row shows, and, on an own seat, which of
  the viewer's decks is selected (its hand shows). One swatch in each seat's colour, named for screen
  readers and in its tooltip only, as the name already shows above the player's deck.
-->
{#snippet seatPicker(current: number)}
  <div class="seatpick">
    {#if seatedDecks.length > 2}
      <button
        class="btn-ghost step"
        aria-label="Previous player"
        data-tip="Previous player"
        onclick={() => stepSeat(current, -1)}>←</button
      >
    {/if}
    <div
      class="seats"
      role="radiogroup"
      aria-label="Player shown"
      tabindex="-1"
      onkeydown={(event) => onSeatKey(event, current)}
      use:selectionIndicator
    >
      <!-- The ring around the player shown, in their colour: it slides, and its colour fades. -->
      <span
        class="ring"
        data-indicator
        aria-hidden="true"
        style:--seat="var(--p{(seatColor(view, current) ?? 0) + 1})"
      ></span>
      {#each seatedDecks as { seat, name, color } (seat)}
        <button
          class="seat"
          style:--seat="var(--p{color + 1})"
          role="radio"
          aria-label={name}
          data-tip={name}
          aria-checked={seat === current}
          tabindex={seat === current ? 0 : -1}
          onclick={() => selectSeat(seat)}
        ></button>
      {/each}
    </div>
    {#if seatedDecks.length > 2}
      <button
        class="btn-ghost step"
        aria-label="Next player"
        data-tip="Next player"
        onclick={() => stepSeat(current, 1)}>→</button
      >
    {/if}
  </div>
{/snippet}

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

<!-- The zoom is set on the whole page, so a layer outside the table (a drag ghost) can follow it. -->
<div
  class="app"
  class:arrowing={interaction.arrowFrom !== null}
  class:dragging={interaction.dragging !== null}
  class:history-collapsed={historyCollapsed && !narrow.current}
  class:banding={interaction.band !== null}
  class:compact={small.current}
  class:touch={touchMode.current}
  style:--z={zoom}
  style:--you="var(--p{view.you.color + 1})"
  style:--edge="{TABLE_EDGE}px"
  style:--edge-bottom="{TABLE_EDGE_BOTTOM}px"
  style:--controls-bottom="{controlsBottom}px"
  style:--bar-start="{barStart}px"
  style:--bar-room="{barRoom}px"
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
      bind:hidden={barHidden}
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
    onscroll={measureFocus}
  >
    <div class="table">
      <Surface
        cards={tableCards}
        piles={tablePiles}
        {owners}
        {topOf}
        {faceOf}
        onbrowse={openBrowseBox}
        width={surface.w}
        height={surface.h}
        {markers}
        markersMovable={view.you.role === 'player'}
        canDrag={(element) => sourceOf(element, view) !== null}
      />
      <!-- The arrows follow the cards while they move. -->
      <Arrows
        {view}
        root={app}
        layout={[zoom, surface, rowMap, motion.frame]}
        raised={interaction.dragging !== null || interaction.landing !== null || motion.moving}
      />
    </div>
  </div>

  <Presence
    bind:this={presenceLayer}
    {view}
    presence={session.presence}
    send={(fields) => session.sendPresence(fields)}
    away={modal.open || (handCards !== undefined && handRaised)}
    root={app}
    {zoom}
    {faceOf}
    {rowMap}
    layout={[surface, rowMap]}
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
    Undo floats there, left of the zoom control. On a small screen, both share one bar above the
    resting hand.
  -->
  <div class="corner" bind:this={cornerBox} bind:clientHeight={cornerHeight}>
    {#if narrow.current}
      <div class="undo">
        <!-- aria-disabled rather than disabled, so that the tooltip saying why still shows. -->
        <button
          class="btn-ghost"
          aria-label="Undo last action"
          data-tip={view.canUndo ? 'Undo last action' : 'Nothing of yours to undo'}
          aria-disabled={!view.canUndo}
          onclick={() => {
            if (view.canUndo) {
              undo();
            }
          }}
        >
          <!-- A hooked arrow going back. -->
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
          </svg>
        </button>
      </div>
      {#if small.current}
        <span class="sep" aria-hidden="true"></span>
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

  {#if focused && shownSeat !== null}
    {@render seatPicker(shownSeat)}
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

  {#if handCards}
    <Hand
      cards={handCards}
      {faceOf}
      {captionOf}
      cardSize={raisedCard}
      restCardSize={baseHandCard}
      restDrop={handDrop}
      bind:open={handRaised}
    />
  {/if}

  <Flights {faceOf} {captionOf} />

  <DragLayer
    {view}
    {zoom}
    root={app}
    {faceOf}
    {sizeOf}
    {rowMap}
    {selected}
    act={(action, element) => act(action, element.kind === 'marker' ? null : element)}
    onhand={selectSeat}
    ondrag={(drag) => session.sendPresence({ drag })}
    lastError={session.lastError}
  />

  {#if arrowHintShown && wrap}
    <ArrowHint
      anchor={arrowSource}
      text={touchMode.current ? ARROW_HINT_TOUCH : ARROW_HINT}
      bounds={wrap}
      {zoom}
      version={view}
    />
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
        {sizeOf}
        readOnly={view.you.role !== 'player'}
        {selected}
        act={actInBox}
        onclose={closeBox}
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

  <Tooltip />

  {#if !narrow.current}
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
    /* The play area's gutter, which the top bar's left edge shares. */
    --content-gutter: 24px;
    /*
      The height of a button in the bars floating at the bottom of the table (the zoom control, the
      narrow screen's Undo, the player selector): with the same padding and the same room under them
      (--edge-bottom), the bars share their top and bottom edges.
    */
    --bar-button: 32px;
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

  /* The bar's icons sit close to the window's edge, over the side panel, not the play area. */
  .top {
    --bar-gutter-end: 8px;
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
    padding: calc(24px + var(--bar-start)) var(--content-gutter) 24px;
  }

  /*
    Rings drawn around the cut card, for cards and piles alike (the cut would clip them on the
    image): the white ring of the hovered element and of the cards of the hovered history line,
    and the drop outlines.
  */
  .table :global(.card.hovered)::before,
  .table :global(.card.highlighted)::before,
  .table :global(.card.drop-target)::before,
  .table :global(.card.drop-pile)::before {
    content: '';
    position: absolute;
    inset: 1%;
    border-radius: 7px;
    pointer-events: none;
    z-index: 1;
  }

  /* The hovered card or pile, or the one whose context menu is open, has the prototype's white ring. */
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
    position: absolute;
    inset: 1%;
    border-radius: 7px;
    pointer-events: none;
    z-index: 1;
    box-shadow:
      0 0 0 2px var(--c),
      0 0 22px 6px color-mix(in srgb, var(--c) 22%, transparent);
  }

  /* A card the rubber band selected: a ring and a halo, in the viewer's colour. */
  .table :global(.card > .sring) {
    position: absolute;
    inset: 1%;
    border-radius: 7px;
    pointer-events: none;
    z-index: 1;
    box-shadow:
      0 0 0 2px var(--you),
      0 0 0 7px color-mix(in srgb, var(--you) 22%, transparent);
  }

  /* Where a drop would go: under a card (the prototype's threat orange), or onto a pile. */
  .table :global(.card.drop-target)::before {
    outline: 3px dashed var(--warn);
    outline-offset: 2px;
  }

  .table :global(.card.drop-pile)::before {
    outline: 3px dashed var(--sel);
    outline-offset: 3px;
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

  /* Under the top bar floating over the table (--bar-room), following it as it slides. */
  .notice {
    grid-area: table;
    align-self: start;
    justify-self: center;
    z-index: 40;
    margin: calc(8px + var(--bar-room)) 0 0;
    transition: margin-top 0.2s ease;
    padding: 4px 14px;
    background: var(--panel-2);
    border: 1px solid var(--accent);
    border-radius: 999px;
    font-size: 13px;
  }

  /* At the bottom left, as the zoom control at the bottom right: under the veil and the hand. */
  .seatpick {
    grid-area: table;
    align-self: end;
    justify-self: start;
    z-index: 30;
    margin: 0 0 var(--edge-bottom) var(--edge);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: #141a28eb;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 6px 16px #0008;
  }

  /*
    On a small screen, above the bar at the bottom right (--controls-bottom, then that bar: its
    buttons, its 4 px padding and 1 px border both ways, and 8 px between): on a phone, the two
    would meet.
  */
  .app.compact .seatpick {
    margin-bottom: calc(var(--controls-bottom) + var(--bar-button) + 18px);
  }

  .seatpick .step {
    height: var(--bar-button);
    padding: 0 8px;
    border: none;
    border-radius: 8px;
    color: #c9cfdf;
  }

  /* A round swatch of the seat colour; the player shown is ringed. */
  .seatpick .seats {
    position: relative;
    height: var(--bar-button);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .seatpick .seat {
    width: 18px;
    height: 18px;
    margin: 5px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--seat);
    opacity: 0.6;
  }

  .seatpick .seat:hover {
    opacity: 1;
  }

  .seatpick .seat[aria-checked='true'] {
    opacity: 1;
  }

  .seatpick .ring {
    border-radius: 50%;
    box-shadow:
      0 0 0 2px #141a28,
      0 0 0 4px var(--seat);
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
    padding: 4px;
    background: #141a28eb;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 6px 16px #0008;
  }

  .app.compact .corner .undo,
  .app.compact .corner :global(.zoomctl) {
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
  }

  /* As the zoom control's own separator. */
  .corner .sep {
    width: 1px;
    height: 20px;
    margin: 0 2px;
    background: var(--line-strong);
  }

  .undo {
    padding: 4px;
    background: #141a28eb;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 6px 16px #0008;
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
    color: #c9cfdf;
  }

  .undo svg {
    width: 18px;
    height: 18px;
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
    wider than a narrow one (a large phone on its side) keeps the history column, which then runs
    from the top of the window: the bar floats over the play area only, its icons on the play
    area's edge.
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
    The preview, at the bottom right of the table above the zoom control, still while the table
    scrolls under it. As the zoom control: over the table, under the other players' presence
    (2500), the veil and the raised hand (2600). Never so tall that it leaves the table; the
    pointer goes through it.
  */
  .peek {
    grid-area: table;
    align-self: start;
    justify-self: end;
    z-index: 30;
    position: relative;
    /*
      A 298 px wide portrait card in its 10 px padding and 1 px border, never wider than 45 % of
      the table, nor so tall that it reaches the zoom control: the top bar and the corners keep
      200 px. Keep in step with previewCardWidth (layout.ts): the raised hand's cards follow this
      card.
    */
    width: min(320px, 45%, calc((100dvh - 200px) * 5 / 7 + 20px));
    padding: 10px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    box-shadow: 0 14px 36px #000000a6;
    pointer-events: none;
    /* In a top corner, it follows the top bar as it slides (focusMargin). */
    transition: margin-top 0.2s ease;
  }

  /* A landscape card: 418 px wide. */
  .peek.land {
    width: min(440px, 45%);
  }

  /* Out of the pointer's and the hovered card's way, in another corner (focus.ts). */
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
