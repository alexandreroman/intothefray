<!--
  The copies of cards flying from where they were to the pile they went to
  (spec 5.5: discards animate to the owner's pile), above everything, the
  pointer passing through them.
-->
<script lang="ts">
  import type { PackFace, CardView as TableCard } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { isHidden } from './face';
  import { motion } from './motion.svelte';

  let {
    faceOf,
  }: {
    /** The catalog face a card shows, null while unknown or hidden. */
    faceOf: (card: TableCard | undefined) => PackFace | null;
  } = $props();
</script>

{#each motion.flights as flight (flight.key)}
  {@const face = faceOf(flight.card)}
  <div
    class="fly"
    aria-hidden="true"
    style:left="{flight.from.cx - flight.from.w / 2}px"
    style:top="{flight.from.cy - flight.from.h / 2}px"
    style:width="{flight.from.w}px"
    style:height="{flight.from.h}px"
    {@attach (element) => motion.launch(element, flight)}
  >
    {#if isHidden(flight.card)}
      <CardBack back={flight.card.back} />
    {:else}
      <CardFace
        images={face?.images ?? []}
        name={face?.name ?? ''}
        landscape={face?.size === 'land' || face?.size === 'dland'}
      />
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
</style>
