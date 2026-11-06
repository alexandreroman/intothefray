<!--
  The inspector of a table card or pile on a touch screen, in place of its
  context menu (ContextMenu.svelte): a bottom sheet (Sheet.svelte) with the
  card's face large, its counters drawn on it, and a column with its name and
  the same entries as the menu (contextItems.ts). The first group shows as
  large buttons, the default one in Fray red, the others as rows; a submenu
  opens in the sheet, with a Back row. A refused entry is not shown at all (inspector.visibleEntries):
  it would take room for nothing. No key hints: a touch screen has no keyboard to press them on.
  A chosen entry runs as the menu's does: the caller closes the sheet, or keeps
  it open for a token, status or modifier, which then shows on the card.
  The tokens, status tabs and modifier badges lie on the face as the table
  draws them (CardCounters.svelte): a tap on one opens its − / + pill.
  In dock mode (a phone) the sheet uses the whole screen. Upright, the card is
  on top, centred, and everything else full width under it, the whole sheet
  scrolling if it must; on its side, the card as large as it allows on the
  left, and everything else in one column on its right, the only part that
  scrolls.
  On a tablet (outside dock mode, as only a touch screen opens the inspector),
  the sheet is wide (Sheet.svelte) and lays out as a phone on its side: the
  card on the left, as high as its room (--sheet-room: at most 460 px and 70 %
  of the screen), a landscape one as wide as a portrait one is high, and the
  column on its right, at most as high as the card, the only part that
  scrolls. Buttons and rows are 44 px high, on a phone and a tablet alike.
  Motion, short and eased out, none under reduced motion (Sheet.motionMs): a
  submenu slides in from the right as the main page leaves to the left, and
  back the other way; an entry that comes or goes after an update slides open
  or closed; a token fades in or out; a pressed button sinks. When the
  face the card shows changes (a flip, a stage turned, a card turned face
  down or up, a deck's back giving way to the card revealed on it), the card
  turns over as a table card does, in place: the name, the count, the
  counters and the entries follow its new side once it is edge-on. When the
  new side needs another size, the sheet eases to it first, the old side
  still shown, then the card turns: the new side is measured beforehand in a
  hidden copy of the content. Another element opens a sheet of its own
  (Table.svelte keys it), which does not turn.
  The sheet keeps its size through a submenu: its page is as high as the main
  page was when it opened, scrolling if longer, so the card never moves.
  A card of a stack shows the whole stack in place of its face: a carousel
  that snaps each card to the middle, the main card first, the shown one
  centred at the size of a card alone, its neighbours peeking at the sides,
  smaller and dimmed (as HandSheet.svelte's), with a dot per card under it.
  The card a swipe brings past the midpoint to the middle, as the finger
  moves, or a tapped neighbour, at once, is asked of the caller (onpick): the
  same sheet then shows it, the carousel gliding on to it,
  its column switching at once, its rows neither sliding nor fading, never
  turning, its page keeping its height as through a submenu. The carousel
  bringing the card to its middle is the only motion: every card keeps its face,
  image and counters drawn through the switch, so nothing blinks as it loads
  again. The centred card is the face that turns over on a flip.
  A card alone shows its face alone.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { prefersReducedMotion } from 'svelte/motion';
  import { fade, fly, slide } from 'svelte/transition';
  import Sheet, { motionMs } from '../components/Sheet.svelte';
  import { buttonGrid } from '../lib/buttonGrid';
  import { overflowTip } from '../lib/overflowTip';
  import CardCounters from './CardCounters.svelte';
  import CardFace from './CardFace.svelte';
  import './countPill.css';
  import { dockMode } from './dockMode';
  import { LIFT_SCALE } from './motion.svelte';
  import type { ActionItem } from './actions';
  import type { ContextAction, ContextEntry, ContextHeader, ContextSubmenu } from './contextItems';
  import { splitEntries, visibleEntries, type SheetCounter, type StackCard } from './inspector';

  let {
    header,
    entries,
    note,
    images,
    landscape = false,
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
    /** The face is a landscape card. */
    landscape?: boolean;
    /** The tokens, statuses and modifiers the card carries (inspector.countersFor). */
    counters: SheetCounter[];
    /** The stack the card belongs to, its main card first (inspector.stackCardsOf); none for a card on its own. */
    stack?: StackCard[];
    /** The id of the table card shown, which the strip rings; none for a pile or a hand card. */
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

  /** How long a page takes to slide in as the other one leaves, in ms. */
  const PAGE_MS = 220;
  /** How long a counter row or an entry takes to slide open or closed, in ms. */
  const ROW_MS = 200;
  /** How long the card takes to turn over, edge-on half way: a table card's FLIP_MS (motion.svelte.ts). */
  const TURN_MS = 360;
  /** The perspective of a table card turning over (motion.svelte.ts FLIP_PERSPECTIVE). */
  const TURN_PERSPECTIVE = 'perspective(700px)';
  /** How long the sheet takes to ease to the size of the new side, before the card turns, in ms. */
  const RESIZE_MS = 200;
  /**
   * How much nearer the carousel's middle another card must be than the shown one before it becomes
   * the shown one, in px: twice how far past the midpoint between them the middle must go. A finger
   * resting on that midpoint does not flip the sheet back and forth.
   */
  const SWITCH_SLACK_PX = 12;

  /** A side of the card: the face it shows, and the header, counters and entries that go with it. */
  type Side = {
    images: string[];
    landscape: boolean;
    header: ContextHeader;
    counters: SheetCounter[];
    entries: ContextEntry[];
    cardId: string | undefined;
  };

  const live = $derived<Side>({ images, landscape, header, counters, entries, cardId });
  /** The side the card turns away from, shown until it is edge-on; null while it does not turn. */
  let leaving = $state.raw<Side | null>(null);
  const side = $derived(leaving ?? live);

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
  /** The side of the last update, which a new face turns away from. */
  let lastSide: Side | null = null;
  /** The hidden copy of the content, drawn with the new side to measure its height. */
  let measureElement = $state<HTMLElement | null>(null);
  /** The width the copy is drawn at: the content's, in px; null while nothing is measured. */
  let measureWidth = $state<number | null>(null);

  /** What tells one face from another: a new array of the same images is the same face. */
  function faceKey(of: Side): string {
    return `${of.landscape ? 'land' : 'portrait'}|${of.images.join('|')}`;
  }

  // Before the sheet is drawn again: the old side stays on screen until the turn reaches edge-on.
  $effect.pre(() => {
    const now = live;
    untrack(() => {
      // While the card turns away, the newest side is the one it shows next.
      if (lastSide !== null && leaving === null) {
        if (isStackSwitch(lastSide, now)) {
          switchCard();
        } else if (faceKey(now) !== faceKey(lastSide)) {
          changeSide(lastSide);
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
    resize?.cancel();
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
   * Shows another card of the stack at once: the page keeps its height and goes back to the main
   * page, and the column changes in place, its rows neither sliding nor fading (atOnce). A fade
   * would dip the column to nothing between the two cards; the carousel gliding to the new one is
   * motion enough. Its faces stay as they are, the shown one's counters coming to life.
   */
  function switchCard(): void {
    turn?.cancel();
    resize?.cancel();
    keepHeightForStack();
    atOnce = true;
    pageStep = -1;
    openId = null;
    // The rows and pages that come or go with this update take their transitions at its end.
    void tick().then(() => (atOnce = false));
  }

  /**
   * Shows the card's new side: the old one stays until the card is edge-on, while the hidden copy
   * measures the new one. Under reduced motion, the face and the rest just change.
   */
  function changeSide(from: Side): void {
    if (motionMs(TURN_MS) === 0 || faceElement === undefined || content === undefined) {
      return;
    }
    turn?.cancel();
    resize?.cancel();
    leaving = from;
    measureWidth = content.offsetWidth;
  }

  /** Eases the sheet to the new side's height, if it differs, then turns the card over. */
  function resizeThenTurn(target: number): void {
    measureWidth = null;
    if (content === undefined) {
      return;
    }
    const current = content.offsetHeight;
    if (Math.abs(target - current) < 1) {
      turnOver();
      return;
    }
    // Held at the new size until the turn ends: the entries sliding in and out as the side changes
    // do not move the sheet again.
    const easing = content.animate([{ height: `${current}px` }, { height: `${target}px` }], {
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
   * comes down. The sheet takes its own height back once the turn ends.
   */
  function turnOver(): void {
    if (faceElement === undefined) {
      return;
    }
    const element = faceElement;
    const flat = { transform: `${TURN_PERSPECTIVE} rotateY(0deg)`, scale: '1' };
    const edgeOn = { transform: `${TURN_PERSPECTIVE} rotateY(90deg)`, scale: `${LIFT_SCALE}` };
    const half = TURN_MS / 2;

    // Held edge-on until the second half starts: the old side never shows flat again.
    const away = element.animate([flat, edgeOn], {
      duration: half,
      easing: 'ease-in',
      fill: 'forwards',
    });
    turn = away;
    away.onfinish = () => {
      leaving = null;
      const back = element.animate([edgeOn, flat], { duration: half, easing: 'ease-out' });
      turn = back;
      away.cancel();
      back.onfinish = () => {
        resize?.cancel();
        resize = undefined;
      };
    };
  }

  const shown = $derived(visibleEntries(side.entries));
  const split = $derived(splitEntries(shown));

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
  /** The sheet has gone to another card of the stack: its page keeps its height from then on. */
  let heldForStack = false;
  /** The pages and rows of this update come and go at once: a switch to another card of the stack. */
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

  // Found again in every redraw's entries: a submenu whose row went, or got refused, closes.
  const openSubmenu = $derived(
    shown.find((entry): entry is ContextSubmenu => entry.kind === 'submenu' && entry.id === openId),
  );

  // The row the focus was on goes as the list changes: the focus moves to the Back row, or back to
  // the submenu's row, rather than falling out of the sheet.
  async function openSub(entry: ContextSubmenu): Promise<void> {
    // Measured before the switch, on the main page; already held while it is still sliding back.
    heldHeight ??= pagesElement?.offsetHeight ?? null;
    pageStep = 1;
    openId = entry.id;
    await tick();
    content?.querySelector<HTMLElement>('.back')?.focus();
  }

  // A submenu entry that leaves the sheet open (a token, a status, a modifier) is done with its
  // submenu: the main page shows what it added. One that closes the sheet needs nothing more.
  async function runFromSub(item: ActionItem): Promise<void> {
    onrun(item);
    await closeSub();
  }

  async function closeSub(): Promise<void> {
    const id = openId;
    pageStep = -1;
    openId = null;
    await tick();
    if (id !== null) {
      content?.querySelector<HTMLElement>(`[data-submenu="${CSS.escape(id)}"]`)?.focus();
    }
  }

  /**
   * Tells the entries apart in an each block. A separator has no id: it goes by the entry before
   * it, so that it stays put, rather than sliding out and in again, when an entry above it leaves.
   */
  function keyOf(entry: ContextEntry, i: number, list: readonly ContextEntry[]): string {
    switch (entry.kind) {
      case 'action':
        return entry.item.id;
      case 'submenu':
        return `sub:${entry.id}`;
      case 'separator': {
        const before = list[i - 1];
        return before === undefined ? 'sep:' : `sep:${keyOf(before, i - 1, list)}`;
      }
    }
  }

  /** The slide of a row that comes or goes after an update. */
  function rowSlide(): { duration: number; easing: (t: number) => number } {
    return { duration: atOnce ? 0 : motionMs(ROW_MS), easing: cubicOut };
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

{#snippet actionRow(entry: ContextAction, run: (item: ActionItem) => void)}
  <button
    type="button"
    class="row btn-ghost"
    class:default={entry.item.default}
    onclick={() => run(entry.item)}><span class="label">{entry.item.label}</span></button
  >
{/snippet}

{#snippet separator()}
  <div class="sep" role="separator"></div>
{/snippet}

<!-- The main page of the entries: the first group as large buttons, the others as rows. -->
{#snippet mainPage(parts: ReturnType<typeof splitEntries>)}
  {#if parts.main.length > 0}
    <div class="main-grid" {@attach buttonGrid()}>
      {#each parts.main as entry (entry.item.id)}
        <button
          type="button"
          class="main"
          class:default={entry.item.default}
          onclick={() => onrun(entry.item)}
          transition:fade={rowSlide()}
          ><span class="label" use:overflowTip>{entry.item.label}</span></button
        >
      {/each}
    </div>
  {/if}
  {#if parts.rest.length > 0}
    <div class="rows">
      {#each parts.rest as entry, i (keyOf(entry, i, parts.rest))}
        <!-- The slide is on the entry's own block: one inside an if block would not play. -->
        <div class="entry" transition:slide={rowSlide()}>
          {#if entry.kind === 'separator'}
            {@render separator()}
          {:else if entry.kind === 'submenu'}
            <button
              type="button"
              class="row btn-ghost"
              data-submenu={entry.id}
              onclick={() => openSub(entry)}
              ><span class="label">{entry.label}</span><span class="opens" aria-hidden="true"
                >›</span
              ></button
            >
          {:else}
            {@render actionRow(entry, onrun)}
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

<!-- The note or the entries, in the card's column under its name. -->
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
            <div class="rows">
              <button type="button" class="row back btn-ghost" onclick={closeSub}
                ><span class="label"><span aria-hidden="true">‹ </span>Back</span><span
                  class="where">{openSubmenu.label}</span
                ></button
              >
              {#each openSubmenu.entries as entry, i (keyOf(entry, i, openSubmenu.entries))}
                <div class="entry" transition:slide={rowSlide()}>
                  {#if entry.kind === 'separator'}
                    {@render separator()}
                  {:else}
                    {@render actionRow(entry, runFromSub)}
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            {@render mainPage(split)}
          {/if}
        </div>
      {/key}
    </div>
  {/if}
{/snippet}

<!-- The sheet is named by its whole header, its type, stage or owner included: shown, the name
     alone, which is not read a second time; an eyebrow line would take room. -->
{#snippet nameline(of: ContextHeader)}
  <div class="nameline" aria-hidden="true">
    <span class="name" use:overflowTip>{of.name}</span>
    {#if of.count !== undefined}<span class="count count-pill">{of.count}</span>{/if}
  </div>
{/snippet}

<!-- The shown card's tokens, tabs and badges, on its face: the way to change them. -->
{#snippet faceCounters()}
  <CardCounters
    counters={side.counters}
    landscape={side.landscape}
    scheme={side.header.scheme ?? false}
    {onstep}
  />
{/snippet}

<!-- Room before the first card and after the last one, so that both can snap to the middle. -->
{#snippet spacer(card: StackCard)}
  <i class="spacer" class:land={card.landscape} aria-hidden="true"></i>
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
      {@const shown = card.id === side.cardId}
      {@const landscape = shown ? side.landscape : card.landscape}
      <!-- A neighbour is a button: its role is set as it peeks, which the check cannot follow. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="slide"
        class:land={landscape}
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
          aria-hidden={shown ? undefined : 'true'}
          {@attach shown && holdFace}
        >
          <CardFace
            images={shown ? side.images : card.images}
            name={shown ? side.header.name : card.name}
            {landscape}
          />
          <CardCounters
            counters={shown ? side.counters : (card.counters ?? [])}
            {landscape}
            scheme={(shown ? side.header.scheme : card.scheme) ?? false}
            onstep={shown ? onstep : undefined}
          />
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
      <div
        class="slide"
        class:land={card.id === live.cardId ? live.landscape : card.landscape}
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
      <div class="page">{@render mainPage(splitEntries(measured))}</div>
    </div>
  {/if}
{/snippet}

<Sheet label={header.label} dock={dock.current} wide={!dock.current} {onclose}>
  <div class="inspector" class:dock={dock.current} class:tablet={!dock.current} bind:this={content}>
    <div class="top">
      <div class="visual" class:stacked={stack.length > 1}>
        {#if stack.length > 1}
          {@render stackCarousel()}
        {:else}
          <div class="face" class:land={side.landscape} bind:this={faceElement}>
            <CardFace images={side.images} name={side.header.name} landscape={side.landscape} />
            {@render faceCounters()}
          </div>
        {/if}
      </div>
      <div class="side">
        {@render nameline(side.header)}
        {@render entriesBlock()}
      </div>
    </div>
  </div>

  <!-- Drawn for a moment only, unseen and out of reach, the time to measure the new side. -->
  {#if measureWidth !== null}
    <div
      class="inspector measure"
      class:dock={dock.current}
      class:tablet={!dock.current}
      style:width="{measureWidth}px"
      aria-hidden="true"
      inert
      bind:this={measureElement}
    >
      <div class="top">
        <div class="visual" class:stacked={stack.length > 1}>
          {#if stack.length > 1}
            {@render measuredCarousel()}
          {:else}
            <div class="face" class:land={live.landscape}></div>
          {/if}
        </div>
        <div class="side">
          {@render nameline(live.header)}
          {@render measuredEntries()}
        </div>
      </div>
    </div>
  {/if}
</Sheet>

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    padding: 0 14px;
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

  /* The face beside its column: its name and entries. */
  .top {
    display: flex;
    gap: 12px;
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
    --face-ratio: its width over its height, which dock mode sizes it by. No minimum size from its
    image: the face keeps the card's ratio whatever the scan's, as the copy that measures a new
    side, drawn without an image, lays it out.
  */
  .face {
    --face-ratio: 5 / 7;
    position: relative;
    flex: none;
    min-width: 0;
    min-height: 0;
    aspect-ratio: var(--face-ratio);
    border-radius: var(--card-radius);
    box-shadow: 4px 6px 16px #000c;
  }

  .face.land {
    --face-ratio: 7 / 5;
    border-radius: var(--card-radius-land);
  }

  /*
    The stack's carousel, in place of the face: sideways only, each card snapping to the middle.
    Padded above and below for the cards' shadows. --slide-h and --slide-max size the cards: the
    shown one is as large as a card alone would be, with room left for its neighbours to peek.
    --carousel-chrome: the height it takes besides its cards, its padding (24 px), the gap (8 px)
    and the dots (6 px).
  */
  .visual.stacked {
    --slide-max: 82%;
    --carousel-chrome: 38px;
  }

  .carousel {
    --gap: 12px;
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--gap);
    padding-block: 10px 14px;
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
    --face-ratio: 5 / 7;
    --slide-w: min(var(--slide-max), calc(var(--slide-h) * var(--face-ratio)));
  }

  .slide.land,
  .spacer.land {
    --face-ratio: 7 / 5;
  }

  /* Flex items rather than padding: some browsers leave a scroller's end padding out of its scroll. */
  .spacer {
    flex: none;
    align-self: stretch;
    width: calc((100% - var(--slide-w)) / 2 - var(--gap));
  }

  /* A tapped neighbour gets no highlight over it: it lights up as it glides to the middle. */
  .slide {
    position: relative;
    flex: none;
    width: var(--slide-w);
    aspect-ratio: var(--face-ratio);
    scroll-snap-align: center;
    -webkit-tap-highlight-color: transparent;
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
  .slide.dim > .face {
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

  /* The column's width tells the main buttons how many go side by side (see .main-grid). */
  .side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    container-type: inline-size;
  }

  /*
    The name centred, with a pile's count beside it: the two centred as one, with room above and
    below, and on their sides, so that a long name never meets the sheet's edges. The copy that
    measures a new side draws the same line.
  */
  .nameline {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
  }

  /* One line: a long name is cut with an ellipsis (overflowTip shows it whole), never the count. */
  .name {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 20px;
    font-weight: 800;
    line-height: 1.1;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A pile's count, in a pile's capsule (countPill.css), its digits lined up as they change. */
  .count {
    flex: none;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .note {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  /*
    The first group: large buttons, the default one in Fray red. One per row in a narrow column,
    two in a wide one, never one alone on the last line (lib/buttonGrid.ts): a lone button the
    whole width, three in a row when they fit there, or else the first one, the default
    (inspector.splitEntries), the whole width on top.
  */
  .main-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  @container (min-width: 260px) {
    .main-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .main-grid:global([data-layout='single']) {
      grid-template-columns: minmax(0, 1fr);
    }

    .main-grid:global([data-layout='row']) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .main-grid:global([data-layout='lead']) > .main:first-child {
    grid-column: 1 / -1;
  }

  .main {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 44px;
    padding: 4px 8px;
    border: 0;
    border-radius: 10px;
    background: var(--panel-2);
    font-size: 14px;
    font-weight: 700;
    text-align: center;
  }

  /* A label stays on one line, cut short if it must: as wide as its text, so that its overflow
     tells the grid a row is too narrow for it (lib/buttonGrid.ts). */
  .main .label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .main.default {
    background: var(--accent);
    color: var(--bg);
  }

  .main.default:hover {
    background: var(--accent-hover);
  }

  /* A press reads as taken before the sheet closes: the default button darkens as the primary
     button's panel does, a row lights up; both sink below, with motion. */
  .main.default:active {
    background: var(--accent-deep);
  }

  .row:active:not(:disabled) {
    background-color: var(--hover);
  }

  @media (prefers-reduced-motion: no-preference) {
    .main {
      transition:
        background-color 0.12s,
        transform 0.08s ease-out;
    }

    .main:active {
      transform: scale(0.96);
    }

    /* The carousel's cards and dots, as the centred card changes. */
    .slide {
      transition:
        scale 0.2s,
        opacity 0.2s;
    }

    .dots i {
      transition: width 0.2s;
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

  /* The other groups: full-width rows. */
  .rows {
    display: flex;
    flex-direction: column;
  }

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

  .row.default .label {
    font-weight: 800;
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
    height: 1px;
    margin: 2px 0;
    background: var(--line-strong);
  }

  /*
    Dock mode upright: the card on top, centred, as wide as the sheet allows
    while it stays at most 42 % of the screen high; the name, the counters
    and the entries full width under it. The
    sheet pads them and scrolls the whole (Sheet.svelte), if it must.
  */
  .inspector.dock {
    padding: 0;
  }

  .inspector.dock .top {
    flex-direction: column;
    align-items: center;
  }

  /* The face centred in a full-width column, or the stack's carousel across it. */
  .inspector.dock .visual {
    width: 100%;
    align-items: center;
  }

  .inspector.dock .visual.stacked {
    --slide-h: 42dvh;
    --slide-max: 80%;
    width: 100%;
    align-items: stretch;
  }

  .inspector.dock .face {
    width: min(100%, calc(42dvh * var(--face-ratio)));
  }

  .inspector.dock .side {
    align-self: stretch;
  }

  /*
    A phone on its side: two columns, the card as high as the sheet, as wide as
    its aspect makes it, on the left, and the rest on its right. Only the
    column scrolls, once its content is higher than the room the sheet has.
  */
  @media (max-height: 500px) {
    .inspector.dock .top {
      flex-direction: row;
      align-items: flex-start;
    }

    /* The column as wide as the face. */
    .inspector.dock .visual {
      width: auto;
    }

    /* The carousel as high as the sheet; as wide as a card with 44 px on each side for its neighbours. */
    .inspector.dock .visual.stacked {
      --slide-h: calc(var(--sheet-room) - var(--carousel-chrome));
      width: calc(var(--slide-h) * 5 / 7 + 88px);
    }

    .inspector.dock .face {
      width: auto;
      height: var(--sheet-room);
    }

    .inspector.dock .side {
      align-self: auto;
      max-height: var(--sheet-room);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  }

  .inspector.dock .name {
    font-size: 18px;
  }

  /*
    A tablet: laid out as a phone on its side, in a wide sheet (Sheet.svelte). --sheet-room is the
    card's height: at most 460 px and 70 % of the screen. Only the column scrolls, once it is
    higher than the card.
  */
  .inspector.tablet {
    --sheet-room: min(460px, 70dvh);
  }

  /* A container, for a landscape face to leave its column room enough (see below). */
  .inspector.tablet .top {
    container-type: inline-size;
  }

  /* The carousel's cards as high as the room less its chrome, 44 px on each side for the neighbours. */
  .inspector.tablet .visual.stacked {
    --slide-h: calc(var(--sheet-room) - var(--carousel-chrome));
    width: calc(var(--slide-h) * 5 / 7 + 88px);
  }

  /*
    A card alone, not the carousel's cards. A landscape one is as wide as a portrait one is high,
    but leaves its column at least 300 px past the gap (12 px): narrower, its main buttons would go
    one per line (.main-grid's 260 px container query).
  */
  .inspector.tablet .visual > .face {
    height: var(--sheet-room);
  }

  .inspector.tablet .visual > .face.land {
    width: min(var(--sheet-room), 100cqi - 312px);
    height: auto;
  }

  .inspector.tablet .side {
    max-height: var(--sheet-room);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
</style>
