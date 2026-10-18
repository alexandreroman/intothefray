<!--
  The table page: the top bar, the table column (a vertical stack of zones,
  each scrolling horizontally on its own) and the side column (preview and
  history).
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import Tooltip from '../components/Tooltip.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { knownCard, loadAllCards } from '../lib/catalog';
  import { getPref, setPref } from '../lib/prefs';
  import type { GameSession } from '../lib/session.svelte';
  import type {
    Action,
    Area,
    CardView as TableCard,
    PackFace,
    PileView,
    Size,
    View,
  } from '../lib/types';
  import ActionBar from './ActionBar.svelte';
  import {
    actionsFor,
    counterName,
    seatOf,
    type ActionItem,
    type CountQuestion,
    type LocalAction,
    type TableElement,
  } from './actions';
  import Arrows from './Arrows.svelte';
  import AskCount from './AskCount.svelte';
  import type { LocalBox, ShownBox } from './boxes';
  import CardBox from './CardBox.svelte';
  import DragLayer from './DragLayer.svelte';
  import { isHidden, pileBack } from './face';
  import Hand from './Hand.svelte';
  import { interaction } from './interaction.svelte';
  import { handleKey } from './keys';
  import { zoneMinHeight, zoneOrder } from './layout';
  import TokenPill from './TokenPill.svelte';
  import SidePanel, { type Preview } from './SidePanel.svelte';
  import Zone, { type Heading, type ResizeAbove } from './Zone.svelte';
  import ZoomControl from './ZoomControl.svelte';
  import { clampZoom, saveZoom, storedZoom, ZOOM_MAX, ZOOM_MIN } from './zoom';

  let { session, view }: { session: Pick<GameSession, 'act' | 'lobby' | 'lastError'>; view: View } =
    $props();

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

  /** Every face of a card, as the stage choice lists them; none while the catalog loads. */
  function facesOf(card: TableCard): PackFace[] {
    if (catalog !== 'ready' || !card.code) {
      return [];
    }
    return knownCard(card.code)?.card.faces ?? [];
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
    // While a card taken from a pile is dragged or waits for the server, the pile shows its top card without it.
    const taken = interaction.takenFrom(pile.id);
    const topId = (pile.cards ?? []).filter((id) => !taken.includes(id)).at(-1);
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
    if (!hovered || role === undefined) {
      return [];
    }
    return actionsFor(hovered, view, { area: ownArea, role });
  });

  const ARROW_HINT = 'Click the card to point at — Esc or a click on an empty spot to cancel.';

  // Never for a hand card: its cards are dragged, or played with their keys.
  // In arrow mode, the hint stays until the arrow is drawn or cancelled,
  // whatever the pointer hovers meanwhile.
  const barShown = $derived.by(() => {
    if (interaction.dragging) {
      return false;
    }
    if (interaction.arrowFrom !== null) {
      return true;
    }
    const hovered = interaction.hovered;
    if (!hovered || hovered.kind === 'hand') {
      return false;
    }
    return !Array.isArray(barItems) || barItems.length > 0;
  });

  /** What the bar sits on: the card an arrow starts from, or else the hovered element. */
  function anchorOf(): HTMLElement | null {
    const from = interaction.arrowFrom;
    const element: TableElement | null =
      from !== null ? { kind: 'card', id: from } : interaction.hovered;
    if (!element || !wrap) {
      return null;
    }
    const selector = element.kind === 'pile' ? '.pile' : '.card:not(.pile)';
    return wrap.querySelector<HTMLElement>(`.surface ${selector}[data-id="${element.id}"]`);
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

  // The pile can shrink while the question is open (another player deals from
  // it): the answer never asks for more cards than it holds.
  const askedPile = $derived(asking ? piles.find((pile) => pile.id === asking?.pile) : undefined);
  const askedMax = $derived(asking && askedPile ? Math.min(asking.max, askedPile.count) : 0);

  // Nothing is left to ask about once the pile is empty or gone.
  $effect(() => {
    if (asking && askedMax === 0) {
      asking = null;
    }
  });

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
      send(result);
    }
  }

  function runLocal(local: LocalAction, element: TableElement): void {
    switch (local) {
      case 'arrow':
        interaction.startArrow(element.id);
        return;
      case 'browseBox':
        localBox = { kind: 'browse', pile: element.id };
        return;
      case 'stageBox': {
        const stage = view.table?.stages.find((s) => s.current === element.id);
        if (stage) {
          localBox = { kind: 'stage', stage: stage.key };
        }
        return;
      }
    }
  }

  function answer(n: number): void {
    const question = asking;
    asking = null;
    if (question) {
      send(question.make(n));
    }
  }

  function send(action: Action): void {
    // A new Look or Search opens its box as soon as its view arrives.
    if (action.kind === 'look' || action.kind === 'search') {
      closingView = false;
    }
    session.act(action);
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

  /** Tells one box from another, so that a new box starts afresh. */
  const boxKey = $derived.by(() => {
    if (shownBox?.kind === 'pile') {
      return `${shownBox.mode}:${shownBox.pile.id}`;
    }
    return shownBox ? `stage:${shownBox.stage.key}` : '';
  });

  // A box takes over from the table: its bar, preview and selection go.
  const boxOpen = $derived(shownBox !== null);
  $effect(() => {
    if (boxOpen) {
      untrack(() => interaction.release());
    }
  });

  function closeBox(shuffle: boolean): void {
    if (shownBox?.kind === 'pile' && shownBox.mode !== 'browse') {
      closingView = true;
      session.act(shuffle ? { kind: 'closeView', where: 'shuffle' } : { kind: 'closeView' });
      return;
    }
    localBox = null;
  }

  /** The table card an element belongs to, if any: arrows link table cards only. */
  function tableCardOf(element: Element | null): string | undefined {
    return element?.closest<HTMLElement>('.surface .card:not(.pile)')?.dataset.id;
  }

  /** A click on an empty spot clears the viewer's own arrows, when there are any. */
  function clearOwnArrows(): void {
    const seat = ownArea ? seatOf(ownArea) : null;
    const arrows = view.table?.arrows ?? [];
    if (seat !== null && arrows.some((arrow) => arrow.seat === seat)) {
      session.act({ kind: 'arrowClear' });
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

  /** Draws the arrow being picked to that card: the server draws arrows between two table cards only. */
  function endArrowAt(to: string | undefined): void {
    const from = interaction.arrowFrom;
    if (from !== null && to && to !== from) {
      session.act({ kind: 'arrowAdd', card: from, target: to });
    }
    interaction.endArrow();
    // On touch, the tap goes on to the card as a click, which would select it;
    // a Shift + drag released on its own card would click it.
    interaction.swallowNextClick();
  }

  /**
   * In the capture phase, so that the card pressed does not see it. One press
   * does the first of: picking the target of the arrow mode (or cancelling
   * it), starting a Shift + drag arrow from a card, or, on an empty spot,
   * releasing the selection and clearing the viewer's own arrows, as in the
   * prototype.
   */
  function onTablePointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (interaction.arrowFrom !== null && !interaction.arrowDrag) {
      event.preventDefault();
      event.stopPropagation();
      endArrowAt(tableCardOf(target));
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
      clearOwnArrows();
    }
  }

  /** A Shift + drag arrow goes to the card the button is let go over. */
  function onPointerUp(event: PointerEvent): void {
    if (interaction.arrowDrag) {
      endArrowAt(tableCardOf(document.elementFromPoint(event.clientX, event.clientY)));
    }
  }

  function onPointerCancel(): void {
    if (interaction.arrowDrag) {
      interaction.endArrow();
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    handleKey(event, {
      view,
      items: barItems,
      zoom,
      setZoom: zoomWithButtons,
      run: runItem,
      act: send,
      showKeys: showKeySheet,
      sizeOf,
    });
  }

  function showKeySheet(): void {
    // The keyboard shortcuts sheet comes with plan 5c.
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
  let app = $state<HTMLElement>();

  // A new view, a zoom or a resized zone moves the elements under a pointer at
  // rest: the ones it lands on are not hovered by the viewer.
  $effect.pre(() => {
    void view;
    void zoom;
    // The zone heights: chosen with the separators, or grown with the cards.
    void zones;
    interaction.redrawn();
  });

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
  onclickcapture={(event) => interaction.clicked(event)}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  onkeydown={onKeydown}
/>

<!-- The zoom is set on the whole page, so a layer outside the table (a drag ghost) can follow it. -->
<div
  class="app"
  class:side-hidden={sideHidden}
  class:arrowing={interaction.arrowFrom !== null}
  class:dragging={interaction.dragging !== null}
  style:--z={zoom}
  bind:this={app}
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
          tokenMovable={view.you.role === 'player'}
          above={resizeAbove(zones[i - 1])}
        />
      {/each}
      <Arrows {view} root={app} layout={[zoom, zones]} />
    </div>
  </div>

  {#if catalog === 'failed'}
    <p class="notice" role="alert">Card data could not be loaded: cards show as placeholders.</p>
  {/if}

  <ZoomControl {zoom} onzoom={zoomWithButtons} onkeys={showKeySheet} />

  {#if handCards}
    <Hand cards={handCards} {faceOf} narrow={narrow.current} />
  {/if}

  <DragLayer
    {view}
    {zoom}
    root={app}
    {faceOf}
    {sizeOf}
    act={(action) => session.act(action)}
    lastError={session.lastError}
  />

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

  {#if shownBox}
    {#key boxKey}
      <CardBox
        box={shownBox}
        {view}
        {facesOf}
        {sizeOf}
        readOnly={view.you.role !== 'player'}
        act={(action) => session.act(action)}
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
    Rings drawn around the cut card, for cards and piles alike (the cut would clip them on the
    image): the ring of a tap selection, the white ring of the cards of the hovered history line,
    and the drop outlines.
  */
  .table :global(.card.locked)::before,
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

  .table :global(.card.locked)::before {
    box-shadow: 0 0 0 3px var(--sel);
  }

  .table :global(.card.highlighted)::before {
    box-shadow:
      0 0 0 2px #ffffffb0,
      0 0 22px 6px #ffffff38;
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
