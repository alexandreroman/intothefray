<!--
  The tokens, status tabs and modifier badges of a card in the inspector
  (CardSheet.svelte), drawn on its face as the table draws them on the card
  (CardView.svelte): the same places, the same look, at the table card's size
  zoomed to the face's. On an exhausted card they tilt with it: the inspector
  turns the card that holds them (CardSheet.svelte .tilt).

  On the shown card they are the controls: a tap on one opens a pill next to
  it, − value +, as the table's TokenPill.svelte, with 44 px buttons: a status
  steps as a token does, its tab showing its count ("Tough ×2"). The pill stays
  until a press lands outside it and its token, or on another token, and
  follows its token as the value changes; a counter stepped down to zero fades
  out, its pill with it. On a tilted card the pill tilts with it, placed by its
  token in the card's own, untilted frame (untilt.ts).
  On a card of the stack that is not shown, they are a picture alone: the same
  elements, out of reach (inert), so that the card the sheet switches to keeps
  its tokens as they are, none drawn again nor fading in.
-->
<script lang="ts">
  import { fade } from 'svelte/transition';
  import { motionMs } from '../lib/motion';
  import {
    CORNER_TOKENS,
    counterName,
    MAX_COUNT,
    MODIFIERS,
    statusCount,
    STATUSES,
    THREAT_TOKENS,
    withSign,
  } from './actions';
  import CounterGlyph from './CounterGlyph.svelte';
  import './counters.css';
  import type { SheetCounter } from './inspector';
  import { cardBox } from './layout';
  import { rotateDegrees, untiltedBox } from './untilt';

  let {
    counters,
    landscape,
    scheme = false,
    onstep,
  }: {
    counters: readonly SheetCounter[];
    /** The face is a landscape card. */
    landscape: boolean;
    /** The card is a scheme: the threat in the top right corner, the tabs on the left edge. */
    scheme?: boolean;
    /** Adds one to a counter, or takes one away; none for a card that is only shown. */
    onstep?: (counter: SheetCounter, delta: -1 | 1) => void;
  } = $props();

  /** How long a token takes to fade in or out, in ms. */
  const FADE_MS = 200;
  /** Room between the pill and its token, in px. */
  const GAP = 4;

  /** The table card's box, in table units, which the layer zooms to the face's width. */
  const box = $derived.by(() => {
    const portrait = cardBox('std', {});
    return landscape ? { w: portrait.h, h: portrait.w } : portrait;
  });

  let layerWidth = $state(0);
  const zoom = $derived(layerWidth > 0 ? layerWidth / box.w : 1);

  const tokens = $derived(counters.filter((counter) => counter.kind === 'token'));
  const cornerTokens = $derived(
    CORNER_TOKENS.flatMap((name) => tokens.filter((counter) => counter.name === name)),
  );
  const threatTokens = $derived(
    THREAT_TOKENS.flatMap((name) => tokens.filter((counter) => counter.name === name)),
  );
  const threatInCorner = $derived(scheme && threatTokens.length > 0);
  const threatInPile = $derived(!scheme && threatTokens.length > 0);
  // In the table's order of tabs, whatever the order of the counters.
  const statuses = $derived(
    STATUSES.flatMap(({ name }) =>
      counters.filter((counter) => counter.kind === 'status' && counter.name === name),
    ),
  );
  const modifiers = $derived(
    MODIFIERS.flatMap((name) =>
      counters.filter((counter) => counter.kind === 'modifier' && counter.name === name),
    ),
  );

  /** The counter whose pill is open, by key; it closes by itself once the counter is gone. */
  let openKey = $state<string | null>(null);
  const open = $derived(counters.find((counter) => keyOf(counter) === openKey) ?? null);

  let layer = $state<HTMLElement>();
  let pill = $state<HTMLElement>();
  let pillAt = $state<{ x: number; y: number } | null>(null);

  function keyOf(counter: SheetCounter): string {
    return `${counter.kind}:${counter.name}`;
  }

  /** What the token is called, with its value, as a screen reader says it: "Damage, 3", "Stunned". */
  function nameOf(counter: SheetCounter): string {
    if (counter.kind === 'modifier') {
      return `${counter.label}, ${withSign(counter.value)}`;
    }
    if (counter.kind === 'status' && counter.value === 1) {
      return counter.label;
    }
    return `${counter.label}, ${counter.value}`;
  }

  /** What a pill button does: "Add one damage", "Remove one from the DEF modifier". */
  function stepLabel(counter: SheetCounter, delta: -1 | 1): string {
    const name = counterName(counter.kind, counter.name);
    if (counter.kind === 'modifier') {
      return delta === 1 ? `Add one to the ${name}` : `Remove one from the ${name}`;
    }
    return delta === 1 ? `Add one ${name}` : `Remove one ${name}`;
  }

  /** A tap on a token opens its pill, or closes it when already open; a picture has none. */
  function toggle(counter: SheetCounter): void {
    if (onstep === undefined) {
      return;
    }
    openKey = openKey === keyOf(counter) ? null : keyOf(counter);
  }

  /**
   * Over its token, centred on it, kept inside the face; under it when the face has no room above
   * it (a token along the top edge). Worked out in the layer's own frame, which the pill is drawn
   * in: on a tilted card, the screen's bounds of the layer and the token are turned back first.
   */
  function place(): void {
    const token = open && layer?.querySelector(`[data-counter="${keyOf(open)}"]`);
    if (!layer || !pill || !token) {
      pillAt = null;
      return;
    }
    const room = { width: layer.offsetWidth, height: layer.offsetHeight };
    const at = untiltedBox(
      token.getBoundingClientRect(),
      layer.getBoundingClientRect(),
      room,
      turnOf(layer),
    );
    const own = { width: pill.offsetWidth, height: pill.offsetHeight };
    const centred = at.left + at.width / 2 - own.width / 2;
    const above = at.top - own.height - GAP;
    pillAt = {
      x: Math.min(Math.max(0, centred), Math.max(0, room.width - own.width)),
      y: above >= 0 ? above : at.top + at.height + GAP,
    };
  }

  /**
   * How far the element is turned on the screen, in degrees: the rotate of it and of every element
   * around it, as it is now, part way through a tilt included. A transform's turn is not counted:
   * the inspector tilts its card on rotate.
   */
  function turnOf(element: Element): number {
    let degrees = 0;
    for (let at: Element | null = element; at !== null; at = at.parentElement) {
      // jsdom computes no rotate.
      degrees += rotateDegrees(getComputedStyle(at).rotate ?? '');
    }
    return degrees;
  }

  // After every redraw that may move the token: its value, the zoom, the other counters.
  $effect(() => {
    void [open?.value, zoom, counters, pill];
    place();
  });

  /** A press outside the pill and its token closes the pill; one on another token opens that one. */
  function onDocumentPointerDown(event: PointerEvent): void {
    if (open === null || !(event.target instanceof Node)) {
      return;
    }
    const token = layer?.querySelector(`[data-counter="${keyOf(open)}"]`);
    if (pill?.contains(event.target) || token?.contains(event.target)) {
      return;
    }
    openKey = null;
  }
</script>

<svelte:document onpointerdowncapture={onDocumentPointerDown} />

<!--
  A token is a button, on the shown card as on another one of the stack, where the layer puts it
  out of reach. Its fade plays when it comes or goes, and when its pile goes too: the last token
  gone takes its pile with it.
-->
{#snippet chip(counter: SheetCounter, kind: string)}
  {@const isOpen = open !== null && keyOf(open) === keyOf(counter)}
  <button
    type="button"
    class="{kind} {counter.name}"
    class:neg={counter.kind === 'modifier' && counter.value < 0}
    class:open={isOpen}
    data-counter={keyOf(counter)}
    aria-label={nameOf(counter)}
    aria-expanded={onstep ? isOpen : undefined}
    onclick={() => toggle(counter)}
    transition:fade|global={{ duration: motionMs(FADE_MS) }}
  >
    {@render chipFace(counter)}
  </button>
{/snippet}

<!-- What a chip shows, as CardView.svelte: a token's value, a tab's label, a badge's signed value. -->
{#snippet chipFace(counter: SheetCounter)}
  {#if counter.kind === 'token'}
    {#if counter.name === 'acc'}<CounterGlyph kind="acc" />{/if}{counter.value}
  {:else if counter.kind === 'status'}
    {@const count = statusCount(counter.name, counter.value)}
    <!-- The label, then its count after a space: "Tough ×2". -->
    {#if counter.name === 'locked'}<CounterGlyph kind="locked" />{/if}{count === null
      ? counter.label
      : `${counter.label} `}{#if count !== null}<span class="n">{count}</span>{/if}
  {:else}
    <span class="n">{withSign(counter.value)}</span> {counter.label}
  {/if}
{/snippet}

<div
  class="layer"
  bind:this={layer}
  bind:clientWidth={layerWidth}
  aria-hidden={onstep ? undefined : 'true'}
  inert={onstep === undefined}
>
  <div
    class="card counters"
    class:land={landscape}
    class:scheme
    style:width="{box.w}px"
    style:height="{box.h}px"
    style:zoom
  >
    {#if threatInCorner}
      <div class="tokens top-right">
        {#each threatTokens as counter (counter.name)}
          {@render chip(counter, 'tok')}
        {/each}
      </div>
    {/if}

    {#if cornerTokens.length > 0 || threatInPile}
      <div class="tokens bottom-right">
        {#each cornerTokens.filter((counter) => counter.name === 'dmg') as counter (counter.name)}
          {@render chip(counter, 'tok')}
        {/each}
        {#if threatInPile}
          <div class="threat-row">
            {#each threatTokens as counter (counter.name)}
              {@render chip(counter, 'tok')}
            {/each}
          </div>
        {/if}
        {#each cornerTokens.filter((counter) => counter.name === 'gen') as counter (counter.name)}
          {@render chip(counter, 'tok')}
        {/each}
      </div>
    {/if}

    {#if statuses.length > 0}
      <div class="statuses">
        {#each statuses as counter (counter.name)}
          {@render chip(counter, 'st')}
        {/each}
      </div>
    {/if}

    {#if modifiers.length > 0}
      <div class="mods">
        {#each modifiers as counter (counter.name)}
          {@render chip(counter, 'st mod')}
        {/each}
      </div>
    {/if}
  </div>

  {#if open && onstep}
    {@const counter = open}
    <div
      class="tokpill"
      class:placed={pillAt !== null}
      role="group"
      aria-label="Change {counterName(counter.kind, counter.name)}"
      style:left="{pillAt?.x ?? 0}px"
      style:top="{pillAt?.y ?? 0}px"
      bind:this={pill}
      transition:fade={{ duration: motionMs(FADE_MS) }}
    >
      <button
        type="button"
        class="btn-ghost"
        aria-label={stepLabel(counter, -1)}
        disabled={counter.signed && counter.value <= -MAX_COUNT}
        onclick={() => onstep(counter, -1)}>−</button
      >
      <span class="value">{counter.signed ? withSign(counter.value) : counter.value}</span>
      <button
        type="button"
        class="btn-ghost"
        aria-label={stepLabel(counter, 1)}
        disabled={counter.signed && counter.value >= MAX_COUNT}
        onclick={() => onstep(counter, 1)}>+</button
      >
    </div>
  {/if}
</div>

<style>
  /* Over the face, the size of it: only the tokens and the pill take presses. */
  .layer {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }

  .card {
    position: relative;
  }

  .tokens,
  .statuses,
  .mods,
  .tokpill {
    pointer-events: auto;
  }

  /* A picture takes no presses: a tap on one of its tokens is a tap on its card (CardSheet.svelte). */
  .layer[inert] .tokens,
  .layer[inert] .statuses,
  .layer[inert] .mods {
    pointer-events: none;
  }

  /* A button drawn as the table's chip or tab: none of a button's own look. */
  button.tok,
  button.st {
    margin: 0;
    cursor: pointer;
    transition: none;
  }

  /* Its pill open, or the chip pressed: it is ringed, as a hovered one on the table. */
  .tok.open,
  button.tok:active {
    box-shadow:
      inset 0 1px 1px #ffffff80,
      inset 0 -2px 3px #0000004d,
      0 0 0 2px #fff,
      0 2px 6px #000000a0;
  }

  .st.open,
  button.st:active {
    box-shadow:
      0 0 0 2px #fff,
      0 2px 4px #0009;
  }

  /*
    Pressed, a chip keeps its own rim (counters.css), where every button's press would brighten it
    (tokens.css); the press surface lies under the chip's opaque gradient, unseen.
  */
  button.tok:active {
    border-color: var(--rim);
  }

  button.st:active {
    border-color: #0008;
  }

  /* The pill: TokenPill.svelte's look, with buttons a finger can take (44 px). */
  .tokpill {
    position: absolute;
    z-index: 5;
    display: flex;
    align-items: center;
    padding: 2px;
    background: var(--panel-2);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    box-shadow: 0 8px 20px #0009;
    /* Measured before it is placed: unseen until then. */
    visibility: hidden;
  }

  .tokpill.placed {
    visibility: visible;
  }

  .tokpill button {
    min-width: 44px;
    height: 44px;
    padding: 0 9px;
    border: none;
    border-radius: 999px;
    color: var(--text);
    font-size: 20px;
    font-weight: 800;
    line-height: 1;
  }

  .tokpill button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .tokpill .value {
    min-width: 36px;
    padding: 0 6px;
    text-align: center;
    font-stretch: 62%;
    font-weight: 900;
    font-size: 20px;
    line-height: 30px;
    background: var(--bg);
    border-radius: 9px;
  }
</style>
