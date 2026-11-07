<!--
  The tokens, status tabs and modifier badges of a card in the inspector
  (CardSheet.svelte), drawn on its face as the table draws them on the card
  (CardView.svelte): the same places, the same look, at the table card's size
  zoomed to the face's. The exhausted tilt is left out: the face stays upright.

  On the shown card they are the controls: a tap on one opens a pill next to
  it, − value +, as the table's TokenPill.svelte, with 44 px buttons: a status
  steps as a token does, its tab showing its count ("Tough ×2"). The pill stays
  until a press lands outside it and its token, or on another token, and
  follows its token as the value changes; a counter stepped down to zero fades
  out, its pill with it.
  On a card of the stack that is not shown, they are a picture alone: the same
  elements, out of reach (inert), so that the card the sheet switches to keeps
  its tokens as they are, none drawn again nor fading in.

  The look and the places mirror CardView.svelte's styles, which this file
  cannot share without changing that component's output: a change to one is
  made to the other.
-->
<script lang="ts">
  import { fade } from 'svelte/transition';
  import { motionMs } from '../lib/motion';
  import { counterName, MAX_COUNT, MODIFIERS, STATUSES, withSign } from './actions';
  import type { SheetCounter } from './inspector';
  import { cardBox } from './layout';

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

  // As CardView.svelte: the tokens pile up from the bottom right corner, damage first, counters on
  // top; the threat, then the acceleration to its left, between them, or in the top right corner
  // of a scheme.
  const CORNER_TOKENS = ['dmg', 'gen'];
  const THREAT_TOKENS = ['thr', 'acc'];

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
  const cornerTokens = $derived(tokens.filter((counter) => CORNER_TOKENS.includes(counter.name)));
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

  /** The number a status tab shows after its label (CardView.svelte): none for one, "×2" for several. */
  function statusCount(counter: SheetCounter): string | null {
    if (counter.name === 'retaliate') {
      return `${counter.value}`;
    }
    return counter.value > 1 ? `×${counter.value}` : null;
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
   * it (a token along the top edge).
   */
  function place(): void {
    const token = open && layer?.querySelector(`[data-counter="${keyOf(open)}"]`);
    if (!layer || !pill || !token) {
      pillAt = null;
      return;
    }
    const room = layer.getBoundingClientRect();
    const at = token.getBoundingClientRect();
    const own = pill.getBoundingClientRect();
    const centred = at.left - room.left + at.width / 2 - own.width / 2;
    const above = at.top - room.top - own.height - GAP;
    pillAt = {
      x: Math.min(Math.max(0, centred), Math.max(0, room.width - own.width)),
      y: above >= 0 ? above : at.bottom - room.top + GAP,
    };
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
    {#if counter.name === 'acc'}<svg class="chevrons" viewBox="0 0 8 8" aria-hidden="true"
        ><path d="M1.5 7.25 4 4.75 6.5 7.25M1.5 3.25 4 0.75 6.5 3.25" /></svg
      >{/if}{counter.value}
  {:else if counter.kind === 'status'}
    {@const count = statusCount(counter)}
    <!-- The label, then its count after a space: "Tough ×2". -->
    {#if counter.name === 'locked'}<svg class="lock" viewBox="0 0 10 10" aria-hidden="true"
        ><rect x="1.5" y="4.5" width="7" height="5" rx="1" /><path
          d="M3 4.5V3a2 2 0 0 1 4 0v1.5"
        /></svg
      >{/if}{count === null ? counter.label : `${counter.label} `}{#if count !== null}<span
        class="n">{count}</span
      >{/if}
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
    class="card"
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

  /* From here, as CardView.svelte draws them. */
  .tokens {
    position: absolute;
    z-index: 4;
    display: flex;
    gap: 2px;
  }

  .tokens.bottom-right {
    right: 5px;
    bottom: 5px;
    flex-direction: column-reverse;
    align-items: flex-end;
  }

  .threat-row {
    display: flex;
    flex-direction: row-reverse;
    gap: 2px;
  }

  .tokens.top-right {
    right: 5px;
    top: 5px;
    flex-direction: row-reverse;
  }

  .tok {
    --hi: #fff;
    --base: #999;
    --lo: #333;
    --rim: #222;
    --ink: #fff;
    position: relative;
    width: 21px;
    height: 21px;
    padding: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font:
      800 10.5px/1 system-ui,
      sans-serif;
    color: var(--ink);
    text-shadow: 0 1px 1px #0008;
    background: radial-gradient(circle at 34% 28%, var(--hi) 0%, var(--base) 48%, var(--lo) 100%);
    border: 1.5px solid var(--rim);
    box-shadow:
      inset 0 1px 1px #ffffff80,
      inset 0 -2px 3px #0000004d,
      0 2px 4px #000000a0;
  }

  /* Its pill open: the chip is ringed, as a hovered one on the table. */
  .tok.open {
    box-shadow:
      inset 0 1px 1px #ffffff80,
      inset 0 -2px 3px #0000004d,
      0 0 0 2px #fff,
      0 2px 6px #000000a0;
  }

  .st.open {
    box-shadow:
      0 0 0 2px #fff,
      0 2px 4px #0009;
  }

  .tok::before {
    content: '';
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    border: 1px solid #ffffff40;
    pointer-events: none;
  }

  .tok.dmg {
    --hi: #ff9b8c;
    --base: #d8352b;
    --lo: #7a1210;
    --rim: #4e0b09;
  }

  .tok.thr {
    --hi: #ffd59a;
    --base: #e08a1e;
    --lo: #8a4a07;
    --rim: #5a2f02;
  }

  .tok.gen {
    --hi: #9fe0b2;
    --base: #1b8a4a;
    --lo: #0a4723;
    --rim: #052e16;
  }

  .tok.acc {
    --hi: #ffab9f;
    --base: #ff4438;
    --lo: #901812;
    --rim: #5c0e0b;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1px;
  }

  .tok.acc .chevrons {
    width: 6px;
    height: 6px;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 1px 1px #0008);
  }

  .statuses {
    position: absolute;
    right: -6px;
    bottom: 74px;
    z-index: 4;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: flex-start;
    gap: 2px;
  }

  .card.land .statuses {
    top: 5px;
    bottom: auto;
    max-width: calc(100% + 1px);
    flex-direction: row;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .card.scheme .statuses {
    top: 5px;
    right: auto;
    bottom: auto;
    left: -6px;
    max-width: none;
    flex-direction: column;
    align-items: flex-start;
  }

  .card.land.scheme .statuses {
    max-height: 62px;
    flex-wrap: wrap;
  }

  .card.scheme .st {
    border-radius: 5px 3px 3px 5px;
  }

  .st {
    font-stretch: 75%;
    font-weight: 800;
    font-size: 8px;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fff;
    padding: 2px 4px 2px 5px;
    border-radius: 3px 5px 5px 3px;
    border: 1px solid #0008;
    box-shadow:
      0 2px 4px #0009,
      inset 0 1px 0 #ffffff40;
    text-shadow: 0 1px 1px #0008;
  }

  .st.stunned {
    background: linear-gradient(#25a058, #11683a);
  }

  .st.confused {
    background: linear-gradient(#a274e6, #5c33a3);
  }

  .st.tough {
    background: linear-gradient(#f0a53a, #a8600f);
  }

  .st.retaliate {
    background: linear-gradient(#2bb0b5, #13696f);
  }

  .st.locked {
    background: linear-gradient(#7d8aa8, #46506b);
  }

  .mods {
    position: absolute;
    bottom: 5px;
    left: -6px;
    z-index: 4;
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: flex-start;
    gap: 2px;
    max-height: 78px;
  }

  .card.scheme .mods {
    top: 30px;
    bottom: auto;
    left: auto;
    right: -6px;
    flex-wrap: wrap-reverse;
    align-items: flex-start;
  }

  .card.land .mods {
    top: auto;
    right: auto;
    bottom: 5px;
    left: 5px;
    max-width: calc(100% - 59px);
    max-height: none;
    justify-content: flex-start;
    flex-direction: row;
    flex-wrap: wrap-reverse;
    align-items: flex-end;
  }

  .card.land.scheme .mods {
    max-width: calc(100% - 36px);
  }

  .mod {
    white-space: nowrap;
    border-radius: 5px 3px 3px 5px;
    background: linear-gradient(var(--line-strong), var(--panel-2));
  }

  .card.scheme .mod {
    border-radius: 3px 5px 5px 3px;
  }

  .card.land .mod {
    border-radius: 3px;
  }

  .mod.neg {
    background: linear-gradient(var(--accent), var(--accent-deep));
  }

  .st .lock {
    width: 6px;
    height: 6px;
    margin-right: 2px;
    vertical-align: -1px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
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
