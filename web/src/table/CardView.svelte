<!--
  One card lying on the table: its face (or its back when hidden), placed in
  table units, with its tokens and statuses.
-->
<script lang="ts">
  import type { PackFace, CardView as TableCard } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { isHidden } from './face';
  import { interaction } from './interaction.svelte';
  import { cardBox } from './layout';

  let {
    card,
    face,
    ghost = false,
    landed = false,
  }: {
    card: TableCard;
    /** The catalog face the card shows, null while unknown: it is then a std placeholder. */
    face: PackFace | null;
    /** The copy drawn under the pointer while the card is dragged (DragLayer). */
    ghost?: boolean;
    /** A ghost set down where the card was dropped, until the server answers. */
    landed?: boolean;
  } = $props();

  type TokenKind = 'dmg' | 'thr' | 'gen';

  // On a scheme, threat sits in the top right corner and the other tokens pile up from the bottom
  // right one; on any other card, every token sits in the middle.
  const ALL_TOKENS: readonly TokenKind[] = ['dmg', 'thr', 'gen'];
  const CORNER_TOKENS: readonly TokenKind[] = ['dmg', 'gen'];
  const SCHEME_TYPES: readonly string[] = ['main_scheme', 'side_scheme', 'player_side_scheme'];
  const STATUSES = [
    ['stunned', 'Stunned'],
    ['confused', 'Confused'],
    ['tough', 'Tough'],
  ] as const;

  const hidden = $derived(isHidden(card));
  const box = $derived(cardBox(face?.size ?? 'std', { faceDown: hidden, onPile: !!card.onPile }));
  const landscape = $derived(!box.rotated && box.w > box.h);
  // A hidden card has no face: it is not known to be a scheme.
  const scheme = $derived(!hidden && SCHEME_TYPES.includes(face?.type ?? ''));
  const hasToken = (k: TokenKind) => (card.tokens?.[k] ?? 0) > 0;
  const middleTokens = $derived(scheme ? [] : ALL_TOKENS.filter(hasToken));
  const cornerTokens = $derived(scheme ? CORNER_TOKENS.filter(hasToken) : []);
  const cornerThreat = $derived(scheme && hasToken('thr'));
  const statuses = $derived(STATUSES.filter(([k]) => (card.status?.[k] ?? 0) > 0));
  const element = $derived({ kind: 'card', id: card.id } as const);
  const locked = $derived(interaction.isLocked(element));
  // A ghost is a copy: only the card on the table shows that it is hovered.
  const hovered = $derived(!ghost && interaction.isHovered(element));
  // While dragged, the card on the table makes way for its ghost.
  const lifted = $derived(!ghost && interaction.isLifted(card.id));
  // A drop would tuck the dragged card under this one, or go onto the pile this card is revealed on.
  const dropOn = $derived(ghost ? null : interaction.dropOn);
  const tuckTarget = $derived(dropOn?.kind === 'card' && dropOn.id === card.id);
  const pileTarget = $derived(dropOn?.kind === 'pile' && dropOn.id === card.onPile);
</script>

{#snippet token(k: TokenKind)}
  {@const target = { card: card.id, kind: 'token', name: k } as const}
  <span
    class="tok {k}"
    class:hot={interaction.isCounter(target)}
    data-counter="token:{k}"
    role="presentation"
    onpointerenter={(event) => interaction.enterCounter(target, event)}
    onpointerleave={() => interaction.leaveCounter()}>{card.tokens?.[k]}</span
  >
{/snippet}

<!--
  z-index comes from the server and can be negative: the surface must isolate its stacking.
  The pointer feeds the side preview and the action bar: no role to announce.
-->
<div
  class="card"
  role="presentation"
  data-id={card.id}
  class:exhausted={card.exhausted}
  class:highlighted={interaction.highlighted.has(card.id)}
  class:locked
  class:hovered
  class:land={landscape}
  class:scheme
  class:lifted
  class:ghost
  class:landed
  class:drop-target={tuckTarget}
  class:drop-pile={pileTarget}
  style:left="{card.x}px"
  style:top="{card.y}px"
  style:width="{box.w}px"
  style:height="{box.h}px"
  style:z-index={card.z}
  onpointerenter={(event) => interaction.enter(element, event)}
  onpointerleave={() => interaction.leave()}
  onpointerdown={(event) => interaction.press(element, event)}
  onclick={() => interaction.select(element)}
>
  {#if hidden}
    <CardBack back={card.back} />
  {:else}
    <CardFace
      images={face?.images ?? []}
      name={face?.name ?? ''}
      {landscape}
      rotated={box.rotated}
    />
  {/if}

  {#if middleTokens.length > 0}
    <div class="tokens middle">
      {#each middleTokens as k (k)}
        {@render token(k)}
      {/each}
    </div>
  {/if}

  {#if cornerTokens.length > 0}
    <div class="tokens bottom-right">
      {#each cornerTokens as k (k)}
        {@render token(k)}
      {/each}
    </div>
  {/if}

  {#if cornerThreat}
    <div class="tokens top-right">
      {@render token('thr')}
    </div>
  {/if}

  {#if statuses.length > 0}
    <div class="statuses">
      {#each statuses as [k, label] (k)}
        {@const n = card.status?.[k] ?? 0}
        {@const target = { card: card.id, kind: 'status', name: k } as const}
        <span
          class="st {k}"
          class:hot={interaction.isCounter(target)}
          data-counter="status:{k}"
          role="presentation"
          onpointerenter={(event) => interaction.enterCounter(target, event)}
          onpointerleave={() => interaction.leaveCounter()}>{label}{n > 1 ? ` ×${n}` : ''}</span
        >
      {/each}
    </div>
  {/if}
</div>

<style>
  .card {
    position: absolute;
    border-radius: 6px;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    /* Light from the top left: the shadow is cast at 45°, and falls on the cards underneath. */
    filter: drop-shadow(2px 2px 2px #000000c8) drop-shadow(6px 6px 9px #000000a6)
      drop-shadow(12px 12px 16px #00000059);
  }

  .card.exhausted {
    transform: rotate(var(--exhaust-angle));
  }

  /* Around the card, where a change flashes in the colour of the player who made it (motion.svelte.ts). */
  .card::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 8px;
    pointer-events: none;
  }

  .card.lifted {
    visibility: hidden;
  }

  /* Held up under the pointer. */
  .card.ghost {
    cursor: grabbing;
    scale: 1.04;
    transition: scale 0.12s;
  }

  .card.landed {
    scale: 1;
  }

  /*
    Tokens sit inside the card. On a scheme they keep to its right corners, clear of the printed
    threat values: threat at the top, damage and counters piled up from the bottom, the first
    one in the corner. On any other card they sit together in the middle.
  */
  .tokens {
    position: absolute;
    z-index: 4;
    display: flex;
    gap: 3px;
  }

  .tokens.middle {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .tokens.bottom-right {
    right: 6px;
    bottom: 6px;
    flex-direction: column-reverse;
    align-items: flex-end;
  }

  .tokens.top-right {
    right: 6px;
    top: 6px;
  }

  /* A flat pill with an ink rim, its count in the display face, ink on colour. */
  .tok {
    min-width: 28px;
    height: 26px;
    padding: 0 6px;
    border-radius: 999px;
    border: 2px solid var(--table-bg);
    display: grid;
    place-items: center;
    font-stretch: 62%;
    font-weight: 900;
    font-size: 17px;
    line-height: 1;
    color: var(--bg);
    box-shadow: 0 2px 5px #000000a0;
  }

  /* Pointed at: the pill is up. */
  .tok:hover,
  .tok.hot {
    box-shadow:
      0 0 0 2px var(--text),
      0 2px 6px #000000a0;
  }

  .st:hover,
  .st.hot {
    box-shadow:
      0 0 0 2px var(--text),
      0 2px 4px #0009;
  }

  .tok.dmg {
    background: var(--accent);
  }

  .tok.thr {
    background: var(--spark);
  }

  .tok.gen {
    background: var(--text);
  }

  /*
    Status cards: small tabs sticking out of the right edge, like real cards tucked under. They
    end just above the middle, so the tokens there never cover them: half a token (13px) and a
    3px gap.
  */
  .statuses {
    position: absolute;
    right: -8px;
    bottom: calc(50% + 16px);
    z-index: 4;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
  }

  /*
    A landscape card is too low for three tabs above its middle: they lie side by side along its
    top instead, the last one sticking out of the right edge.
  */
  .card.land .statuses {
    top: 6px;
    bottom: auto;
    flex-direction: row;
    align-items: flex-start;
  }

  /* On a scheme, the right corners hold the tokens: the tabs stick out of the left edge. */
  .card.scheme .statuses {
    top: 6px;
    right: auto;
    bottom: auto;
    left: -8px;
    flex-direction: column;
    align-items: flex-start;
  }

  .card.scheme .st {
    border-radius: 6px 4px 4px 6px;
  }

  .st {
    font-stretch: 75%;
    font-weight: 800;
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fff;
    padding: 3px 5px 3px 6px;
    border-radius: 4px 6px 6px 4px;
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
</style>
