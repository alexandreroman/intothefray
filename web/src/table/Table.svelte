<!--
  The table page: the top bar, the table column (a vertical stack of zones,
  each scrolling horizontally on its own) and the side column (preview and
  history).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import TopBar from '../components/TopBar.svelte';
  import { knownCard, loadAllCards } from '../lib/catalog';
  import { getPref, setPref } from '../lib/prefs';
  import type { GameSession } from '../lib/session.svelte';
  import type { Area, CardView as TableCard, PackFace, PileView, Size, View } from '../lib/types';
  import { isHidden, pileBack } from './face';
  import Hand from './Hand.svelte';
  import { hover, type Hovered } from './hover.svelte';
  import { zoneMinHeight, zoneOrder, zoneWidth } from './layout';
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
        width: zoneWidth(cards, piles, area, sizeOf),
      };
    }),
  );

  type ZoneData = (typeof zones)[number];

  // A resizable zone only grows on its own: once its cards made it taller, it
  // stays that tall when they move back up, until it is resized by hand.
  $effect.pre(() => {
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

  function previewOf(hovered: Hovered | null): Preview | null {
    if (hovered?.kind === 'pile') {
      const pile = piles.find((p) => p.id === hovered.id);
      if (!pile || pile.count === 0) {
        return null;
      }
      const top = topOf(pile);
      return top ? previewOfCard(top) : { kind: 'back', back: pileBack(pile.kind) };
    }
    const card = hovered ? cardsById.get(hovered.id) : undefined;
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
  const preview = $derived(previewOf(hover.hovered));

  // An empty spot of the table clears the preview; the side panel keeps it, to read it there.
  function onTableOver(event: PointerEvent): void {
    if (!(event.target as Element).closest('.card')) {
      hover.hovered = null;
    }
  }

  // The hover state is shared: a previous game's must not show in the next one.
  $effect(() => () => hover.reset());

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

<div class="app" class:side-hidden={sideHidden}>
  <div class="top">
    <TopBar
      title="INTO THE FRAY"
      spectators={view.spectators}
      side={{ hidden: !sideShown, ontoggle: toggleSide }}
      onend={view.you.host ? () => session.lobby('end') : undefined}
    />
  </div>

  <div class="tablewrap" role="presentation" bind:this={wrap} onpointerover={onTableOver}>
    <div class="table" style:--z={zoom}>
      {#each zones as zone, i (zone.area)}
        <Zone
          area={zone.area}
          heading={zone.heading}
          cards={zone.cards}
          piles={zone.piles}
          {topOf}
          {faceOf}
          height={zone.height}
          width={zone.width}
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
