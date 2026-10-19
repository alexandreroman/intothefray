<!--
  The arrows from card to card (spec 5.8): curved paths in their owner's
  colour, drawn over the zones inside the table, so that they scroll with it.
  Arrows can link cards of different zones, each zone scrolling on its own:
  the paths are measured from the cards on the screen, again whenever a zone
  or the table scrolls, the table is resized, or the cards move. In arrow
  mode, a dashed rubber band runs from the source card to the pointer, or to
  the card under it.
-->
<script lang="ts">
  import type { View } from '../lib/types';
  import { interaction } from './interaction.svelte';

  let {
    view,
    root,
    layout,
  }: {
    view: View;
    /** The page: the cards are found in its zones, and in its drag layer while dragged. */
    root: HTMLElement | undefined;
    /** What moves the cards on the screen without a new view (the zoom, the zone heights): redrawn on change. */
    layout: unknown;
  } = $props();

  /** An end of an arrow, in the layer's coordinates, with the half size of its card. */
  interface End {
    x: number;
    y: number;
    hw: number;
    hh: number;
  }

  interface Drawn {
    d: string;
    start: End;
    /** The colour index, null when the arrow's player is unknown. */
    color: number | null;
    rubber: boolean;
  }

  // The player colours (--p1 to --p4), one arrowhead each.
  const COLORS = [0, 1, 2, 3];
  // The prototype's room at a zone edge for the end of an arrow whose card is scrolled out of view.
  const EDGE_ROOM = 12;
  // How far into the target card an arrow stops, past its edge.
  const INTO_CARD = 10;

  let svg = $state<SVGSVGElement>();
  let paths = $state.raw<Drawn[]>([]);
  // The pointer on the screen, for the rubber band.
  let pointer: { x: number; y: number } | null = null;
  let frame = 0;

  function colourOf(color: number | null): string {
    return color === null ? 'var(--muted)' : `var(--p${color + 1})`;
  }

  function markerOf(color: number | null): string {
    return `url(#ah-${color ?? 'none'})`;
  }

  /** The colour of the player seated there: seats and colours are not the same. */
  function seatColor(seat: number): number | null {
    return view.players.find((player) => player.area === `p${seat}`)?.color ?? null;
  }

  /** The card drawn for that id: its ghost while it is dragged, or else the card in its zone. */
  function cardElement(id: string): Element | null {
    if (!root) {
      return null;
    }
    return (
      root.querySelector(`.draglayer .card[data-id="${id}"]`) ??
      root.querySelector(`.surface .card:not(.pile)[data-id="${id}"]`)
    );
  }

  /** The middle of a card, held within its zone when the zone is scrolled past it. */
  function endOf(element: Element, layer: DOMRect): End {
    const rect = element.getBoundingClientRect();
    let x = rect.left + rect.width / 2;
    const scroller = element.closest('.zscroll')?.getBoundingClientRect();
    if (scroller) {
      x = Math.max(scroller.left + EDGE_ROOM, Math.min(scroller.right - EDGE_ROOM, x));
    }
    return {
      x: x - layer.left,
      y: rect.top + rect.height / 2 - layer.top,
      hw: rect.width / 2,
      hh: rect.height / 2,
    };
  }

  function round(value: number): number {
    return Math.round(value * 10) / 10;
  }

  /** A quadratic curve bent to the side, stopping just inside the target card's edge, as in the prototype. */
  function curve(a: End, b: End, toCard: boolean): string {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    let ex = b.x;
    let ey = b.y;
    if (toCard) {
      const edge = Math.min(b.hw / Math.abs(ux || 1e-6), b.hh / Math.abs(uy || 1e-6));
      ex = b.x - ux * (edge - INTO_CARD);
      ey = b.y - uy * (edge - INTO_CARD);
    }
    const bend = Math.min(80, length * 0.18);
    const mx = (a.x + ex) / 2 - uy * bend;
    const my = (a.y + ey) / 2 + ux * bend;
    return `M${round(a.x)},${round(a.y)} Q${round(mx)},${round(my)} ${round(ex)},${round(ey)}`;
  }

  /** The card under the pointer that the rubber band snaps to: any table card but its source. */
  function cardUnderPointer(from: string): Element | null {
    if (!pointer) {
      return null;
    }
    const under = document
      .elementFromPoint(pointer.x, pointer.y)
      ?.closest<HTMLElement>('.surface .card:not(.pile)');
    return under && under.dataset.id !== from ? under : null;
  }

  /** The dashed arrow being picked, from its source card to the pointer. */
  function rubberBand(layer: DOMRect): Drawn | null {
    const from = interaction.arrowFrom;
    const source = from === null ? null : cardElement(from);
    if (from === null || !source || !pointer) {
      return null;
    }
    const start = endOf(source, layer);
    const target = cardUnderPointer(from);
    const end = target
      ? endOf(target, layer)
      : { x: pointer.x - layer.left, y: pointer.y - layer.top, hw: 0, hh: 0 };
    return { d: curve(start, end, target !== null), start, color: view.you.color, rubber: true };
  }

  function measure(): void {
    if (!svg) {
      return;
    }
    const layer = svg.getBoundingClientRect();
    const table = view.table;
    // An arrow whose card left the table is not drawn (the server drops it on the next action).
    const onTable = new Set(
      (table?.cards ?? []).filter((card) => card.zone === 'table').map((card) => card.id),
    );
    const drawn: Drawn[] = [];
    for (const arrow of table?.arrows ?? []) {
      const from = onTable.has(arrow.from) ? cardElement(arrow.from) : null;
      const to = onTable.has(arrow.to) ? cardElement(arrow.to) : null;
      if (!from || !to) {
        continue;
      }
      const start = endOf(from, layer);
      const d = curve(start, endOf(to, layer), true);
      drawn.push({ d, start, color: seatColor(arrow.seat), rubber: false });
    }
    const rubber = rubberBand(layer);
    if (rubber) {
      drawn.push(rubber);
    }
    paths = drawn;
  }

  /** Measures again at the next frame, once for every scroll or pointer move of that frame. */
  function schedule(): void {
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    }
  }

  // After every redraw of the table: a new view, a zoom, resized zones, the arrow mode, and a
  // drag that starts or ends (a drop that sends nothing, or that the server refuses, brings no view).
  $effect(() => {
    void layout;
    void interaction.dragging;
    void interaction.landing;
    measure();
  });

  // Scrolling a zone or the table, in the capture phase: scroll events do not bubble.
  $effect(() => {
    const page = root;
    if (!page) {
      return;
    }
    page.addEventListener('scroll', schedule, true);
    return () => page.removeEventListener('scroll', schedule, true);
  });

  // The table resized: the side panel slid, or a zone grew.
  $effect(() => {
    const table = svg?.parentElement;
    if (!table) {
      return;
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(table);
    return () => observer.disconnect();
  });

  $effect(() => () => cancelAnimationFrame(frame));

  function onPointerMove(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY };
    // The rubber band follows the pointer, and an arrow follows its dragged card.
    const dragged = interaction.dragging !== null && (view.table?.arrows ?? []).length > 0;
    if (interaction.arrowFrom !== null || dragged) {
      schedule();
    }
  }
</script>

<svelte:window onpointermove={onPointerMove} onresize={schedule} />

<svg class="arrows" bind:this={svg} aria-hidden="true">
  <defs>
    {#each [...COLORS, null] as color (color)}
      <marker
        id="ah-{color ?? 'none'}"
        viewBox="0 0 10 10"
        refX="6"
        refY="5"
        markerWidth="4"
        markerHeight="4"
        orient="auto"
      >
        <path
          d="M0,0 L10,5 L0,10 z"
          style:fill={colourOf(color)}
          stroke="#07090f"
          stroke-width="1"
        />
      </marker>
    {/each}
  </defs>
  {#each paths as path, i (i)}
    <path class="under" d={path.d} />
    <path
      class="shaft"
      class:rubber={path.rubber}
      d={path.d}
      style:stroke={colourOf(path.color)}
      marker-end={markerOf(path.color)}
    />
    <circle
      cx={path.start.x}
      cy={path.start.y}
      r="6"
      style:fill={colourOf(path.color)}
      stroke="#07090f"
      stroke-width="2"
    />
  {/each}
</svg>

<style>
  /* Over the cards and the zone edge fades, under the scroll chips and the separator handles. */
  .arrows {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
    z-index: 900;
  }

  .under {
    stroke: #07090f;
    stroke-width: 8;
    fill: none;
    stroke-linecap: round;
    opacity: 0.75;
  }

  .shaft {
    stroke-width: 4;
    fill: none;
    stroke-linecap: round;
  }

  .rubber {
    stroke-dasharray: 8 7;
    animation: march 0.6s linear infinite;
  }

  @keyframes march {
    to {
      stroke-dashoffset: -15;
    }
  }
</style>
