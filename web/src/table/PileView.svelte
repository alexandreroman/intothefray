<!--
  A pile in its portrait slot: its top card when the pile shows its cards,
  otherwise its back, with a count pill. An empty pile is a dashed slot.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { playerColorVar } from '../lib/playerColor';
  import type { PackFace, CardView as TableCard, PileView } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { dockMode } from './dockMode';
  import { DOCK_SCALE, dockCardBox } from './dockPiles';
  import { isHidden, pileBack, pileCaption } from './face';
  import { interaction, type PreviewChange } from './interaction.svelte';
  import { cardBox, pileBox } from './layout';
  import { LIFT_SCALE, LIFT_SHADE, motion } from './motion.svelte';
  import './countPill.css';

  let {
    pile,
    top,
    face = null,
    draggable = false,
    shift,
  }: {
    pile: PileView;
    /** The top card, for a pile that lists its cards. */
    top?: TableCard;
    /** The catalog face of the top card, null while unknown. */
    face?: PackFace | null;
    /** The viewer can drag from it (sourceOf): the pointer grabs it; else it only has a menu. */
    draggable?: boolean;
    /** Dock mode, during a drag (spec 3.8): how far it is drawn pushed aside with its frame, as a translate. */
    shift?: string;
  } = $props();

  // In dock mode (spec 3.7) the pile is drawn smaller, from its top-left corner, which the table
  // already draws through its projection (dockLayout.ts). The element is the drawn box: it takes the
  // presses and the drops, and the flights measure it.
  const dock = dockMode();
  const scaled = $derived(dock.current);
  const slot = $derived({ x: pile.x, y: pile.y, ...pileBox(pile) });
  const drawn = $derived(scaled ? dockCardBox(slot) : slot);

  // While a card taken from it is dragged or waits for the server, the pile counts it out; so it does
  // with the cards still flying to it.
  const arriving = $derived((pile.cards ?? []).filter((id) => motion.flying.has(id)).length);
  const count = $derived(pile.count - interaction.takenFrom(pile.id).length - arriving);
  // While a view plays on the pile (cards leaving or landing on it, a riffle), its count fades out of
  // the way and keeps the number it showed as it began: the new one shows as it comes back.
  const hushed = $derived(motion.isHushed(pile.id));
  // The count last shown unhushed, from the one the pile is drawn with: a plain variable, as a derived
  // may not write state.
  let lastShown = untrack(() => count);
  const shownCount = $derived.by(() => {
    if (hushed) {
      return lastShown;
    }
    lastShown = count;
    return count;
  });
  // An empty pile has no menu: it is inert, like an empty spot.
  const empty = $derived(count === 0);
  const targeted = $derived(
    interaction.dropOn?.kind === 'pile' && interaction.dropOn.id === pile.id,
  );
  const shownTop = $derived(empty ? undefined : top);
  // A landscape top card is turned a quarter to fit the portrait slot.
  const rotated = $derived(cardBox(face?.size ?? 'std', { onPile: true }).rotated);
  const highlighted = $derived(shownTop !== undefined && interaction.highlighted.has(shownTop.id));
  const element = $derived({ kind: 'pile', id: pile.id } as const);
  const hovered = $derived(interaction.isHovered(element));
  // A finger held it still long enough (touch mode): it lifts in place, ready to be dragged.
  const armed = $derived(interaction.isArmed(element));
  // Another player previews the pile: their ring is drawn inside it, as on a card.
  const previewer = $derived(interaction.previewerOf(pile.id));

  /** The preview shows the top card of a pile that lists its cards; a deck, which shows its back, has none. */
  const previewChange = $derived<PreviewChange>(shownTop ? 'show' : 'clear');

  function onEnter(event: PointerEvent): void {
    if (empty) {
      interaction.enterNothing(event);
    } else {
      interaction.enter(element, event, previewChange);
    }
  }
</script>

<!--
  The pointer feeds the side preview, the keys and the context menu (a click, Table.svelte): no role
  to announce.
-->
<div
  class="card pile"
  role="presentation"
  data-id={pile.id}
  class:empty
  class:inert={empty}
  class:grab={draggable}
  class:highlighted
  class:hovered
  class:armed
  class:drop-pile={targeted}
  class:scaled
  style:left="{drawn.x}px"
  style:top="{drawn.y}px"
  style:width="{drawn.w}px"
  style:height="{drawn.h}px"
  style:--scale={scaled ? DOCK_SCALE : undefined}
  style:--lift-scale={armed ? LIFT_SCALE : undefined}
  style:--lift-shade={armed ? LIFT_SHADE : undefined}
  style:translate={shift}
  onpointerenter={onEnter}
  onpointerleave={() => interaction.leave(element)}
  onpointerdown={(event) => interaction.press(element, event)}
>
  <!-- An empty pile casts no shadow. -->
  {#if !empty}
    <div class="shade"></div>
  {/if}
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
    <span class="count count-pill" class:hushed aria-hidden={hushed ? 'true' : undefined}
      >{shownCount}</span
    >
  {/if}

  {#if previewer !== undefined}
    <div class="rring" style:--c={playerColorVar(previewer)}></div>
  {/if}
</div>

<style>
  /*
   * At level 0, table cards (server z from 0, drawn after the piles) stay on top of it. A riffle lifts the pile to 1
   * while it plays, over its neighbouring piles.
   */
  .card {
    position: absolute;
    z-index: 0;
    /* Something to drag (.grab), or else a menu to open a box from; nothing on an inert pile. */
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }

  /* In touch mode, a finger swiping over the pile scrolls the table: only a hold drags from it (spec 3.2). */
  :global(.app.touch) .card {
    touch-action: pan-x pan-y;
  }

  /*
    A hold lifts it in place (.armed) only in touch mode: it eases up, and back down when let go, moved or not.
    Pushed aside with its frame by a drag (dock mode, spec 3.8), it glides as the surface says (--shift-glide).
  */
  :global(.app.touch) .card {
    transition:
      scale 0.14s ease-out,
      translate var(--shift-glide, 0s) ease-out;
  }

  :global(.app.touch) .card .shade {
    transition: translate 0.14s ease-out;
  }

  /*
    The same 45° shadow as a card on the table, cast from 2px inside its edge, under its face (see --card-shadow). A
    pile's slot is always portrait: a landscape top card is turned to fit it, and rounded with the portrait corners.
  */
  .shade {
    position: absolute;
    inset: 2px;
    z-index: -1;
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
    pointer-events: none;
  }

  .card.grab {
    cursor: grab;
  }

  .card.inert {
    cursor: default;
  }

  /* Armed by a hold, held up in place as the card dragged from it will be (--lift-scale, --lift-shade). */
  .card.armed {
    scale: var(--lift-scale);
  }

  .card.armed .shade {
    translate: var(--lift-shade);
  }

  .art {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .slot {
    width: 100%;
    height: 100%;
    border-radius: 5px;
    border: 2px dashed var(--line);
  }

  /*
    Over everything the pile draws: its card, and the rings the table draws over it (hover,
    selection, highlight, drop, z-index 1 in Table.svelte), all inside the pile's own stacking.
  */
  .count {
    position: absolute;
    z-index: 2;
    bottom: -7px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 9px;
    padding: 0 6px;
    /* A quick fade out of the way of the cards an animation plays over the pile, and back once done. */
    transition: opacity 0.12s ease-out;
  }

  .count.hushed {
    opacity: 0;
  }

  /*
    Dock mode: the element is the pile's drawn box. What it draws is zoomed by the same scale, so
    that the back's label and caption, the borders and the corners shrink with it; the percentages
    still fill the box. The count keeps 9 screen px of text however far the table zooms out (--z), as
    the name lines do (Surface).
  */
  .card.scaled > .shade,
  .card.scaled > .art,
  .card.scaled > .slot {
    zoom: var(--scale);
  }

  .card.scaled .count {
    bottom: -0.8em;
    font-size: max(9px, 9px / var(--z, 1));
    padding: 0 0.67em;
  }
</style>
