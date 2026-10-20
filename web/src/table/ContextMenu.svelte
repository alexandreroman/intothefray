<!--
  The context menu of a table card or pile (contextItems.ts): every action of
  the element, under its name. Opened by a right click, a Ctrl + click on
  macOS or a long touch, at the pointer, and flipped up or left to stay inside
  the visible table and the window. A submenu opens beside its row, on hover
  or on a click. Escape, a press outside the menu, a scroll or a zoom of the
  table, or a resize close it.
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
  import './menu.css';

  let {
    header,
    entries,
    at,
    bounds,
    zoom,
    onrun,
    onclose,
  }: {
    /** What the element is and whose, as the header shows it; the menu is named by its label. */
    header: ContextHeader;
    entries: ContextEntry[];
    /** The point of the screen it opens at. */
    at: { x: number; y: number };
    /** The visible table: the menu stays within it. */
    bounds: HTMLElement;
    /** A zoom of the table closes the menu: its element moves from under it. */
    zoom: number;
    /** Runs a chosen item, as a click on the bar would; the menu is closed first. */
    onrun: (item: ActionItem) => void;
    onclose: () => void;
  } = $props();

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

  onMount(() => {
    if (openedByPointer) {
      menu?.focus({ preventScroll: true });
    } else {
      itemsOf(menu)[0]?.focus({ preventScroll: true });
    }
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

  /** A scroll that moves the element (the table's, the page's) closes it; the menu's own does not. */
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
   * ↑ and ↓ step through the items, → opens the focused row's submenu, ← and
   * Escape close the submenu, then the menu. Taken: the table's keys do not see them.
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
      case 'Escape':
        if (openId !== null) {
          closeSubmenu();
        } else {
          onclose();
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

<svelte:window onscrollcapture={onScroll} onresize={onclose} />
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
  /* Over the table and the hand, as the bar's dropdowns; measured before it is placed: unseen until then. */
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

  /* The default action, which the element's first bar button runs. */
  .default span {
    font-weight: 800;
    color: var(--text);
  }

  .opens {
    color: var(--muted);
    font-size: 11px;
  }

  /* A row whose submenu is open stays lit, as under the pointer. */
  button.open {
    background: var(--line-strong);
  }
</style>
