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
    draggable = false,
    caption,
  }: {
    card: TableCard;
    /** The catalog face the card shows, null while unknown: it is then a std placeholder. */
    face: PackFace | null;
    /** The copy drawn under the pointer while the card is dragged (DragLayer). */
    ghost?: boolean;
    /** A ghost set down where the card was dropped, until the server answers. */
    landed?: boolean;
    /** The viewer can drag it: the pointer grabs it. */
    draggable?: boolean;
    /** The caption of its back: the side deck it belongs to, when that deck has its own back. */
    caption?: string;
  } = $props();

  type TokenKind = 'dmg' | 'thr' | 'gen';

  // The tokens piled up from the bottom right corner, damage first, on every card. The threat
  // goes to the top right corner of a scheme, to the middle of any other card.
  const CORNER_TOKENS: readonly TokenKind[] = ['dmg', 'gen'];
  const SCHEME_TYPES: readonly string[] = ['main_scheme', 'side_scheme', 'player_side_scheme'];
  const STATUSES = [
    ['stunned', 'Stunned'],
    ['confused', 'Confused'],
    ['tough', 'Tough'],
    ['locked', 'Locked'],
  ] as const;

  const hidden = $derived(isHidden(card));
  const box = $derived(cardBox(face?.size ?? 'std', { faceDown: hidden, onPile: !!card.onPile }));
  const landscape = $derived(!box.rotated && box.w > box.h);
  // A hidden card has no face: it is not known to be a scheme.
  const scheme = $derived(!hidden && SCHEME_TYPES.includes(face?.type ?? ''));
  const hasToken = (k: TokenKind) => (card.tokens?.[k] ?? 0) > 0;
  const cornerTokens = $derived(CORNER_TOKENS.filter(hasToken));
  const middleThreat = $derived(!scheme && hasToken('thr'));
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
  // Another player previews the card: their ring is drawn inside it, so it follows every move.
  const previewer = $derived(ghost ? undefined : interaction.previewerOf(card.id));
  // The rubber band selected it: it is ringed in the viewer's colour (Table.svelte).
  const selected = $derived(!ghost && interaction.group.has(card.id));
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
  class:grab={draggable && !ghost}
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
    <CardBack back={card.back} {caption} />
  {:else}
    <CardFace
      images={face?.images ?? []}
      name={face?.name ?? ''}
      {landscape}
      rotated={box.rotated}
    />
  {/if}

  {#if middleThreat}
    <div class="tokens middle">
      {@render token('thr')}
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
          onpointerleave={() => interaction.leaveCounter()}
          >{#if k === 'locked'}<svg class="lock" viewBox="0 0 10 10" aria-hidden="true"
              ><rect x="1.5" y="4.5" width="7" height="5" rx="1" /><path
                d="M3 4.5V3a2 2 0 0 1 4 0v1.5"
              /></svg
            >{/if}{label}{n > 1 ? ` ×${n}` : ''}</span
        >
      {/each}
    </div>
  {/if}

  {#if selected}
    <div class="sring"></div>
  {/if}

  {#if previewer !== undefined}
    <div class="rring" style:--c="var(--p{previewer + 1})"></div>
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

  .card.grab {
    cursor: grab;
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
    Tokens sit inside the card. Damage and counters pile up from the bottom right corner, damage
    in the corner. The threat sits in the top right corner of a scheme, clear of its printed
    threat values, and in the middle of any other card. The status tabs end above the middle,
    or lie along the top of a landscape card: clear of both, and of the corner pile, which is
    at most two tokens high.
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

  /* Pointed at: the chip is ringed. */
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

  /* Counters are green, as Stunned. */
  .tok.gen {
    --hi: #9fe0b2;
    --base: #1b8a4a;
    --lo: #0a4723;
    --rim: #052e16;
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

  .st.locked {
    background: linear-gradient(#7d8aa8, #46506b);
  }

  /* The small lock before the Locked label. */
  .st .lock {
    width: 8px;
    height: 8px;
    margin-right: 3px;
    vertical-align: -1px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }
</style>
