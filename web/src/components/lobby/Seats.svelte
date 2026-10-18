<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PlayerView, View } from '../../lib/types';
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
  const inviteUrl = $derived(
    `${location.origin}${location.pathname}#/g/${encodeURIComponent(view.id)}`,
  );
  const isSpectator = $derived(view.you.role === 'spectator');
  // A newcomer takes the lowest colour no player uses.
  const freeColors = $derived(
    [0, 1, 2, 3]
      .filter((c) => !view.players.some((p) => p.color === c))
      .slice(0, MAX_SEATS - view.players.length),
  );

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let inviteInput: HTMLInputElement;

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

  function colorVar(color: number): string {
    return `var(--p${color + 1})`;
  }
</script>

<section class="card-box">
  <div class="bhead"><b>Players</b><span class="aside">up to 4</span></div>
  <div class="sect">
    <div class="lbl">
      Invite link <span class="aside"
        >players can join until the game starts, then as spectators</span
      >
    </div>
    <div class="invite">
      <input
        type="text"
        readonly
        value={inviteUrl}
        aria-label="Invite link"
        bind:this={inviteInput}
      />
      <button onclick={copyInvite}>{copied ? 'Copied ✓' : 'Copy'}</button>
    </div>
  </div>
  <div class="sect">
    <div class="seats">
      {#each view.players as player (player.color)}
        <div class="seat" style:--pc={colorVar(player.color)}>
          <HeroThumb code={player.hero} name={player.heroName} />
          <div class="who">
            <div class="nm">
              <span class="pn">{player.name}</span>
              {#if isMe(player)}<span class="aside">(you)</span>{/if}
              {#if player.host}<span class="aside">· host</span>{/if}
            </div>
            <div class="deck">
              {player.ready
                ? `${player.heroName ?? '?'} — ${player.deckName ?? ''}`
                : 'choosing a deck…'}
            </div>
          </div>
          <span class="st" class:ok={player.ready} class:wait={!player.ready}>
            {player.ready ? '● Ready' : '● Waiting'}
          </span>
          {#if view.you.host && !isMe(player)}
            {@const tip = `Take ${player.name} off this seat`}
            <button
              class="kick"
              data-tip={tip}
              aria-label={tip}
              onclick={() => onremove(player.color)}
            >
              {@render cross()}
            </button>
          {:else if !view.you.host && isMe(player)}
            <button
              class="kick"
              data-tip="Leave your seat"
              aria-label="Leave your seat"
              onclick={onleave}
            >
              {@render cross()}
            </button>
          {/if}
        </div>
      {/each}
      {#each freeColors as color (color)}
        {#if isSpectator}
          <button class="seat empty" style:--pc={colorVar(color)} onclick={ontakeseat}>
            <span class="swatch"></span>Take this seat
          </button>
        {:else}
          <div class="seat empty" style:--pc={colorVar(color)}>
            <span class="swatch"></span>Free seat — share the invite link
          </div>
        {/if}
      {/each}
    </div>
  </div>
</section>

{#snippet cross()}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
{/snippet}

<style>
  .invite {
    display: flex;
    gap: 6px;
  }

  .invite input {
    font-size: 12px;
    color: var(--muted);
    min-width: 0;
  }

  /* Room for "Copied ✓": the field doesn't jump. */
  .invite button {
    flex: none;
    width: 86px;
  }

  .seats {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .seat {
    display: flex;
    align-items: center;
    gap: 10px;
    position: relative;
    padding: 8px 8px 8px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #121827;
    min-height: 64px;
  }

  /* The player's colour: a plain straight band, exactly as tall as the hero card. */
  .seat:not(.empty)::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 50%;
    height: 48px;
    margin-top: -24px;
    width: 5px;
    background: var(--pc);
  }

  .seat.empty {
    padding: 8px;
    border-style: dashed;
    background: transparent;
    color: var(--faint);
    justify-content: center;
    gap: 0;
  }

  button.seat.empty {
    width: 100%;
    color: var(--muted);
    border-color: var(--line);
    border-radius: 10px;
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--pc);
    opacity: 0.5;
    margin-right: 8px;
  }

  .who {
    flex: 1;
    min-width: 0;
  }

  .nm {
    font-weight: 700;
  }

  .nm .pn {
    color: var(--pc);
  }

  .nm .aside {
    color: var(--muted);
    font-weight: 400;
    font-size: 12px;
  }

  .deck {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .st {
    font-size: 12px;
    flex: none;
  }

  .st.ok {
    color: var(--ok);
  }

  .st.wait {
    color: var(--warn);
  }

  .kick {
    flex: none;
    position: relative;
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 4px 6px;
    border-radius: 6px;
    display: inline-flex;
  }

  .kick:hover {
    color: var(--text);
    background: #ffffff14;
  }

  .kick svg {
    width: 16px;
    height: 16px;
  }

  /* Right-aligned, so the tooltip of the last column stays inside the page. */
  .kick:hover::after,
  .kick:focus-visible::after {
    content: attr(data-tip);
    position: absolute;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 50;
    pointer-events: none;
    background: #0c111b;
    border: 1px solid #3a4870;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 12px;
    color: var(--text);
  }
</style>
