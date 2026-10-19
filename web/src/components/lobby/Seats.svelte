<script lang="ts">
  import { onDestroy } from 'svelte';
  import { href } from '../../lib/router.svelte';
  import type { PlayerView, View } from '../../lib/types';
  import DeckNames from './DeckNames.svelte';
  import HeroThumb from './HeroThumb.svelte';

  let {
    view,
    onremove,
    onleave,
    ontakeseat,
  }: {
    view: View;
    onremove: (color: number) => void;
    onleave: () => void;
    ontakeseat: () => void;
  } = $props();

  const MAX_SEATS = 4;
  const COPIED_MS = 1500;

  // Built from the game id, so no token or other state leaks into the link.
  const inviteUrl = $derived(`${location.origin}${href(`/g/${encodeURIComponent(view.id)}`)}`);
  const isSpectator = $derived(view.you.role === 'spectator');
  // A seat is one deck slot: a player with two decks takes two seats.
  const deckCount = $derived(view.players.reduce((sum, p) => sum + p.decks.length, 0));
  // A newcomer takes the lowest colour no player uses.
  const freeColors = $derived(
    [0, 1, 2, 3]
      .filter((c) => !view.players.some((p) => p.color === c))
      .slice(0, Math.max(0, MAX_SEATS - deckCount)),
  );

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let inviteInput: HTMLInputElement;

  const inviteId = $props.id();

  onDestroy(() => clearTimeout(copyTimer));

  async function copyInvite(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      // No clipboard access (insecure origin, denied): select it for a manual copy.
      inviteInput.select();
      return;
    }
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), COPIED_MS);
  }

  function isMe(player: PlayerView): boolean {
    return view.you.role === 'player' && player.color === view.you.color;
  }

  // "you", "host" or both, after the player's name.
  function roles(player: PlayerView): string {
    const parts: string[] = [];
    if (isMe(player)) {
      parts.push('you');
    }
    if (player.host) {
      parts.push('host');
    }
    return parts.join(' · ');
  }

  function colorVar(color: number): string {
    return `var(--p${color + 1})`;
  }
</script>

<section class="card-box">
  <div class="bhead">
    <h2>Players</h2>
    <span class="aside">up to 4</span>
  </div>
  <div class="sect">
    <label class="lbl" for={inviteId}>Invite link</label>
    <div class="invite">
      <input id={inviteId} type="text" readonly value={inviteUrl} bind:this={inviteInput} />
      <button class="btn" onclick={copyInvite}>
        {#if copied}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          Copied
        {:else}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
          Copy
        {/if}
      </button>
    </div>
    <p class="aside note">Players can join until the table is set up, then as spectators.</p>
  </div>
  <div class="sect seats">
    {#each view.players as player (player.color)}
      <div class="seat" style:--pc={colorVar(player.color)}>
        <div class="head">
          <div class="who">
            <b>{player.name}</b>
            {#if isMe(player) || player.host}
              <span class="aside">{roles(player)}</span>
            {/if}
          </div>
          {#if view.you.host && !isMe(player)}
            {@const tip = `Take ${player.name} off this seat`}
            <button
              class="btn-ghost kick"
              data-tip={tip}
              aria-label={tip}
              onclick={() => onremove(player.color)}
            >
              {@render cross()}
            </button>
          {:else if !view.you.host && isMe(player)}
            <button
              class="btn-ghost kick"
              data-tip="Leave your seat"
              aria-label="Leave your seat"
              onclick={onleave}
            >
              {@render cross()}
            </button>
          {/if}
        </div>
        {#each player.decks as deck, slot (slot)}
          <div class="slot">
            <HeroThumb image={deck.heroImage} name={deck.heroName} />
            {#if deck.ready}
              <DeckNames heroName={deck.heroName ?? '?'} deckName={deck.deckName ?? ''} />
            {:else}
              <div class="nodeck">No deck yet</div>
            {/if}
            <span class="st" class:ok={deck.ready}>
              <i></i>{deck.ready ? 'Ready' : 'Waiting'}
            </span>
          </div>
        {/each}
      </div>
    {/each}
    {#each freeColors as color (color)}
      {#if isSpectator}
        <button class="btn-ghost free" style:--pc={colorVar(color)} onclick={ontakeseat}>
          <i></i>Take this seat
        </button>
      {:else}
        <div class="free" style:--pc={colorVar(color)}>
          <i></i>Free seat: share the invite link
        </div>
      {/if}
    {/each}
  </div>
</section>

{#snippet cross()}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
{/snippet}

<style>
  .invite {
    display: flex;
    gap: 8px;
  }

  .invite input {
    min-width: 0;
    color: #c9cfdf;
  }

  /* Room for "Copied": the field doesn't jump. */
  .invite .btn {
    flex: none;
    width: 112px;
  }

  .note {
    margin: 8px 0 0;
  }

  svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .seats {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .seat {
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    overflow: hidden;
    padding: 12px 14px 12px 18px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
  }

  /* The player's colour: the left edge of the row. */
  .seat::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: var(--pc);
  }

  .head,
  .slot {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  /* The name line keeps the height of the remove button, with or without one. */
  .head {
    min-height: 32px;
  }

  .who {
    flex: 1;
    min-width: 0;
  }

  .who b {
    font-size: 15px;
  }

  .who .aside {
    margin-left: 6px;
  }

  .nodeck {
    flex: 1;
    min-width: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .st {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--warn);
  }

  .st.ok {
    color: var(--ok);
  }

  .st i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }

  .kick {
    flex: none;
    width: 32px;
    height: 32px;
    padding: 0;
    color: var(--faint);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .kick svg {
    width: 14px;
    height: 14px;
    stroke-width: 2.2;
  }

  .free {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 18px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 14px;
    color: var(--muted);
    font-size: 14px;
    font-weight: 400;
    text-align: left;
  }

  /* A spectator's free seat is a button: it takes the seat. */
  button.free:hover:not(:disabled) {
    border-color: var(--pc);
  }

  .free i {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    transform: rotate(45deg);
    background: var(--pc);
    opacity: 0.7;
  }
</style>
