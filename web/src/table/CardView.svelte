<!--
  One card lying on the table: its face (or its back when hidden), placed in
  table units, with its tokens, statuses and stat modifiers.
-->
<script lang="ts">
  import { playerColorVar } from '../lib/playerColor';
  import type { PackFace, CardView as TableCard } from '../lib/types';
  import {
    CORNER_TOKENS,
    MODIFIER_BADGES,
    statusCount,
    STATUSES,
    THREAT_TOKENS,
    withSign,
    type TokenName,
  } from './actions';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import CounterGlyph from './CounterGlyph.svelte';
  import './counters.css';
  import { dockCounterLayout, measureChipText, moreText, type Box } from './dockCounters';
  import { dockMode } from './dockMode';
  import { DOCK_SCALE, dockCardBox } from './dockPiles';
  import { isHidden, SCHEME_TYPES } from './face';
  import { interaction } from './interaction.svelte';
  import { cardBox, SLOT_GAP } from './layout';
  import { LIFT_SCALE, LIFT_SHADE, motion } from './motion.svelte';

  let {
    card,
    face,
    ghost = false,
    landed = false,
    draggable = false,
    caption,
    shift,
  }: {
    card: TableCard;
    /** The catalog face the card shows, null while unknown: it is then a std placeholder. */
    face: PackFace | null;
    /** The copy drawn under the pointer while the card is dragged (DragLayer). */
    ghost?: boolean;
    /** A ghost set down where the card was dropped, until the server answers. */
    landed?: boolean;
    /** The viewer can drag it: the pointer grabs it. */
    draggable?: boolean;
    /** The caption of its back: the side deck it belongs to, when that deck has its own back. */
    caption?: string;
    /** Dock mode, during a drag: how far it is drawn pushed aside, as a translate. Never a ghost's. */
    shift?: string;
  } = $props();

  const hidden = $derived(isHidden(card));
  const box = $derived(cardBox(face?.size ?? 'std', { faceDown: hidden, onPile: !!card.onPile }));
  const landscape = $derived(!box.rotated && box.w > box.h);
  // In dock mode the card is drawn whole at a smaller scale, from its top-left
  // corner, which the table hands already projected (dockLayout.ts). The element is the drawn box: it
  // takes the presses and the drops, the rings go round it, it tilts about its middle and the flights
  // measure it.
  const dock = dockMode();
  const drawn = $derived(dock.current ? dockCardBox(box) : box);
  // A hidden card has no face: it is not known to be a scheme.
  const scheme = $derived(!hidden && SCHEME_TYPES.includes(face?.type ?? ''));
  const hasToken = (k: TokenName) => (card.tokens?.[k] ?? 0) > 0;
  const cornerTokens = $derived(CORNER_TOKENS.filter(hasToken));
  const threatTokens = $derived(THREAT_TOKENS.filter(hasToken));
  const threatInCorner = $derived(scheme && threatTokens.length > 0);
  const threatInPile = $derived(!scheme && threatTokens.length > 0);
  const statuses = $derived(STATUSES.filter(({ name }) => (card.status?.[name] ?? 0) > 0));

  // A modifier is signed: only 0 hides it.
  const modifiers = $derived(MODIFIER_BADGES.filter((name) => (card.mods?.[name] ?? 0) !== 0));
  // In dock mode its counters take three regions of their own, at a fixed screen size
  // (dockCounters.ts): their layer undoes the table's zoom, so that its px are screen px.
  const zoom = $derived(dock.zoom ?? 1);
  const dockCounters = $derived(
    dock.current
      ? dockCounterLayout({
          width: drawn.w * zoom,
          height: drawn.h * zoom,
          // The gap to the neighbouring unit's slot (dockLayout.ts), where the modifiers may stand.
          leftRoom: SLOT_GAP * DOCK_SCALE * zoom,
          scheme,
          counters: card,
          measure: measureChipText,
        })
      : null,
  );

  function boxStyle(box: Box): string {
    return `left: ${box.x}px; top: ${box.y}px; width: ${box.w}px; height: ${box.h}px`;
  }

  const element = $derived({ kind: 'card', id: card.id } as const);
  // A ghost is a copy: only the card on the table shows that it is hovered.
  const hovered = $derived(!ghost && interaction.isHovered(element));
  // While dragged, the card on the table makes way for its ghost.
  const lifted = $derived(!ghost && interaction.isLifted(card.id));
  // A finger held it still long enough (touch mode): it lifts in place, ready to be dragged.
  const armed = $derived(!ghost && interaction.isArmed(element));
  // A drop would tuck the dragged card under this one, or go onto the pile this card is revealed on.
  const dropOn = $derived(ghost ? null : interaction.dropOn);
  const tuckTarget = $derived(dropOn?.kind === 'card' && dropOn.id === card.id);
  const pileTarget = $derived(dropOn?.kind === 'pile' && dropOn.id === card.onPile);
  // Another player previews the card: their ring is drawn inside it, so it follows every move.
  const previewer = $derived(ghost ? undefined : interaction.previewerOf(card.id));
  // The rubber band selected it: it is ringed in the viewer's colour (Table.svelte).
  const selected = $derived(!ghost && interaction.group.has(card.id));
</script>

<!-- A token chip; in dock mode, at the box its layer gives it (style). -->
{#snippet token(k: TokenName, count: number, style?: string)}
  {@const target = { card: card.id, kind: 'token', name: k } as const}
  <span
    class="tok {k}"
    class:hot={interaction.isCounter(target)}
    {style}
    data-counter="token:{k}"
    role="presentation"
    onpointerenter={(event) => interaction.enterCounter(target, event)}
    onpointerleave={() => interaction.leaveCounter(target)}
    >{#if k === 'acc'}<CounterGlyph kind="acc" />{/if}{count}</span
  >
{/snippet}

<!--
  z-index comes from the server and can be negative: the surface must isolate its stacking.
  The pointer feeds the side preview, the keys and the context menu (a click, Table.svelte): no role
  to announce.
-->
<div
  class="card counters"
  role="presentation"
  data-id={card.id}
  class:exhausted={card.exhausted}
  class:highlighted={interaction.highlighted.has(card.id)}
  class:hovered
  class:land={landscape}
  class:scheme
  class:scaled={dock.current}
  class:lifted
  class:armed
  class:ghost
  class:landed
  class:grab={draggable && !ghost}
  class:drop-target={tuckTarget}
  class:drop-pile={pileTarget}
  style:left={ghost ? undefined : `${card.x}px`}
  style:top={ghost ? undefined : `${card.y}px`}
  style:width="{drawn.w}px"
  style:height="{drawn.h}px"
  style:z-index={card.z}
  style:translate={ghost ? `${card.x}px ${card.y}px` : shift}
  style:--scale={dock.current ? DOCK_SCALE : undefined}
  style:--lift-scale={armed ? LIFT_SCALE : undefined}
  style:--lift-shade={armed ? LIFT_SHADE : undefined}
  onpointerenter={(event) => interaction.enter(element, event)}
  onpointerleave={() => {
    // Edge-on as it turns, the card slips from under the pointer, which still rests on it.
    if (!motion.isTurning(card.id)) {
      interaction.leave(element);
    }
  }}
  onpointerdown={(event) => interaction.press(element, event)}
>
  <div class="shade"></div>
  {#if hidden}
    <CardBack back={card.back} {caption} />
  {:else}
    <CardFace
      images={face?.images ?? []}
      name={face?.name ?? ''}
      {landscape}
      rotated={box.rotated}
    />
  {/if}

  {#if dockCounters}
    <div class="dock-counters" style:zoom={1 / zoom}>
      {#each dockCounters.tokens.items as { name: k, count, box } (k)}
        {@render token(k, count, boxStyle(box))}
      {/each}
      {#if dockCounters.tokens.more}
        <span class="tok more" style={boxStyle(dockCounters.tokens.more.box)}
          >{moreText(dockCounters.tokens.more.hidden)}</span
        >
      {/if}

      {#each dockCounters.statuses.items as { name: k, text, box } (k)}
        {@const target = { card: card.id, kind: 'status', name: k } as const}
        <span
          class="st {k}"
          class:hot={interaction.isCounter(target)}
          style={boxStyle(box)}
          data-counter="status:{k}"
          role="presentation"
          onpointerenter={(event) => interaction.enterCounter(target, event)}
          onpointerleave={() => interaction.leaveCounter(target)}>{text}</span
        >
      {/each}
      {#if dockCounters.statuses.more}
        <span class="st more" style={boxStyle(dockCounters.statuses.more.box)}
          >{moreText(dockCounters.statuses.more.hidden)}</span
        >
      {/if}

      {#each dockCounters.modifiers.items as { name, value, stat, box } (name)}
        {@const target = { card: card.id, kind: 'modifier', name } as const}
        <span
          class="st mod"
          class:neg={(card.mods?.[name] ?? 0) < 0}
          class:hot={interaction.isCounter(target)}
          style={boxStyle(box)}
          data-counter="modifier:{name}"
          role="presentation"
          onpointerenter={(event) => interaction.enterCounter(target, event)}
          onpointerleave={() => interaction.leaveCounter(target)}
          ><span class="n">{value}</span> {stat}</span
        >
      {/each}
      {#if dockCounters.modifiers.more}
        <span class="st more" style={boxStyle(dockCounters.modifiers.more.box)}
          >{moreText(dockCounters.modifiers.more.hidden)}</span
        >
      {/if}
    </div>
  {:else}
    {#if threatInCorner}
      <div class="tokens top-right">
        {#each threatTokens as k (k)}
          {@render token(k, card.tokens?.[k] ?? 0)}
        {/each}
      </div>
    {/if}

    <!-- In the order the tokens pile up from the corner: damage, the threat row, counters. -->
    {#if cornerTokens.length > 0 || threatInPile}
      <div class="tokens bottom-right">
        {#if hasToken('dmg')}
          {@render token('dmg', card.tokens?.dmg ?? 0)}
        {/if}
        {#if threatInPile}
          <div class="threat-row">
            {#each threatTokens as k (k)}
              {@render token(k, card.tokens?.[k] ?? 0)}
            {/each}
          </div>
        {/if}
        {#if hasToken('gen')}
          {@render token('gen', card.tokens?.gen ?? 0)}
        {/if}
      </div>
    {/if}

    {#if statuses.length > 0}
      <div class="statuses">
        {#each statuses as { name: k, label } (k)}
          {@const count = statusCount(k, card.status?.[k] ?? 0)}
          {@const target = { card: card.id, kind: 'status', name: k } as const}
          <span
            class="st {k}"
            class:hot={interaction.isCounter(target)}
            data-counter="status:{k}"
            role="presentation"
            onpointerenter={(event) => interaction.enterCounter(target, event)}
            onpointerleave={() => interaction.leaveCounter(target)}
            >{#if k === 'locked'}<CounterGlyph
                kind="locked"
              />{/if}{#if count === null}{label}{:else}{label}
              <span class="n">{count}</span>{/if}</span
          >
        {/each}
      </div>
    {/if}

    {#if modifiers.length > 0}
      <div class="mods">
        {#each modifiers as name (name)}
          {@const n = card.mods?.[name] ?? 0}
          {@const target = { card: card.id, kind: 'modifier', name } as const}
          <span
            class="st mod"
            class:neg={n < 0}
            class:hot={interaction.isCounter(target)}
            data-counter="modifier:{name}"
            role="presentation"
            onpointerenter={(event) => interaction.enterCounter(target, event)}
            onpointerleave={() => interaction.leaveCounter(target)}
            ><span class="n">{withSign(n)}</span> {name.toUpperCase()}</span
          >
        {/each}
      </div>
    {/if}
  {/if}

  {#if selected}
    <div class="sring"></div>
  {/if}

  {#if previewer !== undefined}
    <div class="rring" style:--c={playerColorVar(previewer)}></div>
  {/if}
</div>

<style>
  /* Its own stacking, whatever its z-index: the shade under its face must never fall under the neighbouring cards. */
  .card {
    position: absolute;
    isolation: isolate;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }

  /* In touch mode, a finger swiping over the card scrolls the table: only a hold drags it. */
  :global(.app.touch) .card {
    touch-action: pan-x pan-y;
  }

  /* On a phone (dock mode), two fingers on it pinch-zoom the page. */
  :global(html.dock-screen) .card {
    touch-action: manipulation;
  }

  /*
    A hold lifts it in place (.armed) only in touch mode, where it eases up and back down, let go without a move
    or not. Pushed aside by a drag (dock mode), it glides as the surface says (--shift-glide). A ghost
    takes its own transition.
  */
  :global(.app.touch) .card:not(.ghost) {
    transition:
      scale 0.14s ease-out,
      translate var(--shift-glide, 0s) ease-out;
  }

  :global(.app.touch) .card:not(.ghost) .shade {
    transition: translate 0.14s ease-out;
  }

  /*
    The card's shadow (.shade, tokens.css) has the card's corners (CardFace), so it falls from the rounded card. The
    tabs and tokens that stick out of the card's edge cast their own.
  */
  .card.land .shade {
    border-radius: var(--card-radius-land);
  }

  .card.exhausted {
    transform: rotate(var(--exhaust-angle));
  }

  /* Around the card, where a change flashes in the colour of the player who made it (motion.svelte.ts). */
  .card::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 7px;
    pointer-events: none;
  }

  .card.lifted {
    visibility: hidden;
  }

  .card.grab {
    cursor: grab;
  }

  /*
    Armed by a hold, held up in place as its ghost will be (--lift-scale, --lift-shade), casting the lifted shadow
    (tokens.css) as its ghost does.
  */
  .card.armed {
    scale: var(--lift-scale);
    --shade-shadow: var(--lifted-card-shadow);
  }

  .card.armed .shade {
    translate: var(--lift-shade);
  }

  /*
    Held up under the pointer, lit from the top left: larger, its shadow cast further down and to
    the right. The viewer's own ghosts take their lift from the drag layer (--lift-scale and
    --lift-shade: LIFT_SCALE and LIFT_SHADE in motion.svelte.ts) and sway with the pointer about
    their middle (--sway, sway.ts), on the scale and rotate properties: apart from the transform
    of an exhausted card. Another player's are held up a little, upright, their shadow under them.
    Every ghost casts the lifted shadow (tokens.css): soft and light, so that over another card
    it falls as a soft shadow, not a dark band.
    Let go (landed), the viewer's own ghost stays held up where it landed: the view that shows
    the card settles it on the table from there (motion.svelte.ts).
    A ghost lies at its layer's corner and takes its place on translate (inline): a pointer move
    lays nothing out again. Its scale and rotate play about its own middle: the translate
    carries the ghost, lifted and leaning, to its place.
  */
  .card.ghost {
    left: 0;
    top: 0;
    cursor: grabbing;
    scale: var(--lift-scale, 1.04);
    rotate: var(--sway, 0deg);
    transition: scale 0.14s ease-out;
    --shade-shadow: var(--lifted-card-shadow);
  }

  .card.ghost .shade {
    translate: var(--lift-shade, 0px 0px);
    transition: translate 0.14s ease-out;
  }

  /*
    Picked up, the viewer's own ghost rises off the table, as the drag's first ghost only
    (.rising, DragLayer.svelte): a ghost drawn as a hand card crosses the hand's edge shows held up.
  */
  @starting-style {
    :global(.draglayer.rising) .card.ghost:not(.landed) {
      scale: 1;
    }

    :global(.draglayer.rising) .card.ghost:not(.landed) .shade {
      translate: 0px 0px;
    }
  }

  /* Without motion, it shows held up at once. */
  @media (prefers-reduced-motion: reduce) {
    .card.ghost,
    .card.ghost .shade {
      transition: none;
    }
  }

  /* Pointed at: the chip is ringed. */
  .tok.hot {
    box-shadow:
      inset 0 1px 1px #ffffff80,
      inset 0 -2px 3px #0000004d,
      0 0 0 2px #fff,
      0 2px 6px #000000a0;
  }

  .st.hot {
    box-shadow:
      0 0 0 2px #fff,
      0 2px 4px #0009;
  }

  @media (hover: hover) {
    .tok:hover {
      box-shadow:
        inset 0 1px 1px #ffffff80,
        inset 0 -2px 3px #0000004d,
        0 0 0 2px #fff,
        0 2px 6px #000000a0;
    }

    .st:hover {
      box-shadow:
        0 0 0 2px #fff,
        0 2px 4px #0009;
    }
  }

  /*
    Dock mode: the element is the card's drawn box, a fraction (--scale) of its footprint,
    and what it draws is zoomed by the same scale, so that its face, its back and its shade shrink
    alike; the percentages still fill the box.
  */
  .card.scaled > :global(*) {
    zoom: var(--scale);
  }

  /*
    Its counters are drawn at a fixed screen size instead, all their text at 11 px: their layer's
    zoom (inline, 1 / the table's) undoes the table's, so that its px are screen px, and each
    counter takes the box dockCounters.ts gives it, in three regions that never meet. The chips
    are in the font that measured them: system-ui, weight 800, 75 % wide, no letter spacing.
    Their boxes fit their whole text: nothing clips it.
  */
  .dock-counters {
    position: absolute;
    inset: 0;
    z-index: 4;
    pointer-events: none;
  }

  .dock-counters > * {
    position: absolute;
    pointer-events: auto;
  }

  .dock-counters .tok {
    font-size: 11px;
  }

  .dock-counters .st {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    white-space: pre;
    font-family: system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0;
    border-radius: 3px;
  }

  /* What does not fit: "+N", in grey. */
  .dock-counters .st.more {
    background: linear-gradient(#8a8f99, #50555f);
  }
</style>
