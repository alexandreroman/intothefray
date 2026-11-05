<!--
  The inspector of a table card or pile on a touch screen, in place of its
  context menu (ContextMenu.svelte): a bottom sheet (Sheet.svelte) with the
  card's face large beside its name and its counters, then the same entries
  as the menu (contextItems.ts). The first group shows as large buttons, the
  default one in Fray red, the others as rows; a submenu opens in the sheet,
  with a Back row. A refused entry is not shown at all (inspector.visibleEntries):
  it would take room for nothing. No key hints: a touch screen has no keyboard to press them on.
  A chosen entry runs as the menu's does: the caller closes the sheet, or keeps
  it open for a token, status or modifier, which then shows back on the main
  page with its steppers.
  In dock mode (a phone) the sheet uses the whole screen. Upright, the card is
  on top, centred, and everything else full width under it, the whole sheet
  scrolling if it must; on its side, the card as large as it allows on the
  left, and everything else in one column on its right, the only part that
  scrolls.
  Motion, short and eased out, none under reduced motion (Sheet.motionMs): a
  submenu slides in from the right as the main page leaves to the left, and
  back the other way; a counter
  row or an entry that comes or goes after an update slides open or closed;
  a counter's number bumps as it changes; a pressed button sinks. When the
  face the card shows changes (a flip, a stage turned, a card turned face
  down or up), the card turns over as a table card does, in place: the name
  and the entries follow its new side once it is edge-on. Another element
  opens a sheet of its own (Table.svelte keys it), which does not turn.
  The sheet keeps its size through a submenu: its page is as high as the main
  page was when it opened, scrolling if longer, so the card never moves.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly, slide, type TransitionConfig } from 'svelte/transition';
  import Sheet, { motionMs } from '../components/Sheet.svelte';
  import CardFace from './CardFace.svelte';
  import { dockMode } from './dockMode';
  import { LIFT_SCALE } from './motion.svelte';
  import { counterName, MAX_MODIFIER, withSign, type ActionItem } from './actions';
  import type { ContextAction, ContextEntry, ContextHeader, ContextSubmenu } from './contextItems';
  import { splitEntries, visibleEntries, type SheetCounter } from './inspector';

  let {
    header,
    entries,
    note,
    images,
    landscape = false,
    counters,
    onrun,
    onstep,
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
    /** Runs a chosen item; the caller closes the sheet. */
    onrun: (item: ActionItem) => void;
    /** Adds one to a counter, or takes one away. */
    onstep: (counter: SheetCounter, delta: -1 | 1) => void;
    onclose: () => void;
  } = $props();

  const dock = dockMode();

  /** How long a page takes to slide in as the other one leaves, in ms. */
  const PAGE_MS = 220;
  /** How long a counter row or an entry takes to slide open or closed, in ms. */
  const ROW_MS = 200;
  /** How long a counter's number takes to bump as it changes, in ms. */
  const BUMP_MS = 160;
  /** How long the card takes to turn over, edge-on half way: a table card's FLIP_MS (motion.svelte.ts). */
  const TURN_MS = 360;
  /** The perspective of a table card turning over (motion.svelte.ts FLIP_PERSPECTIVE). */
  const TURN_PERSPECTIVE = 'perspective(700px)';

  /** A side of the card: the face it shows, and the name and entries that go with it. */
  type Side = { images: string[]; landscape: boolean; name: string; entries: ContextEntry[] };

  const live = $derived<Side>({ images, landscape, name: header.name, entries });
  /** The side the card turns away from, shown until it is edge-on; null while it does not turn. */
  let leaving = $state.raw<Side | null>(null);
  const side = $derived(leaving ?? live);

  let faceElement = $state<HTMLElement>();
  let turn: Animation | undefined;
  /** The side of the last update, which a new face turns away from. */
  let lastSide: Side | null = null;

  /** What tells one face from another: a new array of the same images is the same face. */
  function faceKey(of: Side): string {
    return `${of.landscape ? 'land' : 'portrait'}|${of.images.join('|')}`;
  }

  // Before the sheet is drawn again: the old side stays on screen until the turn reaches edge-on.
  $effect.pre(() => {
    const now = live;
    untrack(() => {
      // While the card turns away, the newest side is the one it shows once edge-on.
      if (lastSide !== null && leaving === null && faceKey(now) !== faceKey(lastSide)) {
        turnOver(lastSide);
      }
      lastSide = now;
    });
  });

  $effect(() => () => turn?.cancel());

  /**
   * Turns the card over around its vertical axis, as a table card does (motion.svelte.ts #flip):
   * its old side turns away to edge-on, lifted, then its new side turns back flat and comes down.
   * Under reduced motion, the face just changes.
   */
  function turnOver(from: Side): void {
    if (motionMs(TURN_MS) === 0 || faceElement === undefined) {
      return;
    }
    const element = faceElement;
    const flat = { transform: `${TURN_PERSPECTIVE} rotateY(0deg)`, scale: '1' };
    const edgeOn = { transform: `${TURN_PERSPECTIVE} rotateY(90deg)`, scale: `${LIFT_SCALE}` };
    const half = TURN_MS / 2;

    turn?.cancel();
    leaving = from;
    // Held edge-on until the second half starts: the old side never shows flat again.
    const away = element.animate([flat, edgeOn], {
      duration: half,
      easing: 'ease-in',
      fill: 'forwards',
    });
    turn = away;
    away.onfinish = () => {
      leaving = null;
      turn = element.animate([edgeOn, flat], { duration: half, easing: 'ease-out' });
      away.cancel();
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

  /** What a stepper button does, as a screen reader says it: "Add one damage", "Remove one from the DEF modifier". */
  function stepLabel(counter: SheetCounter, delta: -1 | 1): string {
    const name = counterName(counter.kind, counter.name);
    if (counter.kind === 'modifier') {
      return delta === 1 ? `Add one to the ${name}` : `Remove one from the ${name}`;
    }
    return delta === 1 ? `Add one ${name}` : `Remove one ${name}`;
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
    return { duration: motionMs(ROW_MS), easing: cubicOut };
  }

  /** A page slides in from the side it is reached from, and out to the other: right for a submenu. */
  function pageSlide(direction: 'in' | 'out'): Parameters<typeof fly>[1] {
    const side = direction === 'in' ? pageStep : -pageStep;
    return { x: `${100 * side}%`, duration: motionMs(PAGE_MS), easing: cubicOut };
  }

  /** Once a page has slid in, the main page alone gets its own size back. */
  function onPageShown(): void {
    sliding = false;
    if (openId === null) {
      heldHeight = null;
    }
  }

  /** A page on its way out takes no more taps, and its rows no more focus. */
  function onPageOutro(event: Event): void {
    (event.currentTarget as HTMLElement).inert = true;
  }

  /** A counter's number as it changes: up to 1.15 times its size and back. */
  function bump(_node: Element): TransitionConfig {
    return {
      duration: motionMs(BUMP_MS),
      css: (t) => `transform: scale(${1 + 0.15 * Math.sin(Math.PI * t)})`,
    };
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

{#snippet counterRow(counter: SheetCounter)}
  <div class="counter" transition:slide={rowSlide()}>
    <span class="what"
      ><i class="dot {counter.kind} {counter.name}" class:neg={counter.value < 0}
      ></i>{counter.label}</span
    >
    {#if counter.kind === 'status'}
      {#if counter.value > 1}
        {#key counter.value}<span class="value" in:bump>×{counter.value}</span>{/key}
      {/if}
      <button
        type="button"
        class="step"
        aria-label="Remove {counterName('status', counter.name)}"
        onclick={() => onstep(counter, -1)}>✕</button
      >
    {:else}
      <button
        type="button"
        class="step"
        aria-label={stepLabel(counter, -1)}
        disabled={counter.signed && counter.value <= -MAX_MODIFIER}
        onclick={() => onstep(counter, -1)}>−</button
      >
      {#key counter.value}
        <span class="value" in:bump>{counter.signed ? withSign(counter.value) : counter.value}</span
        >
      {/key}
      <button
        type="button"
        class="step"
        aria-label={stepLabel(counter, 1)}
        disabled={counter.signed && counter.value >= MAX_MODIFIER}
        onclick={() => onstep(counter, 1)}>+</button
      >
    {/if}
  </div>
{/snippet}

<!-- The note or the entries: under the card, or in its column in dock mode. -->
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
            {#if split.main.length > 0}
              <div class="main-grid" style:--columns={split.main.length}>
                {#each split.main as entry (entry.item.id)}
                  <button
                    type="button"
                    class="main"
                    class:default={entry.item.default}
                    onclick={() => onrun(entry.item)}
                    transition:fade={rowSlide()}
                    ><span class="label">{entry.item.label}</span></button
                  >
                {/each}
              </div>
            {/if}
            {#if split.rest.length > 0}
              <div class="rows">
                {#each split.rest as entry, i (keyOf(entry, i, split.rest))}
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
                        ><span class="label">{entry.label}</span><span
                          class="opens"
                          aria-hidden="true">›</span
                        ></button
                      >
                    {:else}
                      {@render actionRow(entry, onrun)}
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      {/key}
    </div>
  {/if}
{/snippet}

<Sheet label={header.label} dock={dock.current} {onclose}>
  <div class="inspector" class:dock={dock.current} bind:this={content}>
    <div class="top">
      <div class="face" class:land={side.landscape} bind:this={faceElement}>
        <CardFace images={side.images} name={side.name} landscape={side.landscape} />
      </div>
      <div class="side">
        <!-- The sheet is named by its whole header, its type, stage or owner included: shown, the
             name alone, which is not read a second time; an eyebrow line would take room. -->
        <div class="nameline" aria-hidden="true">
          <span class="name">{side.name}</span>
          {#if header.count !== undefined}<span class="count">{header.count}</span>{/if}
        </div>
        {#each counters as counter (`${counter.kind}:${counter.name}`)}
          {@render counterRow(counter)}
        {/each}
        {#if dock.current}
          {@render entriesBlock()}
        {/if}
      </div>
    </div>

    {#if !dock.current}
      {@render entriesBlock()}
    {/if}
  </div>
</Sheet>

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 0 14px;
    user-select: none;
    -webkit-user-select: none;
  }

  /* The face beside what the element is and the counters it carries. */
  .top {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  /* --face-ratio: its width over its height, which dock mode sizes it by. */
  .face {
    --face-ratio: 5 / 7;
    flex: none;
    width: 46%;
    aspect-ratio: var(--face-ratio);
    border-radius: var(--card-radius);
    box-shadow: 4px 6px 16px #000c;
  }

  .face.land {
    --face-ratio: 7 / 5;
    border-radius: var(--card-radius-land);
  }

  .side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .nameline {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .name {
    min-width: 0;
    color: var(--text);
    font-size: 20px;
    font-weight: 800;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }

  /* A pile's count: a small pill, its digits lined up as they change. */
  .count {
    flex: none;
    padding: 0 8px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--panel-2);
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 22px;
  }

  /* A counter: its colour and name, then its steppers. */
  .counter {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: 12px;
    background: var(--panel-2);
  }

  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 6px;
    overflow: hidden;
    font-size: 14px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The colours of the card's discs and tabs (CardView.svelte). */
  .dot {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--line-strong);
  }

  .dot.token.dmg {
    background: #d8352b;
  }

  .dot.token.thr {
    background: #e08a1e;
  }

  .dot.token.gen {
    background: #1b8a4a;
  }

  .dot.token.acc {
    background: var(--accent);
  }

  .dot.status.stunned {
    background: #25a058;
  }

  .dot.status.confused {
    background: #a274e6;
  }

  .dot.status.tough {
    background: #f0a53a;
  }

  .dot.status.retaliate {
    background: #2bb0b5;
  }

  .dot.status.locked {
    background: #7d8aa8;
  }

  /* A modifier is a tab rather than a disc; a penalty is in the Fray red. */
  .dot.modifier {
    border-radius: 3px;
    background: var(--muted);
  }

  .dot.modifier.neg {
    background: var(--accent);
  }

  .value {
    flex: none;
    min-width: 30px;
    font-size: 17px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .step {
    flex: none;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: var(--panel);
    font-size: 22px;
    font-weight: 700;
  }

  .step:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .note {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  /* The first group: large buttons side by side, the default one in Fray red. */
  .main-grid {
    display: grid;
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    gap: 8px;
  }

  .main {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 64px;
    padding: 6px;
    border: 0;
    border-radius: 14px;
    background: var(--panel-2);
    font-size: 13px;
    font-weight: 700;
    white-space: normal;
    text-align: center;
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
    .main,
    .step {
      transition:
        background-color 0.12s,
        transform 0.08s ease-out;
    }

    .main:active {
      transform: scale(0.96);
    }

    .step:active:not(:disabled) {
      transform: scale(0.96);
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
    gap: 14px;
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
    min-height: 48px;
    padding: 6px 4px;
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
    margin: 4px 0;
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

  .inspector.dock .face {
    width: min(100%, calc(42dvh * var(--face-ratio)));
  }

  .inspector.dock .side {
    align-self: stretch;
    container-type: inline-size;
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

  /* The main group: one button per row in a narrow column, two in a wide one. */
  .inspector.dock .main-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  @container (min-width: 260px) {
    .inspector.dock .main-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .inspector.dock .main {
    min-height: 44px;
    padding: 4px 8px;
    border-radius: 10px;
    font-size: 14px;
  }

  .inspector.dock .row {
    min-height: 44px;
    padding: 4px 8px;
  }

  .inspector.dock .page {
    gap: 8px;
  }

  .inspector.dock .sep {
    margin: 2px 0;
  }
</style>
