<!--
  The tooltips of the page: any element with data-tip gets a small label
  after a short hover, with its shortcut (data-kbd) in a kbd. Pressing
  anything hides it.
-->
<script lang="ts">
  const DELAY_MS = 350;
  // Room between the element and the tooltip, and from the window edges.
  const GAP = 8;
  const EDGE = 6;

  let target: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  let shown = $state<{ tip: string; kbd?: string; anchor: DOMRect } | null>(null);
  let tooltip = $state<HTMLElement>();
  let left = $state(0);
  let top = $state(0);

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
    top = anchor.top > 40 ? anchor.top - box.height - GAP : anchor.bottom + GAP;
  });
</script>

<svelte:document onpointerover={onPointerOver} onpointerdowncapture={onPointerDown} />

{#if shown}
  <div class="tip" role="tooltip" bind:this={tooltip} style:left="{left}px" style:top="{top}px">
    {shown.tip}{#if shown.kbd}<kbd>{shown.kbd}</kbd>{/if}
  </div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 6000;
    pointer-events: none;
    background: #0b0f18f2;
    color: var(--text);
    border: 1px solid #3a4870;
    border-radius: 7px;
    padding: 4px 8px;
    font-size: 12px;
    white-space: nowrap;
    box-shadow: 0 6px 16px #000a;
    animation: fadein 0.12s;
  }

  @keyframes fadein {
    from {
      opacity: 0;
    }
  }

  kbd {
    margin-left: 8px;
    font:
      11px ui-monospace,
      monospace;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0 4px;
  }
</style>
