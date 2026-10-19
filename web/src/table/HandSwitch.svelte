<!--
  The hand switcher (spec 5), on top of the hand of a player with several
  decks: one swatch per own deck, with its hero and hand count. The selected
  deck's hand is the one shown; a click selects another (Q steps through them).
-->
<script lang="ts">
  import { selectionIndicator } from '../lib/selectionIndicator';

  /** One of the viewer's decks, as the switcher shows it. */
  interface DeckSwatch {
    seat: number;
    /** The deck's hero. */
    name: string;
    handCount: number;
  }

  let {
    decks,
    selected,
    color,
    onselect,
  }: {
    decks: DeckSwatch[];
    /** The seat whose hand shows. */
    selected: number;
    /** The player's colour index: one player, one colour for all their decks. */
    color: number;
    onselect: (seat: number) => void;
  } = $props();

  function handLabel(deck: DeckSwatch): string {
    return `${deck.name}: ${deck.handCount} ${deck.handCount === 1 ? 'card' : 'cards'} in hand`;
  }
</script>

<div
  class="handswitch"
  role="group"
  aria-label="Hand shown"
  style:--seat="var(--p{color + 1})"
  use:selectionIndicator
>
  <span class="indicator" data-indicator aria-hidden="true"></span>
  {#each decks as deck (deck.seat)}
    <button
      class="btn-ghost deck"
      aria-pressed={deck.seat === selected}
      aria-label={handLabel(deck)}
      data-tip={handLabel(deck)}
      onclick={() => onselect(deck.seat)}
    >
      <span class="hero">{deck.name}</span>
      <span class="count">{deck.handCount}</span>
    </button>
  {/each}
</div>

<style>
  /* A raised strip, as the other controls over the table. */
  .handswitch {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: #141a28eb;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 6px 16px #0008;
    max-width: 100%;
    pointer-events: auto;
  }

  /* Over the indicator, which is positioned. */
  .deck {
    position: relative;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    color: var(--muted);
  }

  /* The deck whose hand shows: lit, over a surface underlined in the player's colour. */
  .indicator {
    border-radius: 8px;
    background: var(--panel-2);
    box-shadow: inset 0 -2px 0 var(--seat);
  }

  .deck[aria-pressed='true'] {
    color: var(--text);
  }

  /*
    The hero stays on one line, cut short with an ellipsis. No overflowTip here: the swatch's own
    tooltip already names the hero in full.
  */
  .hero {
    min-width: 0;
    max-width: 12em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .count {
    flex: none;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--line);
    font-size: 11px;
    line-height: 18px;
    text-align: center;
  }
</style>
