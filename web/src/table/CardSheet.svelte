<!--
  The inspector of a table card or pile on a touch screen, in place of its
  context menu (ContextMenu.svelte): a bottom sheet (Sheet.svelte) with the
  card's face large, its counters drawn on it, and a column with the same
  entries as the menu (contextItems.ts), with no title line: the sheet's
  accessible name says what the element is (its header's label: a card's
  name, type and owner, a pile's kind and count). Every entry is a tile, all
  alike, none set apart from the others, in the menu's order: each group of the
  menu a grid of its own (lib/buttonGrid.ts), a thin line between groups. A
  submenu opens in the sheet, with a Back row over its own entries, tiles too.
  A refused entry is not shown at all (inspector.visibleEntries): it would take
  room for nothing. No key hints: a touch screen has no keyboard to press them on.
  A chosen entry runs as the menu's does: the caller closes the sheet, or keeps
  it open for a token, status or modifier, which then shows on the card, and
  for a card's Exhaust or Ready, Flip, or a deck's Reveal.
  An exhausted card is drawn tilted, as on the table, its counters with it; it
  tilts or turns upright with the table's timing as the view exhausts or
  readies it, and at once under reduced motion. A card that can tilt keeps the
  room of its tilted bounds, so that neither the card nor its column moves as
  it does: its face is the box of those bounds, the card drawn inside it at the
  size that fills them.
  The tokens, status tabs and modifier badges lie on the face as the table
  draws them (CardCounters.svelte): a tap on one opens its − / + pill.
  In dock mode (a phone) the sheet uses the whole screen. Upright, the card is
  on top, centred, and everything else full width under it, the whole sheet
  scrolling if it must; on its side, the card as large as it allows on the
  left, and everything else in one column on its right, the only part that
  scrolls, centred on the card when shorter than it.
  On a tablet (outside dock mode, as only a touch screen opens the inspector),
  the sheet is wide (Sheet.svelte). Its room (--sheet-room) is at most 460 px
  and 70 % of the screen. A portrait card lays out as a phone on its side: the
  card on the left, as high as the room, and the column on its right, at most
  as high as the room, the only part that scrolls; shorter than the card, its
  content is centred on the card's height. A landscape card (a scheme)
  follows the screen. On a tablet on its side, which has width to spare, it
  lies beside its column too, as wide as the room, top-aligned, and the sheet
  is as wide as the card and its column need. On a tablet upright, it is on
  top, centred, three quarters as wide as the room, and its column full width
  under it, the whole sheet scrolling if it must. Turning the tablet lays the
  sheet out again. A stack follows its main card, so that
  a swipe never changes the layout; a card turning over to the other
  orientation keeps the old layout until it is edge-on, as for its face.
  Tiles and the Back row are 44 px high, on a phone and a tablet alike.
  Motion, short and eased out, none under reduced motion (motionMs): a
  submenu slides in from the right as the main page leaves to the left, and
  back the other way; an entry that comes or goes after an update fades in or
  out, a whole group slides open or closed; a token fades in or out; a pressed
  tile lights up and sinks. When the
  face the card shows changes (a flip, a stage turned, a card turned face
  down or up, a deck's back giving way to the card revealed on it), the card
  turns over as a table card does, in place: the sheet's name and the
  entries show the new side at once, so that the old side's actions (a deck's
  Reveal) never linger; the face, its counters and the layout around it
  follow once it is edge-on. When the new side needs another size, the sheet
  eases to it first, the old face still shown, then the card turns: the new
  side is measured beforehand in a hidden copy of the content. The face a
  Flip turns the card to is decoded ahead (nextImages), and a new side's
  image as soon as the update brings it: edge-on, the card waits for that
  decode, DECODE_WAIT_MS at most, so that the new side never turns back flat
  empty. Another
  element opens a sheet of its own (Table.svelte keys it), which does not
  turn.
  One gutter keeps the card, its column and the sheet's edges apart, wide
  enough for the tabs and badges standing out of the card's edges.
  The sheet keeps its size through a submenu: its page is as high as the main
  page was when it opened, scrolling if longer, so the card never moves.
  A card of a stack shows the whole stack in place of its face: a carousel
  that snaps each card to the middle, the main card first, the shown one
  centred at the size of a card alone, its neighbours peeking at the sides,
  smaller and dimmed (as HandSheet.svelte's), with a dot per card under it.
  The card a swipe brings past the midpoint to the middle, as the finger
  moves, or a tapped neighbour, at once, is asked of the caller (onpick): the
  same sheet then shows it, the carousel gliding on to it,
  its column switching at once, its entries neither sliding nor fading, never
  turning. Under the card, its page keeps its height as through a submenu;
  beside it, the card sets the sheet's height, and the page takes what the
  new card's entries need, up to the room. The carousel
  bringing the card to its middle is the only motion: every card keeps its face,
  image and counters drawn through the switch, so nothing blinks as it loads
  again. The centred card is the face that turns over on a flip.
  A card alone shows its face alone.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { prefersReducedMotion } from 'svelte/motion';
  import { MediaQuery } from 'svelte/reactivity';
  import { fade, fly, slide } from 'svelte/transition';
  import Sheet from '../components/Sheet.svelte';
  import { focusAfterPress } from '../components/modal.svelte';
  import { motionMs } from '../lib/motion';
  import { buttonGrid } from '../lib/buttonGrid';
  import { decodeImage, type Decode } from '../lib/decodeImage';
  import { overflowTip } from '../lib/overflowTip';
  import { SHORT_SCREEN_QUERY, SIDEWAYS_QUERY } from '../lib/screen';
  import CardCounters from './CardCounters.svelte';
  import CardFace from './CardFace.svelte';
  import { dockMode } from './dockMode';
  import { FLIP_MS, FLIP_PERSPECTIVE, LIFT_SCALE, MOVE_EASING, TILT_MS } from './motion.svelte';
  import type { ActionItem } from './actions';
  import type { ContextEntry, ContextHeader, ContextSubmenu } from './contextItems';
  import {
    entryGroups,
    visibleEntries,
    type GroupEntry,
    type SheetCounter,
    type StackCard,
  } from './inspector';

  let {
    header,
    entries,
    note,
    images,
    nextImages = [],
    landscape = false,
    exhausted = false,
    tilts = false,
    counters,
    stack = [],
    cardId,
    onrun,
    onstep,
    onpick,
    onclose,
  }: {
    /** What the element is and whose; the sheet is named by its label. */
    header: ContextHeader;
    entries: ContextEntry[];
    /** Why the element has no entries for the viewer, shown instead of them. */
    note?: string;
    /** The face it shows: a card's, a pile's top face or back. */
    images: string[];
    /**
     * The face a Flip turns the card to, which the sheet decodes ahead; none when the viewer may not
     * know it, or when the card has no other face.
     */
    nextImages?: string[];
    /** The face is a landscape card. */
    landscape?: boolean;
    /** The card is exhausted: it is drawn tilted. */
    exhausted?: boolean;
    /**
     * The card can tilt (actions.canExhaust): its face keeps the room of its tilted bounds. Never a
     * pile's.
     */
    tilts?: boolean;
    /** The tokens, statuses and modifiers the card carries (inspector.countersFor). */
    counters: SheetCounter[];
    /** The stack the card belongs to, its main card first (inspector.stackCardsOf); none for a card on its own. */
    stack?: StackCard[];
    /** The id of the table card shown, which the strip rings; none for a pile. */
    cardId?: string;
    /** Runs a chosen item; the caller closes the sheet. */
    onrun: (item: ActionItem) => void;
    /** Adds one to a counter, or takes one away. */
    onstep: (counter: SheetCounter, delta: -1 | 1) => void;
    /** Shows another card of the stack in the sheet, in place of the one shown. */
    onpick?: (id: string) => void;
    onclose: () => void;
  } = $props();

  const dock = dockMode();
  /** A phone on its side: in dock mode, the column lies beside the card (layoutOf). */
  const short = new MediaQuery(SHORT_SCREEN_QUERY);
  /** A tablet on its side: a landscape card lies beside its column too (layoutOf). */
  const sideways = new MediaQuery(SIDEWAYS_QUERY);

  /** How long a page takes to slide in as the other one leaves, in ms. */
  const PAGE_MS = 220;
  /** How long an entry takes to fade in or out, or a group of them to slide open or closed, in ms. */
  const ENTRY_MS = 200;
  /** How long the sheet takes to ease to the size of the new side, before the card turns, in ms. */
  const RESIZE_MS = 200;
  /**
   * How long, at most, the card waits edge-on for the new side's image to be decoded, in ms: past
   * that, the new side shows as its image comes, rather than hold the turn for a slow image.
   */
  const DECODE_WAIT_MS = 150;
  /**
   * How much nearer the carousel's middle another card must be than the shown one before it becomes
   * the shown one, in px: twice how far past the midpoint between them the middle must go. A finger
   * resting on that midpoint does not flip the sheet back and forth.
   */
  const SWITCH_SLACK_PX = 12;

  /**
   * A side of the card: the face it shows, and the header, counters and entries that go with it.
   * Whether it can tilt follows the face, as its orientation does; whether it is exhausted does not
   * (the exhausted prop): the card tilts as soon as the view says so.
   */
  type Side = {
    images: string[];
    landscape: boolean;
    tilts: boolean;
    header: ContextHeader;
    counters: SheetCounter[];
    entries: ContextEntry[];
    cardId: string | undefined;
  };

  const live = $derived<Side>({ images, landscape, tilts, header, counters, entries, cardId });
  /**
   * The side the card turns away from, which its face shows until it is edge-on; null while it does
   * not turn. The column, its note and entries, shows the live side from the update that brings it.
   */
  let leaving = $state.raw<Side | null>(null);
  /** The side the face shows, with its counters and the layout around it. */
  const faceSide = $derived(leaving ?? live);

  let faceElement = $state<HTMLElement>();
  let turn: Animation | undefined;
  /** The carousel of the stack, in place of the face, when the card has one. */
  let carouselElement = $state<HTMLElement>();
  /** The card a swipe has brought to the middle and asked for: the carousel is there already. */
  let swipedTo: string | null = null;
  /** The card the carousel glides to after a tap: the cards it passes on the way are not asked for. */
  let glidingTo: string | null = null;
  /** The carousel has been scrolled to the shown card once: later moves to another one glide. */
  let centredOnce = false;
  /** The ease of the sheet to the new side's size; it holds that size until the turn ends. */
  let resize: Animation | undefined;
  /** The content's height before the new side's column came in, which the ease starts from, in px. */
  let heightBefore = 0;
  /** The side of the last update, which a new face turns away from. */
  let lastSide: Side | null = null;
  /** The decode of the new side's image, which the turn waits for edge-on; null once it is past. */
  let newFace: Decode | null = null;
  /** The hidden copy of the content, drawn with the new side to measure its height. */
  let measureElement = $state<HTMLElement | null>(null);
  /**
   * The width the copy is drawn at: the content's, in px; null while nothing is measured. A sheet
   * that fits its content lays the copy out at the width it gives itself instead (see the copy).
   */
  let measureWidth = $state<number | null>(null);

  /**
   * The classes of the inspector's layout for a side: dock mode's on a phone, the column beside the
   * card on a phone on its side; on a tablet, the column beside a portrait card; beside a landscape
   * one on a tablet on its side ('land': the sheet fits its content), under it on a tablet upright.
   * A stack follows its main card, so that a swipe never changes the layout; the main card shown
   * follows the side, which may have just turned.
   */
  function layoutOf(of: Side): string[] {
    if (dock.current) {
      return short.current ? ['dock', 'beside'] : ['dock'];
    }
    const main = stack.length > 1 ? stack[0] : undefined;
    const landscape = main === undefined || main.id === of.cardId ? of.landscape : main.landscape;
    if (!landscape) {
      return ['tablet', 'beside'];
    }
    return sideways.current ? ['tablet', 'beside', 'land'] : ['tablet', 'column'];
  }

  /**
   * Whether the main card of the stack can tilt, which the carousel is sized by (.visual.stacked):
   * the main card shown follows the side, as in layoutOf.
   */
  function mainTilts(of: Side): boolean {
    const main = stack[0];
    if (main === undefined) {
      return false;
    }
    return main.id === of.cardId ? of.tilts : main.tilts === true;
  }

  /** Whether the sheet is as wide as its content in a side's layout: a landscape card beside its column. */
  function fitsContent(of: Side): boolean {
    return layoutOf(of).includes('land');
  }

  /**
   * Whether the column lies beside the card, which sets the sheet's height then: a phone on its
   * side, or a tablet beside a portrait card. Under the card, the sheet's height follows the column.
   */
  function columnBesideCard(of: Side): boolean {
    return layoutOf(of).includes('beside');
  }

  /** What tells one face from another: a new array of the same images is the same face. */
  function faceKey(of: Side): string {
    return `${of.landscape ? 'land' : 'portrait'}|${of.images.join('|')}`;
  }

  // Before the sheet is drawn again: the old face stays on screen until the turn reaches edge-on.
  $effect.pre(() => {
    const now = live;
    untrack(() => {
      // While the card turns away, the newest side is the one it shows next.
      if (lastSide !== null && leaving === null) {
        if (isStackSwitch(lastSide, now)) {
          switchCard();
        } else if (faceKey(now) !== faceKey(lastSide)) {
          changeSide(lastSide, now);
        }
      }
      lastSide = now;
    });
  });

  // Once the hidden copy is drawn with the new side: measured, then gone.
  $effect(() => {
    const copy = measureElement;
    if (copy) {
      untrack(() => resizeThenTurn(copy.offsetHeight));
    }
  });

  $effect(() => () => {
    turn?.cancel();
    turn = undefined;
    resize?.cancel();
  });

  /** The first image of the face a Flip turns the card to: a new array of the same images is the same. */
  const nextUrl = $derived(nextImages[0]);

  // As the sheet opens, and whenever the card shows another face or the sheet another card: the
  // face a Flip turns the card to is decoded by the time it shows. At low priority: the face shown
  // comes first.
  $effect(() => {
    if (nextUrl !== undefined) {
      decodeImage(nextUrl, 'low');
    }
  });

  // The shown card in the carousel's middle: at once as the sheet opens, gliding there after a
  // tap on a neighbour. After a swipe it is there already.
  $effect(() => {
    const id = cardId;
    const scroller = carouselElement;
    if (id === undefined || scroller === undefined) {
      return;
    }
    untrack(() => {
      if (id === swipedTo) {
        swipedTo = null;
        return;
      }
      const glide = centredOnce && !prefersReducedMotion.current;
      glidingTo = glide ? id : null;
      centreSlide(scroller, id, glide ? 'smooth' : 'instant');
      centredOnce = true;
    });
  });

  function centreSlide(scroller: HTMLElement, id: string, behavior: 'instant' | 'smooth'): void {
    const slide = scroller.querySelector<HTMLElement>(`.slide[data-id="${CSS.escape(id)}"]`);
    // jsdom has no scrollTo.
    if (slide === null || typeof scroller.scrollTo !== 'function') {
      return;
    }
    const left = slide.offsetLeft + slide.offsetWidth / 2 - scroller.clientWidth / 2;
    scroller.scrollTo({ left, behavior });
  }

  /** How far each card's centre is from the carousel's middle, in px. */
  function distancesFromMiddle(scroller: HTMLElement): { id: string; distance: number }[] {
    const box = scroller.getBoundingClientRect();
    const middle = box.left + box.width / 2;
    return [...scroller.querySelectorAll<HTMLElement>('.slide')].map((slide) => {
      const rect = slide.getBoundingClientRect();
      return { id: slide.dataset.id!, distance: Math.abs(rect.left + rect.width / 2 - middle) };
    });
  }

  /**
   * As a swipe scrolls the carousel, the card nearest its middle becomes the shown one as soon as it
   * is clearly nearer than the shown card (SWITCH_SLACK_PX): the sheet follows the finger rather than
   * waiting for the scroll to end. A glide after a tap asks for nothing until it reaches its card.
   */
  function onCarouselScroll(): void {
    if (carouselElement === undefined || cardId === undefined) {
      return;
    }
    const slides = distancesFromMiddle(carouselElement);
    const shown = slides.find((slide) => slide.id === cardId);
    const nearest = slides.reduce((best, slide) => (slide.distance < best.distance ? slide : best));
    if (glidingTo !== null) {
      if (nearest.id === glidingTo) {
        glidingTo = null;
      }
      return;
    }
    const shownDistance = shown?.distance ?? Infinity;
    if (nearest.id !== cardId && shownDistance - nearest.distance > SWITCH_SLACK_PX) {
      swipedTo = nearest.id;
      onpick?.(nearest.id);
    }
  }

  /** A finger on the carousel takes over from a glide: the cards it brings to the middle count. */
  function onCarouselPointerDown(): void {
    glidingTo = null;
  }

  /** Whether the sheet goes from one card of the stack to another: not a flip, nor a reveal. */
  function isStackSwitch(from: Side, to: Side): boolean {
    const inStack = (id: string | undefined) => stack.some((card) => card.id === id);
    return from.cardId !== to.cardId && inStack(from.cardId) && inStack(to.cardId);
  }

  /**
   * Shows another card of the stack at once: the page goes back to the main page, and the column
   * changes in place, its entries neither sliding nor fading (atOnce). A fade would dip the column to
   * nothing between the two cards; the carousel gliding to the new one is motion enough. Its faces
   * stay as they are, the shown one's counters coming to life. Under the card, the page keeps its
   * height, so that the sheet does not jump nor the card move; beside it, the card keeps the sheet's
   * height anyway, and the page takes what the new card's entries need, scrolling only past the room.
   */
  function switchCard(): void {
    turn?.cancel();
    resize?.cancel();
    if (columnBesideCard(live)) {
      heldHeight = null;
    } else {
      keepHeightForStack();
    }
    atOnce = true;
    pageStep = -1;
    openId = null;
    // The entries and pages that come or go with this update take their transitions at its end.
    void tick().then(() => (atOnce = false));
  }

  /**
   * Shows the card's new side: the column changes at once, its entries neither sliding nor fading
   * (atOnce), while the face keeps the old side until it is edge-on (turnOver) and the hidden copy
   * measures the new one. Run before the update is drawn: the content's height is still the old
   * side's, which the sheet eases from. The new side's image starts decoding there and then, so
   * that it is ready, in most cases, by the time the card is edge-on. Under reduced motion, the
   * face and the rest just change.
   */
  function changeSide(from: Side, to: Side): void {
    if (motionMs(FLIP_MS) === 0 || faceElement === undefined || content === undefined) {
      return;
    }
    turn?.cancel();
    resize?.cancel();
    const url = to.images[0];
    newFace = url === undefined ? null : decodeImage(url);
    heightBefore = content.offsetHeight;
    leaving = from;
    measureWidth = content.offsetWidth;
    atOnce = true;
    // The entries and pages that come or go with this update take their transitions at its end.
    void tick().then(() => (atOnce = false));
  }

  /**
   * Eases the sheet from the old side's height to the new side's, then turns the card over. Run
   * before the update is painted: the content, with the new column beside the old face, never
   * shows at a height of its own. No ease when neither differs from the new side's.
   */
  function resizeThenTurn(target: number): void {
    measureWidth = null;
    if (content === undefined) {
      return;
    }
    const current = content.offsetHeight;
    if (Math.abs(target - heightBefore) < 1 && Math.abs(target - current) < 1) {
      turnOver();
      return;
    }
    // Held at the new size until the turn ends: the layout changing as the card is edge-on does not
    // move the sheet again.
    const easing = content.animate([{ height: `${heightBefore}px` }, { height: `${target}px` }], {
      duration: RESIZE_MS,
      easing: 'ease-out',
      fill: 'forwards',
    });
    resize = easing;
    easing.onfinish = turnOver;
  }

  /**
   * Turns the card over around its vertical axis, as a table card does (motion.svelte.ts #flip):
   * its old side (leaving) turns away to edge-on, lifted, then its new side turns back flat and
   * comes down. Edge-on, the face, its counters and the layout take the new side, which the column
   * shows already; the sheet has the new side's height by then. The card stays edge-on until the
   * new side's image is decoded (afterNewFaceDecoded), so that it never turns back flat empty. The
   * sheet takes its own height back once the turn ends.
   */
  function turnOver(): void {
    if (faceElement === undefined) {
      return;
    }
    const element = faceElement;
    const flat = { transform: `${FLIP_PERSPECTIVE} rotateY(0deg)`, scale: '1' };
    const edgeOn = { transform: `${FLIP_PERSPECTIVE} rotateY(90deg)`, scale: `${LIFT_SCALE}` };
    const half = FLIP_MS / 2;

    // Held edge-on until the second half starts: the old side never shows flat again.
    const away = element.animate([flat, edgeOn], {
      duration: half,
      easing: 'ease-in',
      fill: 'forwards',
    });
    turn = away;
    away.onfinish = () =>
      afterNewFaceDecoded(() => {
        // The sheet went away while the card waited edge-on.
        if (turn !== away) {
          return;
        }
        leaving = null;
        const back = element.animate([edgeOn, flat], { duration: half, easing: 'ease-out' });
        turn = back;
        away.cancel();
        back.onfinish = () => {
          resize?.cancel();
          resize = undefined;
        };
      });
  }

  /**
   * Runs `then` once the new side's image is decoded, or has failed to be: at once when it is
   * already, as it is in most cases, and DECODE_WAIT_MS later at most.
   */
  function afterNewFaceDecoded(then: () => void): void {
    const decode = newFace;
    newFace = null;
    if (decode === null || decode.settled) {
      then();
      return;
    }
    let waiting = true;
    const stopWaiting = () => {
      if (waiting) {
        waiting = false;
        clearTimeout(timer);
        then();
      }
    };
    const timer = setTimeout(stopWaiting, DECODE_WAIT_MS);
    void decode.done.then(stopWaiting);
  }

  const shown = $derived(visibleEntries(live.entries));

  let openId = $state<string | null>(null);
  let content = $state<HTMLElement>();
  /** Which way the last page change went: 1 down into a submenu, -1 back to the main page. */
  let pageStep = $state<1 | -1>(1);
  /** Two pages are sliding: what passes the sheet's edges is clipped. */
  let sliding = $state(false);
  let pagesElement = $state<HTMLElement>();
  /**
   * The height the pages keep from a submenu's opening until the main page is alone again: the
   * main page's then, so that neither the sheet nor the card moves. Null on the main page, whose
   * size follows its content.
   */
  let heldHeight = $state<number | null>(null);
  /**
   * The sheet has gone to another card of the stack, its column under the card: its page keeps its
   * height from then on.
   */
  let heldForStack = false;
  /**
   * The pages and entries of this update come and go at once: a switch to another card of the stack,
   * or the column of a card that turns over: both sides' entries in the column together would mix
   * in its grid and overlap.
   */
  let atOnce = false;

  /** Holds the page at its height as the sheet goes from card to card of the stack, for good. */
  function keepHeightForStack(): void {
    heldHeight ??= pagesElement?.offsetHeight ?? null;
    heldForStack = true;
  }

  /** A tap on a neighbour in the carousel: it becomes the shown one. */
  function pick(card: StackCard): void {
    if (card.id !== cardId) {
      onpick?.(card.id);
    }
  }

  /** Enter or Space on a neighbour, which is a button: it becomes the shown one. */
  function pickByKey(event: KeyboardEvent, card: StackCard): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(card);
    }
  }

  /** Makes a card's face in the carousel the one that turns over, while it is the shown one. */
  function holdFace(element: HTMLElement): () => void {
    faceElement = element;
    return () => {
      if (faceElement === element) {
        faceElement = undefined;
      }
    };
  }

  // Found again in every redraw's entries: a submenu whose tile went, or got refused, closes.
  const openSubmenu = $derived(
    shown.find((entry): entry is ContextSubmenu => entry.kind === 'submenu' && entry.id === openId),
  );

  // The tile the focus was on goes as the list changes: the focus moves to the Back row, or back to
  // the submenu's tile, rather than falling out of the sheet. Its ring shows only after a key's press.
  async function openSub(entry: ContextSubmenu): Promise<void> {
    // Measured before the switch, on the main page; already held while it is still sliding back.
    heldHeight ??= pagesElement?.offsetHeight ?? null;
    pageStep = 1;
    openId = entry.id;
    await tick();
    focusAfterPress(content?.querySelector<HTMLElement>('.back'));
  }

  // A counter entry (`staysOpen`: a token, a status, a modifier) keeps the submenu page, the focus on
  // its tile, to add the same again. Any other entry is done with its submenu: should the sheet stay
  // open, its main page shows what the entry did; one that closes the sheet needs nothing more.
  async function runFromSub(item: ActionItem): Promise<void> {
    onrun(item);
    if (!item.staysOpen) {
      await closeSub();
    }
  }

  async function closeSub(): Promise<void> {
    const id = openId;
    pageStep = -1;
    openId = null;
    await tick();
    if (id !== null) {
      focusAfterPress(content?.querySelector<HTMLElement>(`[data-submenu="${CSS.escape(id)}"]`));
    }
  }

  /** Tells the entries of a group apart in an each block. */
  function keyOf(entry: GroupEntry): string {
    return entry.kind === 'action' ? entry.item.id : `sub:${entry.id}`;
  }

  function labelOf(entry: GroupEntry): string {
    return entry.kind === 'action' ? entry.item.label : entry.label;
  }

  /** Runs a chosen tile: its item, or its submenu opened in the sheet. */
  function choose(entry: GroupEntry, run: (item: ActionItem) => void): void {
    if (entry.kind === 'action') {
      run(entry.item);
    } else {
      void openSub(entry);
    }
  }

  /** The fade of a tile, or the slide of a whole group, that comes or goes after an update. */
  function entryMotion(): { duration: number; easing: (t: number) => number } {
    return { duration: atOnce ? 0 : motionMs(ENTRY_MS), easing: cubicOut };
  }

  /** A page slides in from the side it is reached from, and out to the other: right for a submenu. */
  function pageSlide(direction: 'in' | 'out'): Parameters<typeof fly>[1] {
    const side = direction === 'in' ? pageStep : -pageStep;
    const duration = atOnce ? 0 : motionMs(PAGE_MS);
    return { x: `${100 * side}%`, duration, easing: cubicOut };
  }

  /** Once a page has slid in, the main page alone gets its own size back. */
  function onPageShown(): void {
    sliding = false;
    if (openId === null && !heldForStack) {
      heldHeight = null;
    }
  }

  /** A page on its way out takes no more taps, and its rows no more focus. */
  function onPageOutro(event: Event): void {
    (event.currentTarget as HTMLElement).inert = true;
  }
</script>

<!--
  Entries as tiles, group by group: each group a grid of its own (lib/buttonGrid.ts), a thin line
  above every group but the first. A tile fades in or out in its cell; a whole group slides open or
  closed. Groups go by their place in the list, their tiles by their own keys: a tile that comes or
  goes after an update leaves the other groups as they are.
-->
{#snippet tileGroups(list: readonly ContextEntry[], run: (item: ActionItem) => void)}
  <div class="groups">
    {#each entryGroups(list) as group, i (i)}
      <div class="group" transition:slide={entryMotion()}>
        {#if i > 0}
          <div class="sep" role="separator"></div>
        {/if}
        <div class="tiles" {@attach buttonGrid}>
          {#each group as entry (keyOf(entry))}
            <!-- The fade is on the each block's own element: one inside an if block would not play. -->
            <button
              type="button"
              class="tile"
              data-submenu={entry.kind === 'submenu' ? entry.id : undefined}
              onclick={() => choose(entry, run)}
              transition:fade={entryMotion()}
              ><span class="label" use:overflowTip>{labelOf(entry)}</span
              >{#if entry.kind === 'submenu'}<span class="opens" aria-hidden="true">›</span
                >{/if}</button
            >
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/snippet}

<!-- The note or the entries, in the card's column. -->
{#snippet entriesBlock()}
  {#if note !== undefined}
    <p class="note">{note}</p>
  {/if}

  {#if shown.length > 0}
    <!-- One page at a time, but two while they slide: the main page and a submenu's, in one cell. -->
    <div
      class="pages"
      class:sliding
      class:held={heldHeight !== null}
      style:height={heldHeight === null ? undefined : `${heldHeight}px`}
      bind:this={pagesElement}
    >
      {#key openSubmenu?.id}
        <div
          class="page"
          in:fly={pageSlide('in')}
          out:fly={pageSlide('out')}
          onintrostart={() => (sliding = true)}
          onintroend={onPageShown}
          onoutrostart={onPageOutro}
        >
          {#if openSubmenu}
            <button type="button" class="row back btn-ghost" onclick={closeSub}
              ><span class="label"><span aria-hidden="true">‹ </span>Back</span><span class="where"
                >{openSubmenu.label}</span
              ></button
            >
            {@render tileGroups(openSubmenu.entries, runFromSub)}
          {:else}
            {@render tileGroups(shown, onrun)}
          {/if}
        </div>
      {/key}
    </div>
  {/if}
{/snippet}

<!-- The shown card's tokens, tabs and badges, on its face: the way to change them. -->
{#snippet faceCounters()}
  <CardCounters
    counters={faceSide.counters}
    landscape={faceSide.landscape}
    scheme={faceSide.header.scheme ?? false}
    {onstep}
  />
{/snippet}

<!-- Room before the first card and after the last one, so that both can snap to the middle. -->
{#snippet spacer(card: StackCard)}
  <i class="spacer" class:land={card.landscape} class:tilts={card.tilts} aria-hidden="true"></i>
{/snippet}

<!--
  The stack in place of the face: the shown card centred, the others peeking at its sides. A card
  keeps the same face whether it is shown or peeks, so that a switch draws none of them again: a
  neighbour is a button around a picture of its face; the shown card, its live face and counters.
-->
{#snippet stackCarousel()}
  <div
    class="carousel"
    role="group"
    aria-label="Attached cards"
    bind:this={carouselElement}
    onscroll={onCarouselScroll}
    onpointerdown={onCarouselPointerDown}
  >
    {@render spacer(stack[0]!)}
    {#each stack as card (card.id)}
      {@const shown = card.id === faceSide.cardId}
      {@const landscape = shown ? faceSide.landscape : card.landscape}
      {@const cardTilts = shown ? faceSide.tilts : card.tilts === true}
      <!-- A neighbour is a button: its role is set as it peeks, which the check cannot follow. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="slide"
        class:land={landscape}
        class:tilts={cardTilts}
        class:dim={card.id !== cardId}
        data-id={card.id}
        aria-current={card.id === cardId ? 'true' : undefined}
        role={shown ? undefined : 'button'}
        tabindex={shown ? undefined : 0}
        aria-label={shown ? undefined : card.name}
        onclick={shown ? undefined : () => pick(card)}
        onkeydown={shown ? undefined : (event) => pickByKey(event, card)}
      >
        <div
          class="face"
          class:land={landscape}
          class:tilts={cardTilts}
          aria-hidden={shown ? undefined : 'true'}
          {@attach shown && holdFace}
        >
          <div class="tilt" class:exhausted={shown ? exhausted : card.exhausted === true}>
            <CardFace
              images={shown ? faceSide.images : card.images}
              name={shown ? faceSide.header.name : card.name}
              {landscape}
            />
            <CardCounters
              counters={shown ? faceSide.counters : (card.counters ?? [])}
              {landscape}
              scheme={(shown ? faceSide.header.scheme : card.scheme) ?? false}
              onstep={shown ? onstep : undefined}
            />
          </div>
        </div>
      </div>
    {/each}
    {@render spacer(stack.at(-1)!)}
  </div>
  <div class="dots" aria-hidden="true">
    {#each stack as card (card.id)}
      <i class:on={card.id === cardId}></i>
    {/each}
  </div>
{/snippet}

<!-- The carousel as the hidden copy lays it out, its cards empty. -->
{#snippet measuredCarousel()}
  <div class="carousel">
    {@render spacer(stack[0]!)}
    {#each stack as card (card.id)}
      {@const shown = card.id === live.cardId}
      <div
        class="slide"
        class:land={shown ? live.landscape : card.landscape}
        class:tilts={shown ? live.tilts : card.tilts === true}
      ></div>
    {/each}
    {@render spacer(stack.at(-1)!)}
  </div>
  <div class="dots"><i></i></div>
{/snippet}

<!-- The new side's note and main page, laid out as the content lays them, to be measured. -->
{#snippet measuredEntries()}
  {@const measured = visibleEntries(live.entries)}
  {#if note !== undefined}
    <p class="note">{note}</p>
  {/if}
  {#if measured.length > 0}
    <div
      class="pages"
      class:held={heldHeight !== null}
      style:height={heldHeight === null ? undefined : `${heldHeight}px`}
    >
      <div class="page">{@render tileGroups(measured, onrun)}</div>
    </div>
  {/if}
{/snippet}

<Sheet label={header.label} dock={dock.current} wide fit={fitsContent(faceSide)} {onclose}>
  <div
    class={['inspector', layoutOf(faceSide)]}
    style:--tilt-ms="{TILT_MS}ms"
    style:--tilt-easing={MOVE_EASING}
    bind:this={content}
  >
    <div class="top">
      <div class="visual" class:stacked={stack.length > 1} class:tilts={mainTilts(faceSide)}>
        {#if stack.length > 1}
          {@render stackCarousel()}
        {:else}
          <div
            class="face"
            class:land={faceSide.landscape}
            class:tilts={faceSide.tilts}
            bind:this={faceElement}
          >
            <div class="tilt" class:exhausted>
              <CardFace
                images={faceSide.images}
                name={faceSide.header.name}
                landscape={faceSide.landscape}
              />
              {@render faceCounters()}
            </div>
          </div>
        {/if}
      </div>
      <div class="side">
        {@render entriesBlock()}
      </div>
    </div>
  </div>

  <!-- Drawn for a moment only, unseen and out of reach, the time to measure the new side. -->
  {#if measureWidth !== null}
    <div
      class={['inspector', 'measure', layoutOf(live)]}
      style:width={fitsContent(live) ? undefined : `${measureWidth}px`}
      aria-hidden="true"
      inert
      bind:this={measureElement}
    >
      <div class="top">
        <div class="visual" class:stacked={stack.length > 1} class:tilts={mainTilts(live)}>
          {#if stack.length > 1}
            {@render measuredCarousel()}
          {:else}
            <div class="face" class:land={live.landscape} class:tilts={live.tilts}></div>
          {/if}
        </div>
        <div class="side">
          {@render measuredEntries()}
        </div>
      </div>
    </div>
  {/if}
</Sheet>

<style>
  /*
    One gutter, --gutter, on every side of the card and its column: from the sheet's edges to the
    card, between the card and the column, from the column to the sheet's edge, and under the card.
    It keeps 12 px clear around the status tabs and modifier badges, which stand 6 table units out
    of the card's edges (CardCounters.svelte), --overhang: 6 / 112 of a portrait face's width, 6 /
    157 of a landscape one's, the widest of the two as each layout sets their widths (--portrait-w,
    --landscape-w), so that a card turning over keeps the gutter it had. The sheet pads its own
    edges (Sheet.svelte): the inspector pads the rest.
  */
  .inspector {
    --overhang: max(var(--portrait-w) * 6 / 112, var(--landscape-w) * 6 / 157);
    --gutter: calc(var(--overhang) + 12px);
    /*
      The carousel's padding above its cards, for their shadows (see .carousel), and the height it
      takes besides its cards: its padding (24 px), the gap (8 px) and the dots (6 px).
    */
    --carousel-top: 10px;
    --carousel-chrome: 38px;
    /* The cosine and sine of the exhausted tilt, which size the box of a card that can tilt. */
    --tilt-cos: cos(var(--exhaust-angle));
    --tilt-sin: sin(var(--exhaust-angle));
    display: flex;
    flex-direction: column;
    user-select: none;
    -webkit-user-select: none;
  }

  /* The hidden copy that measures a new side: laid out as the content, never seen. */
  .inspector.measure {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    pointer-events: none;
  }

  /*
    The copy of a sheet that fits its content (Sheet.svelte .sheet.wide.fit): as wide as its content,
    up to the window less the sheet's 16 px a side and its 1 px borders, as the sheet will be.
  */
  .inspector.measure.land {
    width: max-content;
    max-width: calc(100vw - 34px);
  }

  /* The face beside its column: its note and entries. */
  .top {
    display: flex;
    gap: var(--gutter);
    align-items: flex-start;
  }

  /* The face, or the stack's carousel with its dots under it; sized by dock mode or the tablet's rules. */
  .visual {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  /*
    --card-ratio: the card's width over its height. --face-ratio: the face's, which dock mode and
    the tablet's rules size it by: the card's, or the box of its tilted bounds for a card that can
    tilt (see .tilts). The face is the box the layout sizes and a flip turns over (turnOver); the
    card itself, which tilts, is drawn inside it (.tilt). No minimum size from its image: the face
    keeps its ratio whatever the scan's, as the copy that measures a new side, drawn without an
    image, lays it out.
  */
  .face {
    --card-ratio: 5 / 7;
    --face-ratio: var(--card-ratio);
    position: relative;
    flex: none;
    min-width: 0;
    min-height: 0;
    aspect-ratio: var(--face-ratio);
  }

  .face.land {
    --card-ratio: 7 / 5;
  }

  /*
    The card in its face, centred: its image, its counters, its shadow and corners. It fills the
    face of a card that cannot tilt.
  */
  .tilt {
    position: absolute;
    inset: 0;
    margin: auto;
    border-radius: var(--card-radius);
    box-shadow: 4px 6px 16px #000c;
  }

  .face.land > .tilt {
    border-radius: var(--card-radius-land);
  }

  /*
    In the face of a card that can tilt, the card is drawn at the size whose bounds, tilted, fill
    the face: with r its ratio, c and s the tilt's cosine and sine, its bounds are r·c + s of its
    height wide and c + r·s of it high.
  */
  .face.tilts > .tilt {
    width: calc(100% * var(--card-ratio) / (var(--card-ratio) * var(--tilt-cos) + var(--tilt-sin)));
    height: calc(100% / (var(--tilt-cos) + var(--card-ratio) * var(--tilt-sin)));
  }

  /*
    Exhausted, it turns clockwise as on the table (CardView.svelte .card.exhausted), on the rotate
    property: a flip turns the face on its transform and scale.
  */
  .tilt.exhausted {
    rotate: var(--exhaust-angle);
  }

  /*
    The stack's carousel, in place of the face: sideways only, each card snapping to the middle.
    Padded above and below for the cards' shadows. --slide-h and --slide-max size the cards: the
    shown one is as large as a card alone would be, with room left for its neighbours to peek.
  */
  /*
    The ratio of the main card's portrait box, tilted when it can tilt, which the layout sizes the
    carousel by: a landscape box's ratio is its inverse, as a landscape card's.
  */
  .visual.stacked {
    --slide-max: 82%;
    --card-ratio: 5 / 7;
    --face-ratio: var(--card-ratio);
  }

  .carousel {
    --gap: 12px;
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--gap);
    padding-block: var(--carousel-top) 14px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .carousel::-webkit-scrollbar {
    display: none;
  }

  /* --slide-w: a card's width, set on each card (and spacer) for its own ratio. */
  .slide,
  .spacer {
    --card-ratio: 5 / 7;
    --face-ratio: var(--card-ratio);
    --slide-w: min(var(--slide-max), calc(var(--slide-h) * var(--face-ratio)));
  }

  .slide.land,
  .spacer.land {
    --card-ratio: 7 / 5;
  }

  /*
    A card that can tilt takes the box of its bounds tilted to --exhaust-angle, its face, its place
    in the carousel and the carousel's width alike, so that its corners never run out of them: with
    r its ratio, c and s the tilt's cosine and sine, (r·c + s) / (c + r·s).
  */
  .face.tilts,
  .slide.tilts,
  .spacer.tilts,
  .visual.stacked.tilts {
    --face-ratio: calc(
      (var(--card-ratio) * var(--tilt-cos) + var(--tilt-sin)) /
        (var(--tilt-cos) + var(--card-ratio) * var(--tilt-sin))
    );
  }

  /* Flex items rather than padding: some browsers leave a scroller's end padding out of its scroll. */
  .spacer {
    flex: none;
    align-self: stretch;
    width: calc((100% - var(--slide-w)) / 2 - var(--gap));
  }

  /* A tapped neighbour takes no press look: it lights up as it glides to the middle. */
  .slide {
    position: relative;
    flex: none;
    width: var(--slide-w);
    aspect-ratio: var(--face-ratio);
    scroll-snap-align: center;
  }

  .slide.dim {
    scale: 0.9;
    opacity: 0.55;
  }

  /* The shown card fills its place in the carousel, whatever size a face alone would take. */
  .inspector .carousel .slide > .face {
    width: 100%;
    height: 100%;
  }

  /* A neighbour, smaller and dimmed, with a lighter shadow. */
  .slide.dim > .face > .tilt {
    box-shadow: 2px 4px 10px #000a;
  }

  .slide[role='button'] {
    cursor: pointer;
  }

  .slide[role='button']:focus-visible {
    outline: 2px solid var(--sel);
    outline-offset: 2px;
    border-radius: var(--card-radius);
  }

  /* A dot per card, the centred one long and lit, as in the hand sheet. */
  .dots {
    display: flex;
    justify-content: center;
    gap: 6px;
  }

  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: var(--line-strong);
  }

  .dots i.on {
    width: 16px;
    background: var(--text);
  }

  /*
    Beside the card, the column's content is centred on the card's height, or starts level with its
    top when it is the taller (see .inspector.beside .side).
  */
  .side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .note {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  @media (prefers-reduced-motion: no-preference) {
    /* The carousel's cards and dots, as the centred card changes. */
    .slide {
      transition:
        scale 0.2s,
        opacity 0.2s;
    }

    .dots i {
      transition: width 0.2s;
    }

    /* A card exhausted or readied tilts as on the table (motion.svelte.ts TILT_MS, MOVE_EASING). */
    .tilt {
      transition: rotate var(--tilt-ms) var(--tilt-easing);
    }
  }

  /*
    The pages share one cell: the one leaving and the one coming overlap while they slide. Held at
    the main page's height, a longer page scrolls in it, a shorter one leaves room at the bottom.
  */
  .pages {
    flex: none;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
  }

  .pages.held > .page {
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .pages.sliding {
    overflow: clip;
  }

  .page {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  /*
    A group of entries: the thin line above it, but for the first one, and its grid of tiles. A
    flex column, so that the line's margins stay inside it as it slides open or closed.
  */
  .group {
    display: flex;
    flex-direction: column;
  }

  /*
    The tiles of a group, laid out by lib/buttonGrid.ts (data-layout): a lone tile the whole width,
    three in a row when each has room for its label, an even count two by two, three without room
    for a row and five or more two by two, the last one the whole width; one per line when two
    labels do not fit side by side, and until the group is laid out.
  */
  .tiles {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  .tiles:global([data-layout='pairs']) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tiles:global([data-layout='pairs-last']) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tiles:global([data-layout='pairs-last']) > .tile:last-child {
    grid-column: 1 / -1;
  }

  .tiles:global([data-layout='row']) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  /* Every tile alike, the default entry's too: its label centred, a submenu's followed by its ›. */
  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 0;
    min-height: 44px;
    padding: 4px 8px;
    border: 0;
    border-radius: 10px;
    background: var(--panel-2);
    font-size: 14px;
    text-align: center;
  }

  /*
    A label stays on one line, cut short only if it must: as wide as its text, so that its overflow
    tells the grid its tiles are too narrow side by side (lib/buttonGrid.ts).
  */
  .tile .label {
    max-width: 100%;
    white-space: nowrap;
  }

  /*
    A press reads as taken before the sheet closes: the tile lights up, and sinks, with motion. Its
    hover, under a real hover only, is every button's (tokens.css).
  */
  .tile:active {
    background-color: var(--hover);
  }

  @media (prefers-reduced-motion: no-preference) {
    .tile {
      transition:
        background-color 0.12s,
        transform 0.08s ease-out;
    }

    .tile:active {
      transform: scale(0.96);
    }
  }

  /* The Back row of a submenu's page, the whole width over its tiles. */
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    column-gap: 12px;
    row-gap: 2px;
    width: 100%;
    min-height: 44px;
    padding: 4px 8px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    text-align: left;
  }

  /* A press lights the row up. */
  .row:active:not(:disabled) {
    background-color: var(--hover);
  }

  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .opens,
  .where {
    flex: none;
    color: var(--muted);
    font-size: 14px;
    font-weight: 500;
  }

  .sep {
    flex: none;
    height: 1px;
    margin: 8px 0;
    background: var(--line-strong);
  }

  /*
    Dock mode upright: the card's width, as wide as the sheet allows while it stays at most 42 % of the
    screen high (.inspector.dock.beside sizes it for a phone on its side). A face is at most as wide as
    the sheet, which pads its edges by 12 px.
  */
  .inspector.dock {
    --portrait-w: min(100dvw - 24px, 42dvh * 5 / 7);
    --landscape-w: min(100dvw - 24px, 42dvh * 7 / 5);
    padding: 0 calc(var(--gutter) - 12px) calc(var(--gutter) - 12px);
  }

  /* The face centred in its column, or the stack's carousel across it, its cards at most 80 % wide. */
  .inspector.dock .visual {
    align-items: center;
  }

  .inspector.dock .visual.stacked {
    --slide-max: 80%;
    align-items: stretch;
  }

  .inspector.dock .side {
    align-self: stretch;
  }

  /*
    Dock mode upright: the card on top, centred, at most 42 % of the screen high; the note and the
    entries full width under it. The sheet pads them and scrolls the whole (Sheet.svelte), if it
    must.
  */
  .inspector.dock:not(.beside) .top {
    flex-direction: column;
    align-items: center;
  }

  .inspector.dock:not(.beside) .visual {
    width: 100%;
  }

  .inspector.dock:not(.beside) .visual.stacked {
    --slide-h: 42dvh;
  }

  .inspector.dock:not(.beside) .visual > .face {
    width: min(100%, calc(42dvh * var(--face-ratio)));
  }

  /*
    A phone on its side (layoutOf), laid out beside its card as a tablet's portrait card is (see
    .inspector.beside): the card and its column as high as the sheet's room less the gutter under
    them.
  */
  .inspector.dock.beside {
    --card-room: calc(var(--sheet-room) - var(--gutter) + 12px);
    --portrait-w: calc(var(--sheet-room) * 5 / 7);
    --landscape-w: calc(var(--sheet-room) * 7 / 5);
  }

  /*
    A tablet, in a wide sheet (Sheet.svelte). --sheet-room: at most 460 px and 70 % of the screen,
    the height of a portrait card, and of the card beside its column. --land-room: three quarters
    of it, the width of a landscape one.
  */
  .inspector.tablet {
    --sheet-room: min(460px, 70dvh);
    --card-room: var(--sheet-room);
    --land-room: calc(var(--sheet-room) * 3 / 4);
    --portrait-w: calc(var(--sheet-room) * 5 / 7);
    --landscape-w: var(--land-room);
    padding: 0 var(--gutter) calc(var(--gutter) - 14px);
  }

  /*
    Beside its column, on a phone on its side and beside a tablet's portrait card: two columns, the
    card as high as --card-room, as wide as its aspect makes it, on the left, and the rest on its
    right, at most as high and the only part that scrolls. The carousel's cards as high as the room
    less its chrome, 44 px on each side for the neighbours.
  */
  .inspector.beside .visual.stacked {
    --slide-h: calc(var(--card-room) - var(--carousel-chrome));
    width: calc(var(--slide-h) * var(--face-ratio) + 88px);
  }

  .inspector.beside .visual > .face {
    height: var(--card-room);
  }

  /*
    The column as high as the card, its content centred on the card's height: the auto margins
    above its first line and under its last one share the room. Taller than the card, the column
    starts at its top, the margins then nothing (unlike justify-content, which would push its top
    out of the scroll). A submenu's page, held at the main page's height, is centred in it too.
  */
  .inspector.beside .side {
    align-self: stretch;
    max-height: var(--card-room);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .inspector.beside .side > :first-child,
  .inspector.beside .pages.held > .page > :first-child {
    margin-top: auto;
  }

  .inspector.beside .side > :last-child,
  .inspector.beside .pages.held > .page > :last-child {
    margin-bottom: auto;
  }

  /*
    Centred on the shown card of a stack: inside the carousel's padding at the top, and its
    padding, gap and dots at the bottom.
  */
  .inspector.beside .visual.stacked + .side {
    padding-block: var(--carousel-top) calc(var(--carousel-chrome) - var(--carousel-top));
  }

  /*
    Beside a landscape card, on a tablet on its side: the card as wide as the room, top-aligned, and
    the sheet as wide as the card and its column (Sheet.svelte fit). The column keeps the width it has
    beside a portrait card in a 760 px sheet rather than growing; it narrows in a narrow window. As
    high as the taller of the two: the column at most as high as the room, scrolling past it. The
    carousel's cards as high as a landscape card that wide, 44 px on each side for the neighbours.
  */
  .inspector.beside.land {
    --landscape-w: var(--sheet-room);
  }

  .inspector.tablet.beside .visual > .face.land {
    width: var(--sheet-room);
    height: auto;
  }

  .inspector.beside.land .visual.stacked {
    --slide-h: calc(var(--sheet-room) * var(--face-ratio));
    --slide-max: 100%;
    width: calc(var(--sheet-room) + 88px);
  }

  .inspector.beside.land .side {
    flex: 0 1 auto;
    width: 340px;
  }

  /*
    Under a landscape card, on a tablet upright: the card on top, centred, as wide as --land-room
    (never wider than the sheet), and its column full width under it; the sheet scrolls the whole,
    if it must. The carousel's cards as high as a landscape card of that width.
  */
  .inspector.column .top {
    flex-direction: column;
    align-items: center;
  }

  .inspector.column .visual {
    width: 100%;
    align-items: center;
  }

  .inspector.column .visual.stacked {
    --slide-h: calc(var(--land-room) * var(--face-ratio));
    align-items: stretch;
  }

  .inspector.column .visual > .face {
    width: min(var(--land-room), 100%);
  }

  .inspector.column .side {
    align-self: stretch;
  }
</style>
