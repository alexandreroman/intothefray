<!--
  The hero selector at the bottom left of the table: one round avatar per deck, in a ring of its
  player's colour, with the deck's hand size in a badge. In "All" it picks the viewer's deck whose
  hand shows; in "Villain + player" the seat whose row shows. Only the current entry names its hero,
  beside its avatar.

  A switch takes about 0.3 s: the ring slides to the new avatar as its colour fades, while the new
  name unfolds and the old one folds. Every name box is as wide as the longest name listed (--nw),
  so the name unfolding grows exactly as much as the one folding shrinks: the selector keeps its
  size, during a switch and after it.
-->
<script module lang="ts">
  /** One deck the selector lists. */
  export interface HeroEntry {
    seat: number;
    /** The player and the hero ("Alex · Spider-Man"): the entry's accessible name and tooltip. */
    label: string;
    /** The name shown beside the current entry's avatar: its hero, else its player. */
    name: string;
    /** The hero face image of the deck's identity; none while the deck has no hero. */
    image?: string;
    /** The player's CSS colour. */
    color: string;
    handCount: number;
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import CardArt from '../components/CardArt.svelte';

  let {
    entries,
    current,
    label,
    compact = false,
    onpick,
    width = $bindable(0),
  }: {
    /** The decks listed, in seat order. */
    entries: HeroEntry[];
    /** The seat of the current entry. */
    current: number;
    /** The name of the radio group: what picking an entry chooses. */
    label: string;
    /** The small-screen sizes: smaller avatars, closer together. */
    compact?: boolean;
    onpick: (seat: number) => void;
    /** The selector's width in px, for the table to lay the hands out right of it. */
    width?: number;
  } = $props();

  const currentIndex = $derived(entries.findIndex((entry) => entry.seat === current));
  const currentColor = $derived(entries[currentIndex]?.color);

  /** Picks the entry `step` entries after the current one, round the entries. */
  function step(by: number): void {
    const count = entries.length;
    const next = entries[(currentIndex + by + count) % count];
    if (next) {
      onpick(next.seat);
    }
  }

  // The arrow keys, as in any radio group.
  const STEPS: Record<string, number> = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  };

  /** Moves the choice, and the keyboard focus with it, to the next or previous entry. */
  async function onKey(event: KeyboardEvent): Promise<void> {
    const by = STEPS[event.key];
    if (by === undefined) {
      return;
    }
    // Taken: the table's own shortcuts must not see it.
    event.preventDefault();
    const group = event.currentTarget as HTMLElement;
    step(by);
    await tick();
    group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }

  let heroes = $state<HTMLElement>();
  // The width of the longest name listed, once measured.
  let nameWidth = $state<number | null>(null);
  const names = $derived(entries.map((entry) => entry.name).join('\n'));

  /** Measures the names' natural widths: their texts keep them, whether their boxes are folded or not. */
  function measureNames(): void {
    const texts = heroes ? [...heroes.querySelectorAll('.txt')] : [];
    nameWidth = Math.max(0, ...texts.map((text) => Math.ceil(text.getBoundingClientRect().width)));
  }

  // Measured when the names listed change, not on a switch. A web font loading late changes the
  // widths too: the texts are observed for that.
  $effect(() => {
    void names;
    measureNames();
    const resizes = new ResizeObserver(measureNames);
    for (const text of heroes?.querySelectorAll('.txt') ?? []) {
      resizes.observe(text);
    }
    return () => resizes.disconnect();
  });
</script>

<div class="picker floatbar" class:compact bind:offsetWidth={width}>
  {#if entries.length > 2}
    <button
      class="btn-ghost step"
      aria-label="Previous hero"
      data-tip="Previous hero"
      onclick={() => step(-1)}>←</button
    >
  {/if}
  <div
    class="heroes"
    role="radiogroup"
    aria-label={label}
    tabindex="-1"
    style:--nw={nameWidth === null ? undefined : `${nameWidth}px`}
    onkeydown={onKey}
    bind:this={heroes}
  >
    <!--
      The ring around the current avatar. Every avatar before the current one has its name folded,
      so the ring's place is their count, known before the names have moved: measuring the
      avatar's place at the switch would find it where it was before the names fold and unfold.
    -->
    <span
      class="ring"
      aria-hidden="true"
      hidden={currentIndex === -1}
      style:--at={currentIndex}
      style:--ring={currentColor}
    ></span>
    {#each entries as entry (entry.seat)}
      <button
        class="item"
        role="radio"
        aria-label={entry.label}
        data-tip={entry.label}
        aria-checked={entry.seat === current}
        tabindex={entry.seat === current ? 0 : -1}
        style:--seat={entry.color}
        onclick={() => onpick(entry.seat)}
      >
        <span class="swatch">
          <span class="art" class:empty={!entry.image}>
            {#if entry.image}
              <CardArt src={entry.image} aspect={1} />
            {/if}
          </span>
          <span class="n">{entry.handCount}</span>
        </span>
        <span class="name"><span class="txt">{entry.name}</span></span>
      </button>
    {/each}
  </div>
  {#if entries.length > 2}
    <button
      class="btn-ghost step"
      aria-label="Next hero"
      data-tip="Next hero"
      onclick={() => step(1)}>→</button
    >
  {/if}
</div>

<style>
  /* The floating bar, rounded as a pill around the avatars. */
  .picker {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 18px 8px 10px;
    border-radius: 999px;
    border-color: var(--line-strong);
  }

  .picker.compact {
    padding: 7px 12px 7px 8px;
  }

  .step {
    height: var(--bar-button);
    padding: 0 8px;
    border: none;
    border-radius: 8px;
    color: var(--text-soft);
  }

  .heroes {
    --avatar: 34px;
    --spacing: 20px;
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--spacing);
  }

  .compact .heroes {
    --avatar: 30px;
    --spacing: 14px;
  }

  /* One entry: its hero's avatar, the hero's name beside it. */
  .item,
  .item:hover {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    color: var(--muted);
    /* A button centres its text: the name sits against its avatar, the room it leaves after it. */
    text-align: left;
  }

  .swatch {
    flex: none;
    position: relative;
    display: block;
    width: var(--avatar);
    height: var(--avatar);
    border-radius: 50%;
    background: #000;
    box-shadow: 0 0 0 2px #3a4258;
  }

  /*
    The keyboard focus rings the avatar alone, round and outside the player-colour ring (which
    reaches 4.5px past the avatar), rather than boxing the whole entry with its name.
  */
  .item:focus-visible {
    outline: none;
  }

  .item:focus-visible .swatch {
    outline: 2px solid var(--sel);
    outline-offset: 6px;
  }

  /* A hero not current is greyed; it takes its colours back as it becomes current. */
  .art {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    overflow: hidden;
    filter: grayscale(1) brightness(0.65);
    transition: filter 0.3s ease;
  }

  /* No hero yet: a disc of the seat colour. */
  .art.empty {
    background: var(--seat);
  }

  .item:hover .art {
    filter: grayscale(0.6) brightness(0.85);
  }

  .item[aria-checked='true'] .art {
    filter: none;
  }

  /* The hand size, top right of the avatar, over the ring. */
  .n {
    position: absolute;
    right: -9px;
    top: -9px;
    z-index: 2;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--line-strong);
    color: var(--text-soft);
    font: 600 10px/15px var(--font);
    text-align: center;
  }

  /*
    Only the current entry names its hero: the name unfolds beside its avatar, and the gap before
    it with it, while the last one folds. Until measured, a name takes its natural width.
  */
  .item .name {
    width: var(--nw, auto);
    max-width: 0;
    margin-left: -10px;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    transition:
      max-width 0.3s ease,
      margin-left 0.3s ease,
      color 0.3s;
  }

  .item:hover .name {
    color: var(--text-soft);
  }

  .item[aria-checked='true'] .name {
    max-width: var(--nw, none);
    margin-left: 0;
    color: var(--seat);
  }

  /* The text comes out of the avatar: it slides in from the left as it fades in, and back as it goes. */
  .txt {
    display: inline-block;
    opacity: 0;
    transform: translateX(-18px);
    transition:
      transform 0.3s ease,
      opacity 0.3s ease;
  }

  .item[aria-checked='true'] .txt {
    opacity: 1;
    transform: none;
  }

  /* The ring slides with the names, in the same time, and its colour fades. */
  .ring {
    position: absolute;
    top: 50%;
    left: 0;
    z-index: 1;
    width: var(--avatar);
    height: var(--avatar);
    margin-top: calc(var(--avatar) / -2);
    border-radius: 50%;
    box-shadow:
      0 0 0 2px #141a28,
      0 0 0 4.5px var(--ring);
    transform: translateX(calc(var(--at) * (var(--avatar) + var(--spacing))));
    pointer-events: none;
    transition:
      transform 0.3s ease,
      box-shadow 0.3s ease;
  }

  /* The same selectors as the rules above, or theirs would win and still animate. */
  @media (prefers-reduced-motion: reduce) {
    .art,
    .item .name,
    .txt,
    .ring {
      transition: none;
    }
  }
</style>
