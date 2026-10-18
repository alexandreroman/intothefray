<!--
  The table page: the top bar, the table column (a vertical stack of zones,
  each scrolling horizontally on its own) and the side column (preview and
  history).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { modal } from '../components/modal.svelte';
  import Tooltip from '../components/Tooltip.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { knownCard, loadAllCards } from '../lib/catalog';
  import { getPref, setPref } from '../lib/prefs';
  import type { GameSession } from '../lib/session.svelte';
  import type { Area, CardView as TableCard, PackFace, PileView, Size, View } from '../lib/types';
  import ActionBar from './ActionBar.svelte';
  import {
    actionsFor,
    counterName,
    type ActionItem,
    type CountQuestion,
    type LocalAction,
    type TableElement,
  } from './actions';
  import AskCount from './AskCount.svelte';
  import { isHidden, pileBack } from './face';
  import Hand from './Hand.svelte';
  import { interaction } from './interaction.svelte';
  import { zoneMinHeight, zoneOrder } from './layout';
  import TokenPill from './TokenPill.svelte';
  import SidePanel, { type Preview } from './SidePanel.svelte';
  import Zone, { type Heading, type ResizeAbove } from './Zone.svelte';
  import ZoomControl from './ZoomControl.svelte';
  import { clampZoom, saveZoom, storedZoom, ZOOM_MAX, ZOOM_MIN } from './zoom';

  let { session, view }: { session: Pick<GameSession, 'act' | 'lobby'>; view: View } = $props();

  // P5a-R2: the catalog is loaded once, then card sizes are looked up synchronously.
  let catalog = $state<'loading' | 'ready' | 'failed'>('loading');
  loadAllCards().then(
    () => (catalog = 'ready'),
    () => (catalog = 'failed'),
  );

  function faceOf(card: TableCard | undefined): PackFace | null {
    if (catalog !== 'ready' || !card?.code || isHidden(card)) {
      return null;
    }
    return knownCard(card.code)?.card.faces[card.face] ?? null;
  }

  function sizeOf(card: TableCard): Size {
    return faceOf(card)?.size ?? 'std';
  }

  const cards = $derived(view.table?.cards ?? []);
  const piles = $derived(view.table?.piles ?? []);
  const cardsById = $derived(new Map(cards.map((card) => [card.id, card])));
  const ownArea = $derived(view.you.role === 'player' ? view.you.area : undefined);

  // Spectators have no hand.
  const handCards = $derived(
    ownArea
      ? (view.table?.hand ?? []).flatMap((id) => {
          const card = cardsById.get(id);
          return card ? [card] : [];
        })
      : undefined,
  );

  function topOf(pile: PileView): TableCard | undefined {
    const topId = pile.cards?.at(-1);
    return topId === undefined ? undefined : cardsById.get(topId);
  }

  function villainHeading(): Heading {
    const stage = view.table?.stages.find((s) => s.key === 'villain');
    const face = faceOf(stage ? cardsById.get(stage.current) : undefined);
    return {
      name: 'Villain',
      detail: face?.name,
      aside: face?.stage ? `stage ${face.stage}` : undefined,
    };
  }

  function playerHeading(area: Area): Heading {
    const player = view.players.find((p) => p.area === area);
    if (!player) {
      return { name: area };
    }
    const cardsInHand = `${player.handCount} ${player.handCount === 1 ? 'card' : 'cards'} in hand`;
    return {
      name: player.name,
      detail: player.heroName,
      aside: cardsInHand,
      color: area === ownArea ? `var(--p${player.color + 1})` : undefined,
    };
  }

  // Heights chosen with the separators, kept for the session only. Only the
  // villain's zone and the viewer's own can be resized; the other players'
  // zones follow their cards.
  let chosenHeights = $state<Partial<Record<Area, number>>>({});

  const resizable = (area: Area) => area === 'villain' || area === ownArea;

  const zones = $derived(
    zoneOrder(view).map((area) => {
      const inArea = cards.filter((card) => card.zone === 'table' && card.area === area);
      const pilesInArea = piles.filter((pile) => pile.area === area);
      const min = zoneMinHeight(cards, piles, area, sizeOf);
      return {
        area,
        heading: area === 'villain' ? villainHeading() : playerHeading(area),
        cards: inArea,
        piles: pilesInArea,
        min,
        height: Math.max(min, chosenHeights[area] ?? 0),
      };
    }),
  );

  type ZoneData = (typeof zones)[number];

  // A resizable zone only grows on its own: once its cards made it taller, it
  // stays that tall when they move back up, until it is resized by hand.
  // Not while the catalog loads: every card counts as std until then, which
  // can be taller than its real size.
  $effect.pre(() => {
    if (catalog === 'loading') {
      return;
    }
    for (const zone of zones) {
      if (resizable(zone.area) && zone.height > (chosenHeights[zone.area] ?? 0)) {
        chosenHeights[zone.area] = zone.height;
      }
    }
  });

  function resizeAbove(above: ZoneData | undefined): ResizeAbove | undefined {
    if (!above || !resizable(above.area)) {
      return undefined;
    }
    return {
      title: `Drag to resize ${above.area === 'villain' ? "the villain's" : 'your'} zone`,
      height: above.height,
      min: above.min,
      onresize: (height) => (chosenHeights[above.area] = height),
    };
  }

  const firstPlayer = $derived(view.table?.firstPlayer);

  function previewOf(previewed: TableElement | null): Preview | null {
    if (previewed?.kind === 'pile') {
      const pile = piles.find((p) => p.id === previewed.id);
      if (!pile || pile.count === 0) {
        return null;
      }
      const top = topOf(pile);
      return top ? previewOfCard(top) : { kind: 'back', back: pileBack(pile.kind) };
    }
    const card = previewed ? cardsById.get(previewed.id) : undefined;
    return card ? previewOfCard(card) : null;
  }

  function previewOfCard(card: TableCard): Preview {
    if (isHidden(card)) {
      return { kind: 'back', back: card.back };
    }
    const face = faceOf(card);
    return {
      kind: 'face',
      images: face?.images ?? [],
      name: face?.name ?? '',
      landscape: face?.size === 'land' || face?.size === 'dland',
    };
  }

  // From ids, so the preview follows a flip or a pile's new top card.
  const preview = $derived(previewOf(interaction.previewed));

  // The interaction state is shared: a previous game's must not show in the next one.
  $effect(() => () => interaction.reset());

  // ---- The action bar ----

  /** Another player's pile: hovering it clears the preview rather than keeping it. */
  function isForeign(pile: PileView): boolean {
    return pile.owner >= 0 && `p${pile.owner}` !== ownArea;
  }

  /** Whether the element is still where it was hovered: on the table, or in the hand. */
  function isPresent(element: TableElement): boolean {
    switch (element.kind) {
      case 'card':
        return cardsById.get(element.id)?.zone === 'table';
      case 'hand':
        return (view.table?.hand ?? []).includes(element.id);
      case 'pile':
        return piles.some((pile) => pile.id === element.id);
    }
  }

  // A new view: the elements under a pointer at rest are not hovered by the viewer.
  $effect.pre(() => {
    void view;
    interaction.redrawn();
  });

  // An element that left the table takes its bar (and its arrow mode) with it.
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

  const barItems = $derived.by((): ActionItem[] | { text: string } => {
    // actionsFor reads the catalog's plain Map (are there several faces to
    // flip?): reading the catalog state here recomputes the bar once it loads.
    void catalog;
    const hovered = interaction.hovered;
    const role = view.you.role;
    if (!hovered || role === undefined || !ownArea) {
      return [];
    }
    return actionsFor(hovered, view, { area: ownArea, role });
  });

  const ARROW_HINT = 'Click the card to point at — Esc or a click on an empty spot to cancel.';

  // Never for a hand card: its cards are dragged, or played with their keys.
  const barShown = $derived.by(() => {
    const hovered = interaction.hovered;
    if (!hovered || hovered.kind === 'hand') {
      return false;
    }
    if (interaction.arrowFrom !== null) {
      return true;
    }
    return !Array.isArray(barItems) || barItems.length > 0;
  });

  function anchorOf(): HTMLElement | null {
    const hovered = interaction.hovered;
    if (!hovered || !wrap) {
      return null;
    }
    const selector = hovered.kind === 'pile' ? '.pile' : '.card:not(.pile)';
    return wrap.querySelector<HTMLElement>(`.surface ${selector}[data-id="${hovered.id}"]`);
  }

  // ---- The token pill ----

  // Found again by names at every view, so the pill follows its token through
  // redraws; it goes with the token (zero) or the card (off the table).
  const counterShown = $derived.by(() => {
    const target = interaction.counter;
    if (!target || view.you.role !== 'player') {
      return null;
    }
    const card = cardsById.get(target.card);
    if (card?.zone !== 'table') {
      return null;
    }
    const counts = target.kind === 'token' ? card.tokens : card.status;
    const value = counts?.[target.name] ?? 0;
    return value > 0 ? { target, value } : null;
  });

  // A pill that went away must not come back when the token does.
  $effect(() => {
    if (interaction.counter && !counterShown) {
      interaction.hideCounter();
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
      session.act({ kind: target.kind, card: target.card, name: target.name, delta });
    }
  }

  /** The "How many cards?" question being asked, if any. */
  let asking = $state<CountQuestion | null>(null);

  function runItem(item: ActionItem): void {
    const element = interaction.hovered;
    if (!item.run || item.disabled || !element) {
      return;
    }
    const result = item.run();
    if ('ask' in result) {
      asking = result.ask;
    } else if ('local' in result) {
      runLocal(result.local, element);
    } else {
      session.act(result);
    }
  }

  function runLocal(local: LocalAction, element: TableElement): void {
    if (local === 'arrow') {
      interaction.startArrow(element.id);
      return;
    }
    // The boxes (stage choice, browsing a pile) come with plan 5c.
    console.info(`"${local}" is not available yet`);
  }

  function answer(n: number): void {
    const question = asking;
    asking = null;
    if (question) {
      session.act(question.make(n));
    }
  }

  /** An empty spot: the table itself, a zone's surface or scroller, or its header. */
  function isEmptySpot(target: HTMLElement): boolean {
    return (
      target === wrap ||
      target.classList.contains('table') ||
      target.classList.contains('surface') ||
      target.classList.contains('zscroll') ||
      target.closest('.zh') !== null
    );
  }

  // In the capture phase: in arrow mode, the click picks the target, and must not reach the card.
  function onTablePointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    const from = interaction.arrowFrom;
    if (from !== null) {
      event.preventDefault();
      event.stopPropagation();
      const to = target.closest<HTMLElement>('.surface .card:not(.pile)')?.dataset.id;
      // The server draws arrows between two table cards only.
      if (to && to !== from) {
        session.act({ kind: 'arrowAdd', card: from, target: to });
      }
      interaction.endArrow();
      return;
    }
    if (isEmptySpot(target)) {
      interaction.release();
    }
  }

  // Task 4 brings the other keys; Escape is needed now to leave the arrow mode.
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented || modal.open) {
      return;
    }
    interaction.escape();
  }

  // Restored as the page is built, before any style applies, so the slide
  // does not play at load; it plays on every toggle after that.
  let sideHidden = $state(getPref('itf-side-hidden') === '1');

  // The breakpoint of the @media rules below. On a narrow screen the side
  // panel is a drawer over the table, closed until asked for, and the stored
  // column preference does not apply to it.
  const narrow = new MediaQuery('max-width: 900px');
  let drawerOpen = $state(false);

  const drawerShown = $derived(narrow.current && drawerOpen);
  const sideShown = $derived(narrow.current ? drawerShown : !sideHidden);

  function toggleSide(): void {
    if (narrow.current) {
      drawerOpen = !drawerOpen;
      return;
    }
    sideHidden = !sideHidden;
    setPref('itf-side-hidden', sideHidden ? '1' : '');
  }

  let zoom = $state(storedZoom());
  let wrap = $state<HTMLElement>();

  /**
   * Zooms around a point of the screen, keeping the table point under it in
   * place. Without a point, zooms from the left edge, so the decks and
   * identities stay in view.
   */
  async function setZoom(wanted: number, pointX?: number, pointY?: number): Promise<void> {
    const next = clampZoom(wanted);
    if (next === zoom || !wrap) {
      return;
    }
    const box = wrap.getBoundingClientRect();
    const x = pointX ?? box.left;
    const y = pointY ?? box.top + box.height / 2;
    const scale = next / zoom;

    // What lies under the point now: per zone horizontally, and in the whole table vertically.
    const scrollers = [...wrap.querySelectorAll<HTMLElement>('.zscroll')].map((scroller) => ({
      scroller,
      under: scroller.scrollLeft + x - scroller.getBoundingClientRect().left,
    }));
    const underY = wrap.scrollTop + y - box.top;

    zoom = next;
    saveZoom(next);
    await tick();

    for (const { scroller, under } of scrollers) {
      scroller.scrollLeft = Math.max(
        0,
        under * scale - (x - scroller.getBoundingClientRect().left),
      );
    }
    wrap.scrollTop = underY * scale - (y - box.top);
  }

  // The wheel can zoom finer than the 10 % steps: it keeps its own target so
  // small trackpad moves add up instead of rounding away.
  let wheelTarget: number | null = null;

  function zoomWithButtons(wanted: number): void {
    wheelTarget = null;
    void setZoom(wanted);
  }

  function onWheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    const from = wheelTarget ?? zoom;
    wheelTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, from * Math.exp(-event.deltaY * 0.01)));
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

<svelte:window
  onpointermove={(event) => interaction.pointerMoved(event)}
  onpointerdowncapture={(event) => interaction.pointerPressed(event)}
  onkeydown={onKeydown}
/>

<!-- The zoom is set on the whole page, so a layer outside the table (a drag ghost) can follow it. -->
<div
  class="app"
  class:side-hidden={sideHidden}
  class:arrowing={interaction.arrowFrom !== null}
  style:--z={zoom}
>
  <div class="top">
    <TopBar
      spectators={view.spectators}
      side={{ hidden: !sideShown, ontoggle: toggleSide }}
      onend={view.you.host ? () => session.lobby('end') : undefined}
    />
  </div>

  <div
    class="tablewrap"
    role="presentation"
    bind:this={wrap}
    onpointerdowncapture={onTablePointerDown}
  >
    <div class="table">
      {#each zones as zone, i (zone.area)}
        <Zone
          area={zone.area}
          heading={zone.heading}
          cards={zone.cards}
          piles={zone.piles}
          {topOf}
          {faceOf}
          {sizeOf}
          foreign={isForeign}
          height={zone.height}
          {zoom}
          first={i === 0}
          firstPlayer={firstPlayer?.area === zone.area ? firstPlayer : undefined}
          above={resizeAbove(zones[i - 1])}
        />
      {/each}
    </div>
  </div>

  {#if catalog === 'failed'}
    <p class="notice" role="alert">Card data could not be loaded: cards show as placeholders.</p>
  {/if}

  <ZoomControl {zoom} onzoom={zoomWithButtons} />

  {#if handCards}
    <Hand cards={handCards} {faceOf} narrow={narrow.current} />
  {/if}

  {#if barShown && wrap}
    <ActionBar
      anchor={anchorOf}
      items={barItems}
      hint={interaction.arrowFrom !== null ? ARROW_HINT : undefined}
      bounds={wrap}
      {zoom}
      onrun={runItem}
    />
  {/if}

  {#if counterShown}
    <TokenPill
      anchor={counterAnchor}
      label={counterName(counterShown.target.kind, counterShown.target.name)}
      value={counterShown.value}
      {zoom}
      version={view}
      onstep={stepCounter}
    />
  {/if}

  {#if asking}
    <AskCount
      title={asking.title}
      question={asking.question}
      max={asking.max}
      ok={asking.ok}
      onconfirm={answer}
      oncancel={() => (asking = null)}
    />
  {/if}

  <Tooltip />

  <aside
    class="side"
    class:open={drawerShown}
    aria-label="Preview and history"
    inert={narrow.current && !drawerShown}
  >
    <SidePanel
      {preview}
      log={view.log}
      canUndo={view.canUndo}
      undoText={view.undoText}
      onundo={() => session.act({ kind: 'undo' })}
      onclose={narrow.current ? () => (drawerOpen = false) : undefined}
    />
  </aside>
</div>

<style>
  .app {
    display: grid;
    height: 100vh;
    height: 100dvh;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr) 300px;
    grid-template-areas:
      'top top'
      'table side';
  }

  .top {
    grid-area: top;
  }

  .tablewrap {
    grid-area: table;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    z-index: 0;
    isolation: isolate;
    background: var(--table-bg);
    min-width: 0;
  }

  /* Room at the bottom to scroll the last zone above the floating hand. */
  .table {
    padding: 0 20px 250px;
    position: relative;
  }

  /*
    The white ring of the cards of the hovered history line, for cards and piles alike. It is
    drawn around the cut card: the cut would clip it on the image.
  */
  .table :global(.card.highlighted)::before {
    content: '';
    position: absolute;
    inset: 1%;
    border-radius: 7px;
    pointer-events: none;
    z-index: 1;
    box-shadow:
      0 0 0 2px #ffffffb0,
      0 0 22px 6px #ffffff38;
  }

  /* Picking the card an arrow points at. */
  .app.arrowing :global(.surface .card) {
    cursor: crosshair;
  }

  .side {
    grid-area: side;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-left: 1px solid var(--line);
    min-height: 0;
  }

  .notice {
    grid-area: table;
    align-self: start;
    justify-self: center;
    z-index: 40;
    margin: 8px 0 0;
    padding: 4px 14px;
    background: var(--panel-2);
    border: 1px solid var(--accent);
    border-radius: 999px;
    font-size: 13px;
  }

  /* The column slides shut: the panel keeps its width and is pushed out on the right. */
  @media (min-width: 901px) {
    .app {
      transition: grid-template-columns 0.28s ease;
    }

    .app.side-hidden {
      grid-template-columns: minmax(0, 1fr) 0px;
    }

    .side {
      overflow: hidden;
      transition:
        border-color 0.28s,
        visibility 0s;
    }

    .side > :global(*) {
      min-width: 299px;
    }

    .app.side-hidden .side {
      border-left-color: transparent;
      visibility: hidden;
      transition:
        border-color 0.28s,
        visibility 0s 0.28s;
    }
  }

  @media (max-width: 900px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'top'
        'table';
    }

    /* The drawer slides in from the right, over the table. */
    .side {
      position: fixed;
      right: 0;
      top: 0;
      bottom: 0;
      width: min(320px, 88vw);
      z-index: 50;
      transform: translateX(100%);
      transition: transform 0.2s;
      box-shadow: -8px 0 24px #000a;
    }

    .side.open {
      transform: none;
    }
  }
</style>
