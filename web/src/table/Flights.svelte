<!--
  The copies of cards flying to and out of piles, above everything, the
  pointer passing through them: a card flying from where it was, from where
  the viewer let it go, or from the pile it left, to the pile it went to
  (spec 5.5: discards animate to the owner's pile), turning over on the way
  when it lands on another side: face up out of a face-down pile, face down
  into a deck. A landscape card going to a portrait pile turns a quarter on
  its way, as the pile draws it, and turns over once there. Then a card
  drawn flying from its pile to its slot in the viewer's hand; a card going
  into a hand the viewer does not see leaving its pile or its spot on the
  table; and a card coming out of such a hand rising into its pile. In dock
  mode (spec 3.6) a copy flies at the size the table draws its cards and
  piles at, and what it shows is zoomed alike; a card discarded from the
  viewer's hand rises and fades out where it was seen: drawn as the hand
  sheet or the inspector draws it, or, from the dock's hand button, as the
  table does.
-->
<script lang="ts">
  import type { PackFace, CardView as TableCard } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { dockMode } from './dockMode';
  import { DOCK_SCALE } from './dockPiles';
  import { isHidden } from './face';
  import { cardBox, isLandscape } from './layout';
  import { motion } from './motion.svelte';

  let {
    faceOf,
    captionOf,
  }: {
    /** The catalog face a card shows, null while unknown or hidden. */
    faceOf: (card: TableCard | undefined) => PackFace | null;
    /** The caption of a card's back (backCaption): its side deck's label, if any. */
    captionOf: (card: TableCard) => string | undefined;
  } = $props();

  // A copy's box is the drawn box it was measured at: in dock mode, what it shows shrinks with it.
  const dock = dockMode();

  /** Whether a copy is drawn as the table draws its cards in dock mode: not one rising out of a sheet. */
  function scaled(flight: (typeof motion.flights)[number]): boolean {
    if (flight.kind === 'rise') {
      return flight.zoomed;
    }
    return dock.current;
  }
</script>

<!-- A card in a portrait slot, as a pile and the hand draw it: a landscape card is turned a quarter. -->
{#snippet portrait(card: TableCard)}
  {@const face = faceOf(card)}
  <CardFace
    images={face?.images ?? []}
    name={face?.name ?? ''}
    rotated={cardBox(face?.size ?? 'std', { onPile: true }).rotated}
  />
{/snippet}

<!-- A card as the table or the hand draws it: a landscape card lies landscape. -->
{#snippet placed(card: TableCard)}
  {@const face = faceOf(card)}
  <CardFace
    images={face?.images ?? []}
    name={face?.name ?? ''}
    landscape={face ? isLandscape(face.size) : false}
  />
{/snippet}

<!--
  Its back, over its face until it turns edge-on, or, turning face down
  (hidden), from then on (motion.launch). On a landscape copy that turns a
  quarter on its way to a portrait pile (upright, the copy's size), it is a
  portrait card turned the other way, upright once the copy has turned.
-->
{#snippet turningBack(
  card: TableCard,
  hidden = false,
  upright: { w: number; h: number } | null = null,
)}
  <div
    class="side"
    class:upright={upright !== null}
    data-side="back"
    style:opacity={hidden ? 0 : undefined}
    style:width={upright ? `${upright.h}px` : undefined}
    style:height={upright ? `${upright.w}px` : undefined}
  >
    <CardBack back={card.back} caption={captionOf(card)} />
  </div>
{/snippet}

{#each motion.flights as flight (flight.key)}
  <div
    class="fly"
    class:scaled={scaled(flight)}
    class:rise={flight.kind === 'rise'}
    aria-hidden="true"
    style:--scale={scaled(flight) ? DOCK_SCALE : undefined}
    style:left="{flight.from.cx - flight.from.w / 2}px"
    style:top="{flight.from.cy - flight.from.h / 2}px"
    style:width="{flight.from.w}px"
    style:height="{flight.from.h}px"
    {@attach (element) => motion.launch(element, flight)}
  >
    {#if flight.kind === 'toPile'}
      {#if isHidden(flight.card)}
        <CardBack back={flight.card.back} caption={captionOf(flight.card)} />
      {:else}
        {@render (flight.asOnPile ? portrait : placed)(flight.card)}
        {#if flight.turns}
          {@render turningBack(
            flight.card,
            flight.turns === 'down',
            flight.quarter ? flight.from : null,
          )}
        {/if}
      {/if}
    {:else if flight.kind === 'rise'}
      {@render (flight.portrait ? portrait : placed)(flight.card)}
    {:else if flight.kind === 'draw'}
      {@render portrait(flight.card)}
      {#if !flight.faceUp}
        {@render turningBack(flight.card)}
      {/if}
    {:else if flight.card && !isHidden(flight.card)}
      <!-- Taken off the table, it shows as the table drew it. -->
      {@render (flight.kind === 'drawAway' && flight.pile === undefined ? placed : portrait)(
        flight.card,
      )}
    {:else}
      {@const caption = flight.card ? captionOf(flight.card) : flight.caption}
      <CardBack back={flight.card?.back ?? flight.back} {caption} />
    {/if}
  </div>
{/each}

<style>
  .fly {
    position: fixed;
    z-index: 2900;
    pointer-events: none;
    transform-origin: center;
    filter: drop-shadow(2px 2px 3px #000000a0) drop-shadow(7px 7px 10px #00000060);
  }

  /*
    A card discarded from the hand in dock mode rises out of the sheet that showed it (Sheet.svelte,
    5500): over it, under the dialogs (5600).
  */
  .fly.rise {
    z-index: 5550;
  }

  /*
    Dock mode: the copy is the card's drawn box. What it shows is zoomed by the same scale, so that a
    back's label and caption, the borders and the corners shrink with it; the percentages still fill
    the box. A turning side is sized in px for an upright quarter turn: only what it holds is zoomed.
  */
  .fly.scaled > :global(*:not(.side)),
  .fly.scaled > .side > :global(*) {
    zoom: var(--scale);
  }

  .side {
    position: absolute;
    inset: 0;
  }

  .side.upright {
    inset: auto;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) rotate(90deg);
  }
</style>
