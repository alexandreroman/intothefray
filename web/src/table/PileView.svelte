<!--
  A pile in its portrait slot: its top card when the pile shows its cards,
  otherwise its back, with a count pill. An empty pile is a dashed slot.
  Out-of-play piles (victory display, set aside) sit in a sunken tray, greyed,
  with a badge on their top edge.
-->
<script lang="ts">
  import type { PackFace, CardView as TableCard, PileKind, PileView } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { isHidden, pileBack } from './face';
  import { interaction, type PreviewChange } from './interaction.svelte';
  import { cardBox } from './layout';
  import { motion } from './motion.svelte';

  let {
    pile,
    top,
    face = null,
    foreign = false,
  }: {
    pile: PileView;
    /** The top card, for a pile that lists its cards. */
    top?: TableCard;
    /** The catalog face of the top card, null while unknown. */
    face?: PackFace | null;
    /** Another player's pile. */
    foreign?: boolean;
  } = $props();

  const BADGES: Partial<Record<PileKind, string>> = {
    victory: 'Victory display',
    aside: 'Set-aside cards',
  };

  const SLOT = cardBox('std', {});

  // While a card taken from it is dragged or waits for the server, the pile counts it out; so it does
  // with the cards still flying to it.
  const arriving = $derived((pile.cards ?? []).filter((id) => motion.flying.has(id)).length);
  const count = $derived(pile.count - interaction.takenFrom(pile.id).length - arriving);
  const empty = $derived(count === 0);
  const targeted = $derived(
    interaction.dropOn?.kind === 'pile' && interaction.dropOn.id === pile.id,
  );
  const shownTop = $derived(empty ? undefined : top);
  const badge = $derived(BADGES[pile.kind]);
  // A landscape top card is turned a quarter to fit the portrait slot.
  const rotated = $derived(cardBox(face?.size ?? 'std', { onPile: true }).rotated);
  const highlighted = $derived(shownTop !== undefined && interaction.highlighted.has(shownTop.id));
  const element = $derived({ kind: 'pile', id: pile.id } as const);
  const locked = $derived(interaction.isLocked(element));

  /**
   * The preview shows the top card of a pile that lists its cards. A deck
   * shows nothing new, so the preview keeps the card seen before, unless the
   * deck is another player's.
   */
  const previewChange = $derived<PreviewChange>(shownTop ? 'show' : foreign ? 'clear' : 'keep');

  // An empty pile is like an empty spot.
  function onEnter(event: PointerEvent): void {
    if (empty) {
      interaction.enterNothing(event);
    } else {
      interaction.enter(element, event, previewChange);
    }
  }

  function onTap(): void {
    if (!empty) {
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
  class:inert={empty}
  class:out={badge !== undefined}
  class:highlighted
  class:locked
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
    {@const back = shownTop?.back ?? pileBack(pile.kind)}
    <div class="art">
      <CardBack {back} label={back.toUpperCase()} />
    </div>
  {/if}

  {#if !empty}
    <span class="count">{count}</span>
  {/if}

  {#if badge}
    <span class="badge" role="img" aria-label={badge} title={badge}>
      {#if pile.kind === 'victory'}
        <!-- A trophy. -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
          <path d="M8 6H5a2 2 0 0 0 2 4h1" />
          <path d="M16 6h3a2 2 0 0 1-2 4h-1" />
          <path d="M12 13v4" />
          <path d="M8 20h8" />
          <path d="M10 17h4" />
        </svg>
      {:else}
        <!-- An hourglass: the cards wait to come into play later. -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 3h12" />
          <path d="M6 21h12" />
          <path d="M7 3c0 5 5 6 5 9s-5 4-5 9" />
          <path d="M17 3c0 5-5 6-5 9s5 4 5 9" />
          <path d="M9.5 18.5h5" stroke-width="2.4" />
        </svg>
      {/if}
    </span>
  {/if}
</div>

<style>
  /*
    Its own stacking context keeps the out-of-play tray (z-index -1) and the badge inside the pile.
    At level 0, table cards (server z from 0, drawn after the piles) stay on top of it.
  */
  .card {
    position: absolute;
    z-index: 0;
    border-radius: 6px;
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

  .count {
    position: absolute;
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

  /* Out of play: a sunken tray with a dashed rim, and its cards washed out to greys. */
  .card.out {
    filter: none;
  }

  .card.out::after {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 12px;
    border: 1.5px dashed #3a4566;
    background: #0a0e17b0;
    box-shadow: inset 0 2px 8px #000c;
    z-index: -1;
    pointer-events: none;
  }

  .card.out .art {
    filter: grayscale(0.85) brightness(0.72);
    opacity: 0.9;
  }

  /* The tray already draws the dashed rim. */
  .card.out .slot {
    border-color: transparent;
  }

  .card.out .count {
    background: #0b0f18;
    color: var(--muted);
  }

  /* The badge sits on the top edge, centred, in greys. */
  .badge {
    position: absolute;
    top: -13px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #0b0f18;
    border: 1px solid #3a4870;
    box-shadow: 0 2px 6px #000a;
  }

  .badge svg {
    width: 15px;
    height: 15px;
    color: #b3b9c6;
  }
</style>
