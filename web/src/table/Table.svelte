<!--
  The table page: the top bar, the table column (a vertical stack of zones,
  each scrolling horizontally on its own) and the side column.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import TopBar from '../components/TopBar.svelte';
  import { knownCard, loadAllCards } from '../lib/catalog';
  import type { Area, CardView as TableCard, PackFace, PileView, Size, View } from '../lib/types';
  import { isHidden } from './face.svelte';
  import { zoneMinHeight, zoneOrder, zoneWidth } from './layout';
  import Zone, { type Heading, type ResizeAbove } from './Zone.svelte';
  import ZoomControl from './ZoomControl.svelte';
  import { clampZoom, saveZoom, storedZoom, ZOOM_MAX, ZOOM_MIN } from './zoom';

  let { view }: { view: View } = $props();

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

<div class="app">
  <div class="top">
    <TopBar title="INTO THE FRAY" spectators={view.spectators} />
  </div>

  <div class="tablewrap" bind:this={wrap}>
    <div class="table" style:--z={zoom}>
      {#each zones as zone, i (zone.area)}
        <Zone
          area={zone.area}
          heading={zone.heading}
          cards={zone.cards}
          piles={zone.piles}
          {topOf}
          {sizeOf}
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

  <!-- The preview and the history come in the side column (plan 5a, Task 4). -->
  <aside class="side"></aside>
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

  .side {
    grid-area: side;
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

  @media (max-width: 900px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'top'
        'table';
    }

    .side {
      display: none;
    }
  }
</style>
