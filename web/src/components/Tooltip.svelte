<!--
  The tooltips of the page: any element with data-tip gets a small speech
  bubble after a short hover, with its shortcut (data-kbd) in a kbd, and a
  tail pointing at the element. Pressing anything hides it.
-->
<script lang="ts">
  const DELAY_MS = 350;
  // Room between the element and the tooltip, and from the window edges.
  const GAP = 8;
  const EDGE = 6;
  // The tail stays clear of the bubble's rounded corners.
  const TAIL_INSET = 12;

  let target: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  let shown = $state<{ tip: string; kbd?: string; anchor: DOMRect } | null>(null);
  let tooltip = $state<HTMLElement>();
  let left = $state(0);
  let top = $state(0);
  let below = $state(false);
  let tailX = $state(0);

  function hide(): void {
    clearTimeout(timer);
    shown = null;
  }

  function onPointerOver(event: PointerEvent): void {
    const element = (event.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null;
    if (element === target) {
      return;
    }
    target = element;
    hide();
    if (!element) {
      return;
    }
    timer = setTimeout(() => {
      if (!element.isConnected || !element.dataset.tip) {
        return;
      }
      shown = {
        tip: element.dataset.tip,
        kbd: element.dataset.kbd,
        anchor: element.getBoundingClientRect(),
      };
    }, DELAY_MS);
  }

  function onPointerDown(): void {
    hide();
    target = null;
  }

  // Placed once drawn, as its size depends on its text: above the element when there is room.
  $effect(() => {
    if (!shown || !tooltip) {
      return;
    }
    const box = tooltip.getBoundingClientRect();
    const { anchor } = shown;
    const centred = anchor.left + anchor.width / 2 - box.width / 2;
    left = Math.max(EDGE, Math.min(window.innerWidth - box.width - EDGE, centred));
    below = anchor.top <= 40;
    top = below ? anchor.bottom + GAP : anchor.top - box.height - GAP;
    // Pointing at the element's centre, even when the bubble is pushed in from a window edge.
    const centre = anchor.left + anchor.width / 2 - left;
    tailX = Math.max(TAIL_INSET, Math.min(box.width - TAIL_INSET, centre));
  });
</script>

<svelte:document onpointerover={onPointerOver} onpointerdowncapture={onPointerDown} />

{#if shown}
  <div
    class="tip"
    class:below
    role="tooltip"
    bind:this={tooltip}
    style:left="{left}px"
    style:top="{top}px"
    style:--tail-x="{tailX}px"
  >
    {shown.tip}{#if shown.kbd}<kbd>{shown.kbd}</kbd>{/if}
  </div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 6000;
    pointer-events: none;
    background: var(--text);
    color: var(--bg);
    border-radius: 10px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 6px 16px #000a;
    animation: fadein 0.12s;
  }

  /* The tail: a comic balloon's wedge, its straight side over the element's centre. */
  .tip::after {
    content: '';
    position: absolute;
    left: var(--tail-x);
    top: 100%;
    border-style: solid;
    border-width: 7px 7px 0 0;
    border-color: var(--text) transparent transparent transparent;
  }

  .tip.below::after {
    top: auto;
    bottom: 100%;
    border-width: 7px 0 0 7px;
    border-color: transparent transparent transparent var(--text);
  }

  @keyframes fadein {
    from {
      opacity: 0;
    }
  }

  kbd {
    margin-left: 8px;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    background: #d5dae6;
    border-radius: 5px;
    padding: 0 6px;
  }
</style>
