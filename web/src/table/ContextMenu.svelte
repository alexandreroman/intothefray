<!--
  The context menu of a table card or pile, or of a card box's tile
  (contextItems.ts): every action of the element, under its name, or a line
  saying why it has none. Opened by a click, a tap or a right click, at the
  pointer, and flipped up or left to stay inside its bounds (the visible
  table, the box's grid) and the window. A submenu opens beside its row, on
  hover or on a click. Escape, a press outside the menu, a scroll of its
  bounds, a zoom of the table, or a resize close it.
  The table's keys keep working while it is open, on its element as under
  the pointer (keys.ts): the simplest consistent choice. The menu stays open
  and follows what they change ("Damage (7)").
-->
<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { lastPressByPointer } from '../components/modal.svelte';
  import { overflowTip } from '../lib/overflowTip';
  import { keyLabel, type ActionItem } from './actions';
  import type {
    ContextAction,
    ContextEntry,
    ContextHeader,
    ContextSeparator,
    ContextSubmenu,
  } from './contextItems';
  import { intersect, type Rect } from './drag';
  import { placeAtPoint, placeSubmenu, type DropdownPlace } from './dropdown';

  let {
    header,
    entries,
    note,
    at,
    bounds,
    zoom,
    onrun,
    onclose,
  }: {
    /** What the element is and whose, as the header shows it; the menu is named by its label. */
    header: ContextHeader;
    entries: ContextEntry[];
    /** Why the element has no entries for the viewer, shown under the header instead. */
    note?: string;
    /** The point of the screen it opens at. */
    at: { x: number; y: number };
    /** What the menu stays within: the visible table, a box's grid. A scroll of it closes the menu. */
    bounds: HTMLElement;
    /** The table's zoom: a change closes the menu, as its element moves from under it. */
    zoom?: number;
    /** Runs a chosen item; the caller closes the menu first. */
    onrun: (item: ActionItem) => void;
    onclose: () => void;
  } = $props();

  const uid = $props.id();
  const noteId = `${uid}-note`;

  // How long the pointer rests on a row before its submenu opens, or the open
  // one closes: on its way to a submenu, the pointer may cross another row.
  const HOVER_MS = 150;

  let menu = $state<HTMLElement>();
  let submenu = $state<HTMLElement>();
  let place = $state<DropdownPlace | null>(null);
  let subPlace = $state<DropdownPlace | null>(null);
  let openId = $state<string | null>(null);
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  // Found again in every redraw's entries: a submenu whose row went, or got disabled, closes.
  const openSubmenu = $derived(
    entries.find(
      (entry): entry is ContextSubmenu =>
        entry.kind === 'submenu' && entry.id === openId && !entry.disabled,
    ),
  );

  // ---- Placement ----

  /** The visible table, within the window. */
  function room(): Rect {
    const screen = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    return intersect(bounds.getBoundingClientRect(), screen);
  }

  /** Its whole size, even while it is cut to scroll: the content's height, and the borders. */
  function sizeOf(element: HTMLElement): { w: number; h: number } {
    const borders = element.offsetHeight - element.clientHeight;
    return { w: element.getBoundingClientRect().width, h: element.scrollHeight + borders };
  }

  // Placed as it opens, and again from the same point when its entries change size.
  $effect(() => {
    void entries;
    if (menu) {
      place = placeAtPoint(at, sizeOf(menu), room());
    }
  });

  $effect(() => {
    void place;
    if (!openSubmenu || !submenu || !menu) {
      subPlace = null;
      return;
    }
    const row = menu.querySelector(`[data-submenu="${CSS.escape(openSubmenu.id)}"]`);
    if (row) {
      const rows = menu.getBoundingClientRect();
      subPlace = placeSubmenu(rows, row.getBoundingClientRect(), sizeOf(submenu), room());
    }
  });

  // ---- Opening and closing ----

  // The focus moves into the menu, and goes back where it was as it closes. Opened by the pointer,
  // the menu itself takes it, without a ring: the arrow keys then reach its items.
  const focusedBefore =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const openedByPointer = lastPressByPointer();

  onMount(async () => {
    // Not before it shows: the browsers refuse the focus to the menu while it is hidden, unplaced, and it
    // would stay where it was (a card box, whose Escape would then close the box).
    await tick();
    if (!menu?.isConnected) {
      return;
    }
    // From the keyboard, the first item takes it, if there is one.
    const first = openedByPointer ? undefined : itemsOf(menu)[0];
    (first ?? menu).focus({ preventScroll: true });
  });

  onDestroy(() => {
    clearTimeout(hoverTimer);
    // Unless what was chosen took the focus elsewhere (a dialog).
    const active = document.activeElement;
    const left = active === null || active === document.body || isInside(active);
    if (!left) {
      return;
    }
    if (openedByPointer) {
      focusedBefore?.focus({ preventScroll: true, focusVisible: false });
    } else {
      focusedBefore?.focus({ preventScroll: true });
    }
  });

  // Opened at a zoom, it closes at any other.
  const openedAtZoom = untrack(() => zoom);
  $effect(() => {
    if (zoom !== openedAtZoom) {
      onclose();
    }
  });

  function isInside(target: unknown): boolean {
    return target instanceof Node && (!!menu?.contains(target) || !!submenu?.contains(target));
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    if (!isInside(event.target)) {
      onclose();
    }
  }

  /**
   * Escape closes the open submenu, then the menu, wherever the focus is: in
   * the capture phase of the window, before anything else sees the key, so
   * that it does nothing more (a card box under the menu stays open, the
   * table's selection stays).
   */
  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (openId !== null) {
      closeSubmenu();
    } else {
      onclose();
    }
  }

  /** A scroll that moves the element (its bounds', the page's) closes it; the menu's own does not. */
  function onScroll(event: Event): void {
    const target = event.target;
    if (target instanceof Node && target.contains(bounds)) {
      onclose();
    }
  }

  // ---- Choosing ----

  /** A disabled item is aria-disabled rather than disabled, so that its reason shows: its clicks do nothing. */
  function run(item: ActionItem): void {
    if (item.disabled) {
      return;
    }
    onrun(item);
  }

  /** The pointer rests on a row: after a while, its submenu opens, or the open one closes. */
  function hoverRow(entry: ContextEntry): void {
    clearTimeout(hoverTimer);
    const next = entry.kind === 'submenu' && !entry.disabled ? entry.id : null;
    if (next !== openId) {
      hoverTimer = setTimeout(() => (openId = next), HOVER_MS);
    }
  }

  /** A click opens the submenu at once; from the keyboard (Enter, Space), the focus goes into it. */
  async function clickSubmenu(entry: ContextSubmenu, event: MouseEvent): Promise<void> {
    if (entry.disabled) {
      return;
    }
    clearTimeout(hoverTimer);
    openId = entry.id;
    // A click from a key has no pointer details.
    if (event.detail === 0) {
      await focusSubmenu();
    }
  }

  async function focusSubmenu(): Promise<void> {
    await tick();
    itemsOf(submenu)[0]?.focus();
  }

  // ---- The keyboard ----

  function itemsOf(list: HTMLElement | undefined): HTMLElement[] {
    return [...(list?.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]') ?? [])];
  }

  /** Moves the focus to the next (1) or previous (-1) item of the list, round it. */
  function step(list: HTMLElement | undefined, by: 1 | -1): void {
    const items = itemsOf(list);
    const current = items.findIndex((item) => item === document.activeElement);
    const next = current === -1 ? (by === 1 ? 0 : items.length - 1) : current + by;
    items[(next + items.length) % items.length]?.focus();
  }

  /** Closes the open submenu, the focus back on its row when it was inside. */
  function closeSubmenu(): void {
    const focusRow = !!submenu?.contains(document.activeElement);
    const id = openId;
    openId = null;
    if (focusRow && id !== null) {
      menu?.querySelector<HTMLElement>(`[data-submenu="${CSS.escape(id)}"]`)?.focus();
    }
  }

  /** → on a submenu row: its submenu opens, the focus on its first item. */
  function openFocusedRow(): void {
    const row = document.activeElement;
    const id = row instanceof HTMLElement ? row.dataset.submenu : undefined;
    const entry = entries.find(
      (candidate): candidate is ContextSubmenu =>
        candidate.kind === 'submenu' && candidate.id === id,
    );
    if (entry && !entry.disabled) {
      clearTimeout(hoverTimer);
      openId = entry.id;
      void focusSubmenu();
    }
  }

  /**
   * ↑ and ↓ step through the items, → opens the focused row's submenu, ←
   * closes the submenu (Escape: onWindowKeyDown). Taken: the table's keys do
   * not see them.
   */
  function onMenuKey(event: KeyboardEvent, inSubmenu: boolean): void {
    const list = inSubmenu ? submenu : menu;
    switch (event.key) {
      case 'ArrowDown':
        step(list, 1);
        break;
      case 'ArrowUp':
        step(list, -1);
        break;
      case 'ArrowRight':
        if (!inSubmenu) {
          openFocusedRow();
        }
        break;
      case 'ArrowLeft':
        if (inSubmenu) {
          closeSubmenu();
        }
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  /** Tells the entries apart in an each block: separators have no id. */
  function keyOf(entry: ContextEntry, i: number): string {
    switch (entry.kind) {
      case 'action':
        return entry.item.id;
      case 'submenu':
        return `sub:${entry.id}`;
      case 'separator':
        return `sep:${i}`;
    }
  }
</script>

<svelte:window onkeydowncapture={onWindowKeyDown} onscrollcapture={onScroll} onresize={onclose} />
<svelte:document onpointerdowncapture={onDocumentPointerDown} />

{#snippet actionRow(entry: ContextAction)}
  {@const item = entry.item}
  <!-- Disabled, it says why in its tooltip. -->
  <button
    type="button"
    class="btn-ghost"
    class:default={item.default}
    role="menuitem"
    aria-disabled={item.disabled}
    data-tip={item.disabled ? item.tip : undefined}
    onpointerenter={() => hoverRow(entry)}
    onclick={() => run(item)}
    ><span>{item.label}</span>{#if item.key}<kbd>{keyLabel(item)}</kbd>{/if}</button
  >
{/snippet}

{#snippet separator()}
  <div class="msep" role="separator"></div>
{/snippet}

{#snippet subRows(list: (ContextAction | ContextSeparator)[])}
  {#each list as entry, i (keyOf(entry, i))}
    {#if entry.kind === 'separator'}
      {@render separator()}
    {:else}
      {@render actionRow(entry)}
    {/if}
  {/each}
{/snippet}

<div
  class="table-menu context"
  class:placed={place !== null}
  role="menu"
  aria-label={header.label}
  aria-describedby={note === undefined ? undefined : noteId}
  tabindex="-1"
  bind:this={menu}
  style:left="{place?.left ?? 0}px"
  style:top="{place?.top ?? 0}px"
  style:max-height={place?.maxHeight == null ? undefined : `${place.maxHeight}px`}
  onkeydown={(event) => onMenuKey(event, false)}
  oncontextmenu={(event) => event.preventDefault()}
>
  <!-- The menu is named by its header, which is not read a second time. -->
  <div class="title" aria-hidden="true" style:--owner={header.color}>
    <div class="eyebrow" use:overflowTip>{header.eyebrow}</div>
    <div class="nameline">
      <span class="name" use:overflowTip>{header.name}</span>
      {#if header.count !== undefined}<span class="count">{header.count}</span>{/if}
    </div>
  </div>
  {#if note !== undefined}
    <!-- Not a choice: read as the menu's description. -->
    <p class="note" id={noteId}>{note}</p>
  {/if}
  {#each entries as entry, i (keyOf(entry, i))}
    {#if entry.kind === 'separator'}
      {@render separator()}
    {:else if entry.kind === 'submenu'}
      <button
        type="button"
        class="btn-ghost"
        class:open={openSubmenu?.id === entry.id}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={openSubmenu?.id === entry.id}
        aria-disabled={entry.disabled}
        data-submenu={entry.id}
        data-tip={entry.disabled ? entry.tip : undefined}
        onpointerenter={() => hoverRow(entry)}
        onclick={(event) => clickSubmenu(entry, event)}
        ><span>{entry.label}</span><span class="opens" aria-hidden="true">▸</span></button
      >
    {:else}
      {@render actionRow(entry)}
    {/if}
  {/each}
</div>

{#if openSubmenu}
  <div
    class="table-menu context"
    class:placed={subPlace !== null}
    role="menu"
    aria-label={openSubmenu.label}
    tabindex="-1"
    bind:this={submenu}
    style:left="{subPlace?.left ?? 0}px"
    style:top="{subPlace?.top ?? 0}px"
    style:max-height={subPlace?.maxHeight == null ? undefined : `${subPlace.maxHeight}px`}
    onpointerenter={() => clearTimeout(hoverTimer)}
    onkeydown={(event) => onMenuKey(event, true)}
    oncontextmenu={(event) => event.preventDefault()}
  >
    {@render subRows(openSubmenu.entries)}
  </div>
{/if}

<style>
  /*
    Over the table, the hand and a card box's tiles: flat items on the ink panel, a key on a dark
    chip at the right. Cut to the room it has, it scrolls inside (dropdown.ts). Its padding and its
    border make MENU_INSET there: a submenu's first item lines up with its row.
  */
  .table-menu {
    position: fixed;
    z-index: 5000;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    min-width: 180px;
    padding: 5px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--panel-2);
    box-shadow: 0 14px 34px #0009;
    /* A panel of choices, not of text: the hand all over it (headers, separators, padding), and
       no text cursor or selection. A disabled item keeps the arrow of a disabled button. */
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
  }

  /* Cut short, its items keep their height: it scrolls rather than squeezing them. */
  .table-menu > * {
    flex-shrink: 0;
  }

  .table-menu:focus {
    outline: none;
  }

  /* Flat items: only the hovered one lights up. */
  .table-menu button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    width: 100%;
    height: 34px;
    padding: 0 11px;
    border: 0;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 600;
    text-align: left;
  }

  /* A finger needs a taller target than a mouse. */
  @media (pointer: coarse) {
    .table-menu button {
      height: 44px;
    }
  }

  .table-menu button:focus-visible {
    outline: 2px solid var(--sel);
    outline-offset: -2px;
  }

  .msep {
    height: 1px;
    margin: 4px 2px;
    background: var(--line-strong);
  }

  /* The key of a choice, on a dark chip. */
  kbd {
    padding: 1px 6px;
    border-radius: 5px;
    background: var(--bg);
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
  }

  /* Measured before it is placed: unseen until then. */
  .context {
    visibility: hidden;
  }

  .context.placed {
    visibility: visible;
    animation: menuin 0.1s ease-out;
  }

  @keyframes menuin {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .context.placed {
      animation: none;
    }
  }

  /* What the element is, and whose: not a choice. Lined up with the items' labels. */
  .title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 280px;
    padding: 6px 11px 9px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--line-strong);
  }

  .eyebrow,
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A caps label, as the dropdowns' section headings, in the owner's colour: their frame's. */
  .eyebrow {
    color: var(--owner);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .nameline {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .name {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--text);
    font-size: 14px;
    font-weight: 700;
  }

  /* A pile's count: a small pill, its digits lined up as they change. */
  .count {
    flex: none;
    padding: 0 7px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--panel);
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 18px;
  }

  /* The element's default action. */
  .default span {
    font-weight: 800;
    color: var(--text);
  }

  .opens {
    color: var(--muted);
    font-size: 11px;
  }

  /* Why there is nothing to choose: plain muted text, lined up with the header, the arrow cursor. */
  .note {
    max-width: 280px;
    margin: 0;
    padding: 4px 11px 6px;
    color: var(--muted);
    font-size: 13px;
    cursor: default;
  }

  /* A row whose submenu is open stays lit, as under the pointer. */
  button.open {
    background: var(--line-strong);
  }
</style>
