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
  mode a copy flies at the size the table draws its cards and
  piles at, and what it shows is zoomed alike; a card discarded or played
  from the viewer's hand rises and fades out where it was seen: drawn as the
  hand sheet draws it (a landscape card turned a quarter), at the table's
  zoom from the dock's hand button. A card drawn into the viewer's hand, or
  taken back into it off the table, flies to the dock's hand button or to its
  deck's hero selector entry when no hand sheet shows its hand, and over the
  hand sheet into its carousel slot when one does (into the sheet's hand
  size when that slot lies out of sight).
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
    class:over={flight.kind === 'draw' && flight.overSheet}
    class:land={flight.from.w > flight.from.h}
    aria-hidden="true"
    style:--scale={scaled(flight) ? DOCK_SCALE : undefined}
    style:left="{flight.from.cx - flight.from.w / 2}px"
    style:top="{flight.from.cy - flight.from.h / 2}px"
    style:width="{flight.from.w}px"
    style:height="{flight.from.h}px"
    {@attach (element) => motion.launch(element, flight)}
  >
    <div class="shade"></div>
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
      {@render portrait(flight.card)}
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
  }

  /*
    Its shadow, as a hand card casts it (see --held-card-shadow), from 2px inside its edge, under what it shows: it
    turns, shrinks and fades with the copy, drawn once. Its corners are those of the copy's box, which is the card's
    as it was measured, landscape for a landscape card lying on the table; a quarter turn on the way turns it along.
  */
  .shade {
    position: absolute;
    inset: 2px;
    z-index: -1;
    border-radius: var(--card-radius);
    box-shadow: var(--held-card-shadow);
    pointer-events: none;
  }

  .fly.land .shade {
    border-radius: var(--card-radius-land);
  }

  /*
    A card discarded or played from the hand in dock mode rises out of the sheet that showed it
    (Sheet.svelte, 5500), and one drawn into the hand lands in that sheet (its carousel, its hand
    size or its hero selector): over it, under the dialogs (5600).
  */
  .fly.rise,
  .fly.over {
    z-index: 5550;
  }

  /*
    Dock mode: the copy is the card's drawn box. What it shows is zoomed by the same scale, so that a
    back's label and caption, the borders and the corners shrink with it; the percentages still fill
    the box. A turning side is sized in px for an upright quarter turn: only what it holds is zoomed.
    The shade is not: the copy casts the hand's shadow at any scale.
  */
  .fly.scaled > :global(*:not(.side, .shade)),
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
