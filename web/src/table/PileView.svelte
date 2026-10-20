<!--
  A pile in its portrait slot: its top card when the pile shows its cards,
  otherwise its back, with a count pill. An empty pile is a dashed slot.
-->
<script lang="ts">
  import type { PackFace, CardView as TableCard, PileView } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { isHidden, pileBack, pileCaption } from './face';
  import { interaction, type PreviewChange } from './interaction.svelte';
  import { cardBox } from './layout';
  import { motion } from './motion.svelte';

  let {
    pile,
    top,
    face = null,
    barWhenEmpty = false,
    draggable = false,
  }: {
    pile: PileView;
    /** The top card, for a pile that lists its cards. */
    top?: TableCard;
    /** The catalog face of the top card, null while unknown. */
    face?: PackFace | null;
    /** Empty, it still has a bar: the buttons opening its owner's out-of-play piles. */
    barWhenEmpty?: boolean;
    /** The viewer can drag from it (sourceOf): the pointer grabs it; else it only has a bar. */
    draggable?: boolean;
  } = $props();

  const SLOT = cardBox('std', {});

  // While a card taken from it is dragged or waits for the server, the pile counts it out; so it does
  // with the cards still flying to it.
  const arriving = $derived((pile.cards ?? []).filter((id) => motion.flying.has(id)).length);
  const count = $derived(pile.count - interaction.takenFrom(pile.id).length - arriving);
  const empty = $derived(count === 0);
  // An empty pile without a bar is like an empty spot.
  const inert = $derived(empty && !barWhenEmpty);
  const targeted = $derived(
    interaction.dropOn?.kind === 'pile' && interaction.dropOn.id === pile.id,
  );
  const shownTop = $derived(empty ? undefined : top);
  // A landscape top card is turned a quarter to fit the portrait slot.
  const rotated = $derived(cardBox(face?.size ?? 'std', { onPile: true }).rotated);
  const highlighted = $derived(shownTop !== undefined && interaction.highlighted.has(shownTop.id));
  const element = $derived({ kind: 'pile', id: pile.id } as const);
  const locked = $derived(interaction.isLocked(element));
  const hovered = $derived(interaction.isHovered(element));
  // Another player previews the pile: their ring is drawn inside it, as on a card.
  const previewer = $derived(interaction.previewerOf(pile.id));

  /** The preview shows the top card of a pile that lists its cards; a deck, which shows its back, has none. */
  const previewChange = $derived<PreviewChange>(shownTop ? 'show' : 'clear');

  function onEnter(event: PointerEvent): void {
    if (inert) {
      interaction.enterNothing(event);
    } else {
      interaction.enter(element, event, previewChange);
    }
  }

  function onTap(): void {
    if (!inert) {
      interaction.select(element, previewChange);
    }
  }
</script>

<!-- The pointer feeds the side preview and the action bar: no role to announce. -->
<div
  class="card pile"
  role="presentation"
  data-id={pile.id}
  class:empty
  class:inert
  class:grab={draggable}
  class:highlighted
  class:locked
  class:hovered
  class:drop-pile={targeted}
  style:left="{pile.x}px"
  style:top="{pile.y}px"
  style:width="{SLOT.w}px"
  style:height="{SLOT.h}px"
  onpointerenter={onEnter}
  onpointerleave={() => interaction.leave()}
  onpointerdown={(event) => interaction.press(element, event)}
  onclick={onTap}
>
  {#if empty}
    <div class="slot"></div>
  {:else if shownTop && !isHidden(shownTop)}
    <div class="art">
      <CardFace images={face?.images ?? []} name={face?.name ?? ''} {rotated} />
    </div>
  {:else}
    {@const back = shownTop?.back ?? pileBack(pile)}
    <div class="art">
      <CardBack {back} label={back.toUpperCase()} caption={pileCaption(pile)} />
    </div>
  {/if}

  {#if !empty}
    <span class="count">{count}</span>
  {/if}

  {#if previewer !== undefined}
    <div class="rring" style:--c="var(--p{previewer + 1})"></div>
  {/if}
</div>

<style>
  /* At level 0, table cards (server z from 0, drawn after the piles) stay on top of it. */
  .card {
    position: absolute;
    z-index: 0;
    border-radius: 6px;
    /* Something to drag (.grab), or else a bar to open a box from; nothing on an inert pile. */
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    /* The same 45° shadow as a card on the table. */
    filter: drop-shadow(2px 2px 2px #000000c8) drop-shadow(6px 6px 9px #000000a6)
      drop-shadow(12px 12px 16px #00000059);
  }

  .card.empty {
    filter: none;
  }

  .card.grab {
    cursor: grab;
  }

  .card.inert {
    cursor: default;
  }

  .art {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .slot {
    width: 100%;
    height: 100%;
    border-radius: 6px;
    border: 2px dashed var(--line);
  }

  /*
    Over everything the pile draws: its card, and the rings the table draws over it (hover,
    selection, highlight, drop, z-index 1 in Table.svelte), all inside the pile's own stacking.
  */
  .count {
    position: absolute;
    z-index: 2;
    bottom: -9px;
    left: 50%;
    transform: translateX(-50%);
    background: #000c;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 11px;
    padding: 0 7px;
    white-space: nowrap;
  }
</style>
