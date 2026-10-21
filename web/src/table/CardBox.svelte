<!--
  The card box (spec 5.7): Search, Look at top, Browse and the stage choice
  share one fixed-size box, two rows of 5:7 tiles with the rest scrolling, a
  name filter and a footer (the prototype's renderDeckView and
  renderStageView). A click, a tap or a right click on a pile tile opens its
  context menu at the pointer, over the box; in Look at top, tiles are
  reordered by dragging, with a live preview. The stage choice
  and the out-of-play piles list their cards by card number, the other piles
  top first. The box follows the view: cards that leave the pile leave the box.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import Dialog from '../components/Dialog.svelte';
  import type { Action, CardView, PackFace, PileView, Size, View } from '../lib/types';
  import {
    canShuffleIn,
    compareCardNumbers,
    isDeck,
    pileLabel,
    stageFaceName,
    tileActions,
    type ShownBox,
    type TileAction,
  } from './boxes';
  import type { ActionItem } from './actions';
  import CardFace from './CardFace.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import { tileEntries, type ContextHeader } from './contextItems';
  import type { Point } from './drag';
  import { isLongTouchClick, isTouchContextMenu, LANDING_MS } from './interaction.svelte';
  import { isOutOfPlay } from './layout';
  import { ownerLook, ownSeats, seatPlayer } from './seats';

  let {
    box,
    view,
    facesOf,
    sizeOf,
    readOnly,
    selected,
    act,
    onclose,
  }: {
    box: ShownBox;
    view: View;
    /** Every face of a card, from the catalog; none while it loads. */
    facesOf: (card: CardView) => PackFace[];
    sizeOf: (card: CardView) => Size;
    /** A spectator's box: it shows the cards and offers nothing. */
    readOnly: boolean;
    /** The viewer's selected deck: a card of a pile that is not theirs is played to its row. */
    selected: number | null;
    act: (action: Action) => number | null;
    /** Closes the box; `shuffle` asks to shuffle the searched deck. */
    onclose: (shuffle: boolean) => void;
  } = $props();

  // The prototype's values: a press becomes a drag past this distance, and the
  // grid scrolls by this step when a dragged tile nears its edge.
  const DRAG_THRESHOLD = 5;
  const EDGE_SCROLL = 40;
  const SCROLL_STEP = 12;
  // Tiles are at least this wide, about the preview's card, which does not show while a box is
  // open: the cards are read in the box. A card is 1.4 times as high as wide. The stylesheet's
  // --min-tile says it (narrower on a phone), this when it is not read.
  const MIN_TILE = 220;
  const CARD_RATIO = 1.4;
  // Never wider than the window: the box keeps inside it, its grid scrolls.
  const BOX_WIDTH = 'min(1200px, 100%)';
  const SLIDE_MS = 180;

  interface Tile {
    /** The card id for a pile, "<card id>:<face>" for the stage choice. */
    key: string;
    card: CardView;
    face: number;
    name: string;
    images: string[];
    landscape: boolean;
    /** "#3" (place in the pile, for a pile listed top first) or "On the table". */
    badge?: string;
    /** The stage face on the table. */
    shown: boolean;
  }

  const cardsById = $derived(new Map((view.table?.cards ?? []).map((card) => [card.id, card])));

  // Cards put at the bottom of their deck from this box leave it, though they stay in the pile.
  let sentDown = $state<string[]>([]);

  const pileCards = $derived(
    box.kind === 'pile' ? box.cards.filter((id) => !sentDown.includes(id)) : [],
  );

  function tilesOf(shown: ShownBox): Tile[] {
    if (shown.kind === 'stage') {
      const stage = shown.stage;
      const cards = stage.cards.flatMap((id) => cardsById.get(id) ?? []);
      // Each card's faces follow it in their own order, A before B.
      return cards.sort(compareCardNumbers).flatMap((card) =>
        facesOf(card).map((face, index) => {
          const onTable = card.id === stage.current && card.face === index;
          return {
            key: `${card.id}:${index}`,
            card,
            face: index,
            name: stageFaceName(face, index),
            images: face.images,
            landscape: isLandscape(face),
            badge: onTable ? 'On the table' : undefined,
            shown: onTable,
          };
        }),
      );
    }
    // The order of an out-of-play pile tells nothing: its tiles go by card number, with no place.
    const byNumber = isOutOfPlay(shown.pile);
    const pileTiles = pileCards.flatMap((id, index) => {
      const card = cardsById.get(id);
      if (!card) {
        return [];
      }
      const face = facesOf(card)[card.face];
      return [
        {
          key: id,
          card,
          face: card.face,
          name: face?.name ?? '',
          images: face?.images ?? [],
          landscape: face ? isLandscape(face) : false,
          badge: byNumber ? undefined : `#${index + 1}`,
          shown: false,
        },
      ];
    });
    return byNumber ? pileTiles.sort((a, b) => compareCardNumbers(a.card, b.card)) : pileTiles;
  }

  function isLandscape(face: PackFace): boolean {
    return face.size === 'land' || face.size === 'dland';
  }

  const tiles = $derived(tilesOf(box));

  let query = $state('');
  const matching = $derived.by(() => {
    const wanted = query.trim().toLowerCase();
    return wanted === '' ? tiles : tiles.filter((t) => t.name.toLowerCase().includes(wanted));
  });

  // ---- The title ----

  // "Top N" keeps the number looked at, as cards leave.
  const lookedAt = untrack(() => (box.kind === 'pile' ? box.cards.length : 0));

  const title = $derived.by((): { main: string; aside?: string } => {
    if (box.kind === 'stage') {
      return { main: `${box.stage.label}:`, aside: 'choose the card to show' };
    }
    const label = boxPileLabel(box.pile);
    switch (box.mode) {
      case 'top':
        return { main: `Top ${lookedAt} of ${label}` };
      case 'search': {
        const n = pileCards.length;
        return { main: `Search ${label}`, aside: `(${n} ${n === 1 ? 'card' : 'cards'})` };
      }
      case 'browse':
        return { main: label };
    }
  });

  /**
   * The pile's name in the title. With several decks of their own, the viewer
   * reads which one: "Your Spider-Man deck" rather than "Your deck".
   */
  function boxPileLabel(pile: PileView): string {
    const label = pileLabel(pile, view);
    const seats = ownSeats(view);
    if (seats.length < 2 || !seats.includes(pile.owner)) {
      return label;
    }
    const area = `p${pile.owner}`;
    const hero = seatPlayer(view, pile.owner)?.decks.find((deck) => deck.area === area)?.heroName;
    return hero ? label.replace(/^Your /, `Your ${hero} `) : label;
  }

  const fullTitle = $derived(title.aside ? `${title.main} ${title.aside}` : title.main);

  // ---- Tile actions ----

  function actionsOf(tile: Tile): TileAction[] {
    if (readOnly || box.kind !== 'pile' || selected === null) {
      return [];
    }
    return tileActions(tile.card, box.pile, { view, selected, sizeOf });
  }

  function runAction(action: TileAction, tile: Tile): void {
    const sent = act(action.run());
    if (action.id === 'bottom' && sent !== null) {
      sentDown = [...sentDown, tile.card.id];
    }
  }

  function choose(tile: Tile): void {
    if (readOnly || tile.shown || box.kind !== 'stage') {
      return;
    }
    act({ kind: 'chooseStage', stage: box.stage.key, card: tile.card.id, face: tile.face });
    onclose(false);
  }

  // ---- Hover and the tile menu ----

  // The tile under the pointer, ringed as on the table.
  let hovered = $state<string | null>(null);

  function enterTile(tile: Tile, event: PointerEvent): void {
    if (!isRealHover(event) || drag?.lifted || (box.kind === 'stage' && tile.shown)) {
      return;
    }
    hovered = tile.key;
  }

  function leaveTile(tile: Tile): void {
    if (hovered === tile.key) {
      hovered = null;
    }
  }

  /** The tile whose context menu is open, and the point of the screen it opened at. */
  let tileMenu = $state.raw<{ key: string; at: Point } | null>(null);
  // The tile whose menu was open as the current press began: the press closes it (ContextMenu),
  // and the click it ends must not open it again.
  let menuAtPress: string | null = null;
  // The press that ended a reorder: its click is no click on a tile.
  let dragEnded = false;
  // The kind of pointer of the current press, and when it began: a long touch opens no menu.
  let pressType = 'mouse';
  let pressedAt = 0;

  // Found again in every redraw: the menu goes with its card, or with its last action.
  const menuTile = $derived.by(() => {
    const open = tileMenu;
    const tile = open ? tiles.find((t) => t.key === open.key) : undefined;
    return tile && actionsOf(tile).length > 0 ? tile : null;
  });

  $effect(() => {
    if (tileMenu && !menuTile) {
      tileMenu = null;
    }
  });

  /** Before the open menu sees the press, in the capture phase of the window. */
  function onWindowPointerDown(event: PointerEvent): void {
    menuAtPress = tileMenu?.key ?? null;
    dragEnded = false;
    pressType = event.pointerType || 'mouse';
    pressedAt = event.timeStamp;
  }

  /**
   * A click or a tap on a pile tile opens its menu at the pointer, unless it
   * ends a reorder or a long touch press (iOS fires that click), or its press
   * closed that tile's menu; a tile without actions (a spectator's) opens
   * nothing.
   */
  function clickTile(tile: Tile, event: MouseEvent): void {
    if (dragEnded || menuAtPress === tile.key || isLongTouchClick(event, pressType, pressedAt)) {
      return;
    }
    openTileMenu(tile, { x: event.clientX, y: event.clientY });
  }

  /**
   * A right click opens the menu too, and never the browser's own. On touch, a
   * tap opens it: the contextmenu event a long touch fires (Android) opens nothing.
   */
  function rightClickTile(tile: Tile, event: MouseEvent): void {
    event.preventDefault();
    if (isTouchContextMenu(event, pressType)) {
      return;
    }
    openTileMenu(tile, { x: event.clientX, y: event.clientY });
  }

  function openTileMenu(tile: Tile, at: Point): void {
    if (actionsOf(tile).length > 0) {
      tileMenu = { key: tile.key, at };
    }
  }

  /**
   * The header of a tile's menu, in the pile owner's colour: the pile as the
   * box title names it, and the tile's place when it shows, over the card's
   * name ("Your deck · #3" over "Backflip").
   */
  function tileHeader(tile: Tile, pile: PileView): ContextHeader {
    const label = boxPileLabel(pile);
    const eyebrow = tile.badge ? `${label} · ${tile.badge}` : label;
    return {
      eyebrow,
      name: tile.name,
      color: ownerLook(view, pile.owner).color,
      label: `${tile.name}, ${eyebrow}`,
    };
  }

  /** A chosen entry runs its tile's action, once the menu is closed. */
  function runTileItem(item: ActionItem, tile: Tile): void {
    tileMenu = null;
    const action = actionsOf(tile).find((candidate) => candidate.id === item.id);
    if (action) {
      runAction(action, tile);
    }
  }

  let grid = $state<HTMLElement>();

  function imageOf(key: string): HTMLElement | null {
    return grid?.querySelector<HTMLElement>(`.tile[data-id="${key}"] .img`) ?? null;
  }

  // ---- The fixed size ----

  /**
   * Two rows of 5:7 tiles, from the grid's width only (never from what it
   * shows), so that every box opens at the same size; the rest scrolls.
   */
  let gridHeight = $state<number | null>(null);

  function sizeGrid(element: HTMLElement): void {
    const style = getComputedStyle(element);
    const gap = parseFloat(style.columnGap) || 14;
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const inner = element.clientWidth - padX;
    // Not laid out (tests): the stylesheet's height stays.
    if (inner <= 0) {
      return;
    }
    const minTile = parseFloat(style.getPropertyValue('--min-tile')) || MIN_TILE;
    const columns = Math.max(1, Math.floor((inner + gap) / (minTile + gap)));
    const columnWidth = (inner - gap * (columns - 1)) / columns;
    gridHeight = Math.min(
      2 * columnWidth * CARD_RATIO + gap + padY,
      window.innerHeight * 0.88 - 160,
    );
  }

  // ---- Reordering the top cards ----

  const movable = $derived(
    !readOnly && box.kind === 'pile' && box.mode === 'top' && isDeck(box.pile),
  );

  interface TileDrag {
    key: string;
    start: { x: number; y: number };
    lifted: boolean;
    /** The tiles' keys in their new order, the dragged one in its slot. */
    order: string[];
    /** The key of the tile the dragged one goes before, null for the end. */
    before: string | null;
    ghost: { x: number; y: number; width: number; height: number; dx: number; dy: number };
    tile: Tile;
  }

  let drag = $state<TileDrag | null>(null);

  // The order sent to the server, shown until its new view arrives (for the cards it was sent from).
  let pending = $state.raw<{ order: string[]; from: readonly string[] } | null>(null);
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  const shownTiles = $derived.by((): Tile[] => {
    if (drag?.lifted) {
      const byKey = new Map(matching.map((t) => [t.key, t]));
      return drag.order.flatMap((key) => byKey.get(key) ?? []);
    }
    if (pending && box.kind === 'pile' && pending.from === box.cards) {
      const order = pending.order;
      return [...matching].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    }
    return matching;
  });

  // When other players' actions move the tiles, the browser reports the tile
  // that lands under a pointer at rest as entered, at the very spot the
  // pointer rests: that is not the viewer hovering it (spec 5.8), and its ring
  // would mark a card they did not point at.
  let pointer = { x: NaN, y: NaN };
  let drawnAt = { x: NaN, y: NaN };

  $effect.pre(() => {
    void shownTiles;
    drawnAt = { ...pointer };
  });

  function isRealHover(event: PointerEvent): boolean {
    return !(event.clientX === drawnAt.x && event.clientY === drawnAt.y);
  }

  function press(tile: Tile, event: PointerEvent): void {
    if (!movable || event.button !== 0) {
      return;
    }
    event.preventDefault();
    drag = {
      key: tile.key,
      start: { x: event.clientX, y: event.clientY },
      lifted: false,
      order: shownTiles.map((t) => t.key),
      before: null,
      ghost: { x: 0, y: 0, width: 0, height: 0, dx: 0, dy: 0 },
      tile,
    };
  }

  async function onPointerMove(event: PointerEvent): Promise<void> {
    pointer = { x: event.clientX, y: event.clientY };
    if (!drag) {
      return;
    }
    if (!drag.lifted) {
      const distance = Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y);
      if (distance < DRAG_THRESHOLD) {
        return;
      }
      const r = imageOf(drag.key)?.getBoundingClientRect();
      if (!r) {
        return;
      }
      drag.lifted = true;
      drag.before = drag.order[drag.order.indexOf(drag.key) + 1] ?? null;
      drag.ghost = {
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
        dx: drag.start.x - r.left,
        dy: drag.start.y - r.top,
      };
      hovered = null;
    }
    drag.ghost.x = event.clientX - drag.ghost.dx;
    drag.ghost.y = event.clientY - drag.ghost.dy;

    const before = slotBefore(drag.key, event.clientX, event.clientY);
    if (before !== undefined && before !== drag.before) {
      drag.before = before;
      await moveSlot(drag, before);
    }
    scrollNearEdges(event.clientY);
  }

  /**
   * The tile the dragged one would go before (null: after the last), from the
   * nearest tile on the pointer's row, or the nearest of all when no row is
   * under it; undefined when there is no other tile.
   */
  function slotBefore(key: string, x: number, y: number): string | null | undefined {
    const others = drag?.order.filter((k) => k !== key) ?? [];
    const placed = others.flatMap((k) => {
      const r = imageOf(k)?.getBoundingClientRect();
      return r ? [{ key: k, r }] : [];
    });
    const row = placed.filter((o) => y >= o.r.top - 10 && y <= o.r.bottom + 60);
    const pool = row.length > 0 ? row : placed;
    let best: { key: string; r: DOMRect; d: number } | null = null;
    for (const o of pool) {
      const centreX = o.r.left + o.r.width / 2;
      const centreY = o.r.top + o.r.height / 2;
      const d = Math.abs(x - centreX) + (row.length > 0 ? 0 : Math.abs(y - centreY));
      if (best === null || d < best.d) {
        best = { ...o, d };
      }
    }
    if (best === null) {
      return undefined;
    }
    const after = x > best.r.left + best.r.width / 2;
    if (!after) {
      return best.key;
    }
    return others[others.indexOf(best.key) + 1] ?? null;
  }

  /** Puts the dragged tile's slot before that tile, the others sliding aside (FLIP). */
  async function moveSlot(current: TileDrag, before: string | null): Promise<void> {
    const elements = [...(grid?.querySelectorAll<HTMLElement>('.tile') ?? [])];
    const first = new Map(elements.map((element) => [element, element.getBoundingClientRect()]));

    const order = current.order.filter((k) => k !== current.key);
    const at = before === null ? order.length : order.indexOf(before);
    order.splice(at, 0, current.key);
    current.order = order;
    await tick();

    for (const element of elements) {
      const a = first.get(element);
      if (!a || element.dataset.id === current.key || !element.isConnected) {
        continue;
      }
      const b = element.getBoundingClientRect();
      if (a.left !== b.left || a.top !== b.top) {
        // jsdom has no Web Animations.
        element.animate?.(
          [
            { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` },
            { transform: 'none' },
          ],
          { duration: SLIDE_MS, easing: 'ease-out' },
        );
      }
    }
  }

  function scrollNearEdges(y: number): void {
    if (!grid) {
      return;
    }
    const r = grid.getBoundingClientRect();
    if (y > r.bottom - EDGE_SCROLL) {
      grid.scrollTop += SCROLL_STEP;
    } else if (y < r.top + EDGE_SCROLL) {
      grid.scrollTop -= SCROLL_STEP;
    }
  }

  function onPointerUp(): void {
    const done = drag;
    drag = null;
    if (!done?.lifted) {
      return;
    }
    // The click this release fires, on the tile let go over, is the end of the reorder.
    dragEnded = true;
    if (box.kind !== 'pile') {
      return;
    }
    // What the box shows is the new order of those cards; the others keep their
    // places. A card that left the pile during the drag is no longer in it.
    const all = pileCards;
    const shown = done.order.filter((id) => all.includes(id));
    const before = all.filter((id) => shown.includes(id));
    if (before.join() === shown.join()) {
      return;
    }
    let next = 0;
    const order = all.map((id) => (shown.includes(id) ? (shown[next++] ?? id) : id));
    pending = { order, from: box.cards };
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => (pending = null), LANDING_MS);
    act({ kind: 'reorderTop', pile: box.pile.id, cards: order });
  }

  // ---- Footer ----

  const shuffleChoice = $derived(
    !readOnly && box.kind === 'pile' && box.mode === 'search' && isDeck(box.pile),
  );

  // A set-aside pile is reached from its box only: it is not drawn on the table.
  const shuffleInPile = $derived(
    !readOnly && box.kind === 'pile' && canShuffleIn(box.pile, ownSeats(view)) ? box.pile : null,
  );

  function shuffleIn(pile: PileView): void {
    if (act({ kind: 'shuffleIn', pile: pile.id }) !== null) {
      onclose(false);
    }
  }

  $effect(() => () => clearTimeout(pendingTimer));
</script>

<svelte:window
  onpointerdowncapture={onWindowPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={() => (drag = null)}
/>

<!-- Five columns of tiles about 220 px wide on a large screen, fewer on a smaller one. -->
<Dialog title={fullTitle} wide width={BOX_WIDTH} oncancel={() => onclose(false)}>
  {#snippet heading(id: string)}
    <div class="mhead">
      <b {id}
        >{title.main}
        {#if title.aside}<span class="aside">{title.aside}</span>{/if}</b
      >
      <input
        class="filter"
        type="text"
        placeholder="Filter by name…"
        aria-label="Filter by name"
        bind:value={query}
      />
    </div>
  {/snippet}

  <ul
    class="mgrid"
    aria-label="Cards"
    bind:this={grid}
    class:dragging={drag?.lifted}
    style:height={gridHeight === null ? undefined : `${gridHeight}px`}
    {@attach sizeGrid}
    onscroll={() => (hovered = null)}
  >
    {#each shownTiles as tile (tile.key)}
      <li
        class="tile"
        class:pick={box.kind === 'stage'}
        class:shown={tile.shown}
        class:hovered={hovered === tile.key || tileMenu?.key === tile.key}
        class:lifting={drag?.lifted && drag.key === tile.key}
        data-id={tile.key}
        data-tip={box.kind === 'stage' ? tile.name : undefined}
        aria-label={tile.name}
        onpointerenter={(event) => enterTile(tile, event)}
        onpointerleave={() => leaveTile(tile)}
      >
        {#if box.kind === 'stage'}
          <button
            type="button"
            class="img"
            aria-label={tile.name}
            disabled={readOnly || tile.shown}
            onclick={() => choose(tile)}
          >
            {@render art(tile)}
          </button>
        {:else}
          <!-- A pointer target: the tile's name is its list item's. -->
          <div
            class="img"
            class:movable
            class:menu={actionsOf(tile).length > 0}
            role="presentation"
            onpointerdown={(event) => press(tile, event)}
            onclick={(event) => clickTile(tile, event)}
            oncontextmenu={(event) => rightClickTile(tile, event)}
          >
            {@render art(tile)}
          </div>
        {/if}
      </li>
    {:else}
      <li class="mempty" role="status">
        {#if tiles.length > 0}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M20 20l-4.6-4.6" />
            <path d="M8 8.5l5 4M13 8.5l-5 4" />
          </svg>
          No card matches.
        {:else}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="4" width="14" height="17" rx="2" stroke-dasharray="3 2.4" />
          </svg>
          Nothing left here.
        {/if}
      </li>
    {/each}
  </ul>

  <div class="mfoot">
    {#if shuffleChoice}
      <button type="button" onclick={() => onclose(false)}>Close without shuffling</button>
      <button type="button" class="btn-primary compact" onclick={() => onclose(true)}
        >Shuffle & close</button
      >
    {:else}
      {#if shuffleInPile}
        {@const pile = shuffleInPile}
        <button type="button" onclick={() => shuffleIn(pile)}>
          Shuffle into the encounter deck
        </button>
      {/if}
      <!-- A stage box has no other action: Close is its main one. -->
      <button
        type="button"
        class={box.kind === 'stage' ? 'btn-primary compact' : undefined}
        onclick={() => onclose(false)}>Close</button
      >
    {/if}
  </div>

  <!-- Inside the dialog, so that it shows over it; created afresh for each opening, as on the table. -->
  {#if tileMenu && menuTile && box.kind === 'pile' && grid}
    {@const tile = menuTile}
    {#key tileMenu}
      <ContextMenu
        header={tileHeader(tile, box.pile)}
        entries={tileEntries(actionsOf(tile))}
        at={tileMenu.at}
        bounds={grid}
        onrun={(item) => runTileItem(item, tile)}
        onclose={() => (tileMenu = null)}
      />
    {/key}
  {/if}

  {#if drag?.lifted}
    <div
      class="tile-ghost"
      style:left="{drag.ghost.x}px"
      style:top="{drag.ghost.y}px"
      style:width="{drag.ghost.width}px"
      style:height="{drag.ghost.height}px"
    >
      {@render art(drag.tile, false)}
    </div>
  {/if}
</Dialog>

{#snippet art(tile: Tile, withBadge = true)}
  <span class="face" class:land={tile.landscape}>
    <CardFace images={tile.images} name={tile.name} landscape={tile.landscape} />
  </span>
  {#if withBadge && tile.badge}
    <span class="pos">{tile.badge}</span>
  {/if}
{/snippet}

<style>
  .mhead {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
  }

  .mhead b {
    font-stretch: 85%;
    font-weight: 800;
    font-size: 18px;
  }

  .mhead .aside {
    color: var(--faint);
    font-weight: 600;
  }

  /* More specific than the app's input[type='text'], which spans the whole width. */
  .mhead .filter {
    margin-left: auto;
    width: 220px;
    padding: 7px 12px;
    background: var(--bg);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    color: var(--text);
    font: inherit;
  }

  .mgrid {
    /* A tile's least width (MIN_TILE). */
    --min-tile: 220px;
    position: relative;
    display: grid;
    /* As wide as --min-tile at least; the columns fill the row. */
    grid-template-columns: repeat(auto-fill, minmax(var(--min-tile), 1fr));
    align-content: start;
    gap: 14px;
    margin: 0;
    padding: 14px 16px;
    overflow-y: auto;
    list-style: none;
  }

  /* On a phone, two columns of tiles rather than one card per row. */
  @media (max-width: 600px) {
    .mgrid {
      --min-tile: 130px;
    }
  }

  /* An empty box shows its message in the middle. */
  .mgrid:has(> .mempty) {
    align-content: center;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .img {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 5 / 7;
    padding: 0;
    overflow: hidden;
    background: var(--bg);
    border: none;
    border-radius: 9px;
    color: inherit;
    font: inherit;
  }

  /* A tile with a menu to open; one to reorder grabs, which comes after. */
  .img.menu {
    cursor: pointer;
  }

  .img.movable {
    cursor: grab;
    touch-action: none;
  }

  .tile.pick:not(.shown) .img {
    cursor: pointer;
  }

  .tile.pick .img:disabled {
    cursor: default;
    opacity: 1;
  }

  /* While a tile is moved, the pointer holds it, over any tile. After the rules above. */
  .mgrid.dragging,
  .mgrid.dragging :global(*) {
    cursor: grabbing;
  }

  /* The card itself, contained in the 5:7 tile: a landscape card lies across it. */
  .face {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 5 / 7;
  }

  .face.land {
    aspect-ratio: 7 / 5;
  }

  /* The rings: the stage face on the table, and the hovered tile, as on the table. */
  .img::before {
    content: '';
    position: absolute;
    inset: 1.2%;
    border-radius: 7px;
    pointer-events: none;
    z-index: 2;
    transition: box-shadow 0.12s;
  }

  .tile.pick.shown .img::before {
    box-shadow: 0 0 0 2px var(--sel);
  }

  .tile.hovered .img::before {
    box-shadow:
      0 0 0 2px #ffffffb0,
      0 0 22px 6px #ffffff38;
  }

  .tile.lifting .img {
    outline: 2px dashed #49c6ff88;
    outline-offset: -2px;
    background: #49c6ff14;
  }

  .tile.lifting .img > :global(*) {
    visibility: hidden;
  }

  .pos {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 3;
    padding: 1px 7px;
    background: #07090fcc;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }

  .mempty {
    grid-column: 1 / -1;
    align-self: center;
    justify-self: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: 14px;
    text-align: center;
  }

  .mempty svg {
    width: 40px;
    height: 40px;
    color: var(--line-strong);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mfoot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 16px;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
  }

  /* The secondary buttons stand as tall as the main one (.btn-primary.compact). */
  .mfoot button:not(.btn-primary) {
    height: 40px;
    padding: 0 20px;
  }

  /* The dragged card, the tile's size, its card contained as in the tile. */
  .tile-ghost {
    position: fixed;
    z-index: 6;
    display: grid;
    place-items: center;
    pointer-events: none;
    transform: rotate(-3deg) scale(1.04);
    filter: drop-shadow(6px 8px 12px #000c);
  }
</style>
