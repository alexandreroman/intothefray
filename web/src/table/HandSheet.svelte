<!--
  The viewer's hand in dock mode: a bottom sheet with the cards in a
  carousel that snaps each card to the middle. The centred card shows at full
  size, the others smaller and dimmed; Play, Discard and More… act on it.

  The carousel scrolls sideways only (touch-action: pan-x), so a finger moving
  up on a card is a press the drag layer turns into a drag of that card, as on
  the fan: the carousel is marked up like Hand.svelte (.hand with the seat,
  .hcard with its id, .fan holding the face), where DragLayer.svelte measures
  the card and its slots. Its data-carousel tells the drag layer that a finger
  moving sideways scrolls it rather than drags the card, as the fan's would.
  The sheet closes once the drag starts, and the card goes on to the table
  under the finger.

  The sheet uses the whole screen (Sheet.svelte's dock mode). Upright, a
  one-line header, the card as large as fits, and the actions under it. On
  its side, the carousel on the left with cards as high as the sheet, and the
  header and the stacked actions in a column on its right.
-->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import Sheet from '../components/Sheet.svelte';
  import type { CardView as TableCard, PackFace } from '../lib/types';
  import CardFace from './CardFace.svelte';
  import { dockMode } from './dockMode';
  import { interaction } from './interaction.svelte';
  import { cardBox } from './layout';

  let {
    cards,
    faceOf,
    seat,
    area,
    landscape,
    picker,
    onplay,
    ondiscard,
    onmore,
    onclose,
  }: {
    /** The hand, in its order. */
    cards: TableCard[];
    /** The catalog face a card shows, null while unknown. */
    faceOf: (card: TableCard) => PackFace | null;
    /** The seat whose hand this is. */
    seat: number;
    /** The seat's area ("p1"), where its hand cards live. */
    area: string;
    /** The screen is in landscape: the cards are sized from the sheet's height, not its width. */
    landscape: boolean;
    /** The hero selector, shown in the header with 2+ own decks. */
    picker?: Snippet;
    onplay: (id: string) => void;
    ondiscard: (id: string) => void;
    /** Opens the inspector of the card. */
    onmore: (id: string) => void;
    onclose: () => void;
  } = $props();

  const dock = dockMode();

  let carousel: HTMLElement | undefined = $state();

  // The index of the card snapped to the middle of the carousel. Kept in range when cards leave:
  // after a Play, the next card slides into the middle, and that index names it.
  let centred = $state(0);
  const current = $derived(cards[Math.min(centred, cards.length - 1)]);

  /** Finds the card nearest the middle of the carousel, after a scroll. */
  function findCentred(): void {
    if (!carousel) {
      return;
    }
    const box = carousel.getBoundingClientRect();
    const middle = box.left + box.width / 2;
    let nearest = 0;
    let nearestDistance = Infinity;
    for (const [i, item] of [...carousel.querySelectorAll('.hcard')].entries()) {
      const rect = item.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - middle);
      if (distance < nearestDistance) {
        nearest = i;
        nearestDistance = distance;
      }
    }
    centred = nearest;
  }

  // A press on a card that became a drag: the sheet makes way for the table.
  $effect(() => {
    if (interaction.dragging !== null) {
      untrack(onclose);
    }
  });

  /** Runs an action on the centred card. */
  function act(action: (id: string) => void): void {
    if (current) {
      action(current.id);
    }
  }
</script>

<!-- Not modal: a modal sheet would freeze the table, and no press on a card could become a drag. -->
<Sheet label="Your hand" modal={false} dock={dock.current} {onclose}>
  <div class="body" class:landscape>
    <header>
      {@render picker?.()}
      <b class="title">Your hand · {cards.length}</b>
    </header>

    {#if cards.length === 0}
      <p class="empty">No cards in hand</p>
    {:else}
      <div class="stage">
        <ul
          class="hand"
          aria-label="Cards in hand"
          data-carousel
          data-seat={seat}
          data-area={area}
          bind:this={carousel}
          onscroll={findCentred}
        >
          {#each cards as card (card.id)}
            {@const face = faceOf(card)}
            <li
              class="hcard"
              class:dim={card !== current}
              data-id={card.id}
              aria-current={card === current ? 'true' : undefined}
              onpointerdown={(event) => interaction.press({ kind: 'hand', id: card.id }, event)}
            >
              <div class="fan">
                <!-- A landscape card is turned a quarter to fit the portrait slot. -->
                <CardFace
                  images={face?.images ?? []}
                  name={face?.name ?? ''}
                  rotated={cardBox(face?.size ?? 'std', { onPile: true }).rotated}
                />
              </div>
            </li>
          {/each}
        </ul>

        <div class="dots" aria-hidden="true">
          {#each cards as card (card.id)}
            <i class:on={card === current}></i>
          {/each}
        </div>
      </div>

      <div class="actions">
        <button type="button" class="play" onclick={() => act(onplay)}>Play</button>
        <button type="button" onclick={() => act(ondiscard)}>Discard</button>
        <button type="button" onclick={() => act(onmore)}>More…</button>
      </div>
      <p class="hint">or drag a card up onto the table · swipe down to close</p>
    {/if}
  </div>
</Sheet>

<style>
  /*
    Upright: the header, the carousel, the actions and the hint, one under the
    other. A card is as high as the sheet's room (Sheet.svelte's --sheet-room)
    less the rest of the sheet (--chrome), and at most 80 % of its width.
  */
  .body {
    --chrome: 156px;
    --card-h: calc(var(--sheet-room, 85dvh) - var(--chrome));
    --card-w: min(80%, calc(var(--card-h) * 185 / 259));
    --gap: 10px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'head'
      'stage'
      'actions'
      'hint';
  }

  /* On its side: the carousel on the left, as high as the sheet; the rest in a column on its right. */
  .body.landscape {
    --chrome: 32px;
    --card-w: calc(var(--card-h) * 185 / 259);
    grid-template-columns: minmax(0, 1fr) 180px;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      'stage head'
      'stage .'
      'stage actions';
    column-gap: 12px;
  }

  header {
    grid-area: head;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding-bottom: 4px;
    white-space: nowrap;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 16px;
    font-weight: 800;
    text-overflow: ellipsis;
  }

  .stage {
    grid-area: stage;
    min-width: 0;
  }

  .empty {
    grid-area: stage;
    margin: 24px 0 36px;
    color: var(--muted);
    text-align: center;
  }

  /* Sideways only: a vertical move on a card is the card's drag (DragLayer.svelte). */
  .hand {
    display: flex;
    gap: var(--gap);
    margin: 0;
    padding: 6px 0 4px;
    list-style: none;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    touch-action: pan-x;
  }

  .hand::-webkit-scrollbar {
    display: none;
  }

  /*
    Room before the first card and after the last one, so that both can snap to the middle. Flex
    items rather than padding: some browsers leave a scroller's end padding out of its scroll.
  */
  .hand::before,
  .hand::after {
    content: '';
    flex: none;
    width: calc((100% - var(--card-w)) / 2 - var(--gap));
  }

  .hcard {
    position: relative;
    flex: none;
    width: var(--card-w);
    aspect-ratio: 185 / 259;
    scroll-snap-align: center;
    touch-action: pan-x;
  }

  .fan {
    width: 100%;
    height: 100%;
    pointer-events: none;
    filter: drop-shadow(4px 8px 12px #000000c0);
    transition:
      transform 0.2s,
      opacity 0.2s;
  }

  .hcard.dim .fan {
    transform: scale(0.9);
    opacity: 0.55;
  }

  .dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    margin: 8px 0 4px;
  }

  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: var(--line-strong);
    transition: width 0.2s;
  }

  .dots i.on {
    width: 16px;
    background: var(--text);
  }

  .actions {
    grid-area: actions;
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
  }

  .body.landscape .actions {
    grid-template-columns: 1fr;
    margin-top: 0;
  }

  .actions button {
    min-height: 48px;
    border: 0;
    border-radius: 14px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 15px;
    font-weight: 800;
  }

  .actions .play {
    background: var(--accent);
    color: #140605;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    transform: skewX(-8deg);
  }

  .hint {
    grid-area: hint;
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 12.5px;
    text-align: center;
  }

  /* No room for it beside the carousel: the actions say what a card can do. */
  .body.landscape .hint {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .fan,
    .dots i {
      transition: none;
    }
  }
</style>
