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
  }: {
    card: TableCard;
    /** The catalog face the card shows, null while unknown: it is then a std placeholder. */
    face: PackFace | null;
    /** The copy drawn under the pointer while the card is dragged (DragLayer). */
    ghost?: boolean;
  } = $props();

  const TOKENS = ['dmg', 'thr', 'gen'] as const;
  const STATUSES = [
    ['stunned', 'Stunned'],
    ['confused', 'Confused'],
    ['tough', 'Tough'],
  ] as const;

  const hidden = $derived(isHidden(card));
  const box = $derived(cardBox(face?.size ?? 'std', { faceDown: hidden, onPile: !!card.onPile }));
  const landscape = $derived(!box.rotated && box.w > box.h);
  const tokens = $derived(TOKENS.filter((k) => (card.tokens?.[k] ?? 0) > 0));
  const statuses = $derived(STATUSES.filter(([k]) => (card.status?.[k] ?? 0) > 0));
  const element = $derived({ kind: 'card', id: card.id } as const);
  const locked = $derived(interaction.isLocked(element));
  // While dragged, the card on the table makes way for its ghost.
  const lifted = $derived(!ghost && interaction.isLifted(card.id));
  // A drop would tuck the dragged card under this one, or go onto the pile this card is revealed on.
  const dropOn = $derived(ghost ? null : interaction.dropOn);
  const tuckTarget = $derived(dropOn?.kind === 'card' && dropOn.id === card.id);
  const pileTarget = $derived(dropOn?.kind === 'pile' && dropOn.id === card.onPile);
</script>

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
  class:lifted
  class:ghost
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

  {#if tokens.length > 0}
    <div class="tokens">
      {#each tokens as k (k)}
        {@const target = { card: card.id, kind: 'token', name: k } as const}
        <span
          class="tok {k}"
          class:hot={interaction.isCounter(target)}
          data-counter="token:{k}"
          role="presentation"
          onpointerenter={(event) => interaction.enterCounter(target, event)}
          onpointerleave={() => interaction.leaveCounter()}>{card.tokens?.[k]}</span
        >
      {/each}
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

  .card.lifted {
    visibility: hidden;
  }

  /* Held up under the pointer. */
  .card.ghost {
    cursor: grabbing;
    scale: 1.04;
    transition: scale 0.12s;
  }

  /* Selected by a tap: a ring around the cut card. */
  .card.locked::before {
    content: '';
    position: absolute;
    inset: 1%;
    border-radius: 7px;
    pointer-events: none;
    z-index: 1;
    box-shadow: 0 0 0 3px var(--sel);
  }

  .tokens {
    position: absolute;
    left: 4px;
    bottom: 4px;
    z-index: 4;
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }

  /* Tokens look like small cardboard chips: lit from the top left, a thin inner ring, a rim and a shadow. */
  .tok {
    --hi: #fff;
    --base: #999;
    --lo: #333;
    --rim: #222;
    --ink: #fff;
    position: relative;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font:
      800 13px/1 system-ui,
      sans-serif;
    color: var(--ink);
    text-shadow: 0 1px 1px #0008;
    background: radial-gradient(circle at 34% 28%, var(--hi) 0%, var(--base) 48%, var(--lo) 100%);
    border: 1.5px solid var(--rim);
    box-shadow:
      inset 0 1px 1px #ffffff80,
      inset 0 -2px 3px #0000004d,
      0 2px 4px #000000a0;
  }

  /* Pointed at: the pill is up. */
  .tok:hover,
  .tok.hot {
    box-shadow:
      inset 0 1px 1px #ffffff80,
      inset 0 -2px 3px #0000004d,
      0 0 0 2px #fff,
      0 2px 6px #000000a0;
  }

  .st:hover,
  .st.hot {
    box-shadow:
      0 0 0 2px #fff,
      0 2px 4px #0009;
  }

  .tok::before {
    content: '';
    position: absolute;
    inset: 2.5px;
    border-radius: 50%;
    border: 1px solid #ffffff40;
    pointer-events: none;
  }

  .tok.dmg {
    --hi: #ff9b8c;
    --base: #d8352b;
    --lo: #7a1210;
    --rim: #4e0b09;
  }

  /* Same orange as Tough. */
  .tok.thr {
    --hi: #ffd59a;
    --base: #e08a1e;
    --lo: #8a4a07;
    --rim: #5a2f02;
  }

  /* Counters are green. */
  .tok.gen {
    --hi: #9fe0b2;
    --base: #1b8a4a;
    --lo: #0a4723;
    --rim: #052e16;
  }

  /* Status cards: small tabs sticking out of the right edge, like real cards tucked under. */
  .statuses {
    position: absolute;
    right: -8px;
    top: 30px;
    z-index: 4;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
  }

  .st {
    font:
      800 8px/1 system-ui,
      sans-serif;
    letter-spacing: 0.3px;
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

  /* Same green as the counter token. */
  .st.stunned {
    background: linear-gradient(#25a058, #11683a);
  }

  .st.confused {
    background: linear-gradient(#a274e6, #5c33a3);
  }

  /* Same orange as the threat token. */
  .st.tough {
    background: linear-gradient(#f0a53a, #a8600f);
  }
</style>
