<!--
  The hint of the arrow mode: a small pill centred above the card the arrow
  starts from, or below it when there is no room above, lined up on its left
  or right edge when centring would cross the visible table. It stays there
  whatever the pointer hovers, and lets every press through to the table.
-->
<script lang="ts">
  let {
    anchor,
    text,
    bounds,
    zoom,
    version,
  }: {
    /** The card the arrow starts from, found anew at every placement as redraws replace it. */
    anchor: () => HTMLElement | null;
    text: string;
    /** The visible table: the pill stays within it. */
    bounds: HTMLElement;
    /** Read to place the pill again when the table is zoomed. */
    zoom: number;
    /** Changes with every redraw of the table, which may move the card. */
    version?: unknown;
  } = $props();

  // Room between the pill and its card, and from the table edges.
  const GAP = 8;
  const EDGE = 8;

  let pill = $state<HTMLElement>();
  let position = $state<{ x: number; y: number } | null>(null);

  function place(): void {
    const element = anchor();
    if (!pill || !element) {
      position = null;
      return;
    }
    const r = element.getBoundingClientRect();
    const w = bounds.getBoundingClientRect();
    const own = pill.getBoundingClientRect();

    const above = r.top - own.height - GAP;
    const y = above > w.top + 4 ? above : r.bottom + GAP;

    const left = w.left + EDGE;
    const right = w.right - EDGE;
    const centred = r.left + r.width / 2 - own.width / 2;
    let x = centred;
    if (centred < left) {
      x = Math.max(left, r.left);
    } else if (centred + own.width > right) {
      x = Math.min(right - own.width, r.right - own.width);
    }
    position = { x, y };
  }

  $effect(() => {
    void [text, zoom, version];
    place();
  });
</script>

<svelte:window onscrollcapture={place} onresize={place} />

<div
  class="arrowhint"
  role="status"
  bind:this={pill}
  class:placed={position !== null}
  style:left="{position?.x ?? 0}px"
  style:top="{position?.y ?? 0}px"
>
  {text}
</div>

<style>
  /* The look of the table's floating panels; over the cards and the arrows, under the menus. */
  .arrowhint {
    position: fixed;
    z-index: 3500;
    max-width: calc(100vw - 16px);
    padding: 8px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    background: var(--panel-2);
    box-shadow: 0 14px 34px #0000008c;
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
    pointer-events: none;
    /* Measured before it is placed: unseen until then. */
    visibility: hidden;
  }

  .arrowhint.placed {
    visibility: visible;
    animation: floatin 0.12s ease-out;
  }

  @keyframes floatin {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .arrowhint.placed {
      animation: none;
    }
  }
</style>
