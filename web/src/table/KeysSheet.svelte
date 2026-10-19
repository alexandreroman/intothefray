<!--
  The keyboard shortcuts sheet (spec 5.10), opening upward from the keyboard
  button of the zoom control. It is not a modal: the table keys still work
  while it shows, ? hides it again, and Escape or a press outside closes it
  (keys.ts handles both keys).
-->
<script lang="ts">
  import { onMount } from 'svelte';

  let {
    anchor,
    onclose,
  }: {
    /** The button the sheet opens from: a press on it is not a press outside. */
    anchor: HTMLElement | undefined;
    onclose: () => void;
  } = $props();

  /** A row: what it does, its keys (each in a kbd), and the mouse part that goes with them. */
  interface Row {
    what: string;
    keys: string[];
    with?: string;
  }

  // Modifiers as the system writes them (spec 5.10).
  const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

  // The groups and rows of spec 5.10, worded as in the prototype's KEY_GROUPS.
  const GROUPS: [string, Row[]][] = [
    [
      'Card under the mouse',
      [
        { what: 'Exhaust / ready', keys: ['E'] },
        { what: 'Flip', keys: ['F'] },
        { what: 'Draw an arrow to another card', keys: ['A'] },
        { what: 'Discard', keys: ['X'] },
        { what: 'Back to hand', keys: ['H'] },
      ],
    ],
    [
      'Tokens (Shift removes)',
      [
        { what: 'Damage', keys: ['D'] },
        { what: 'Threat', keys: ['T'] },
        { what: 'Counter', keys: ['N'] },
        { what: 'Stunned', keys: ['S'] },
        { what: 'Confused', keys: ['C'] },
        { what: 'Tough', keys: ['G'] },
      ],
    ],
    [
      'Card in your hand',
      [
        { what: 'Play', keys: ['P'] },
        { what: 'Discard', keys: ['X'] },
      ],
    ],
    [
      'Deck under the mouse',
      [
        { what: 'Draw 1', keys: ['W'] },
        { what: 'Reveal (encounter deck)', keys: ['R'] },
        { what: 'Look at the top cards', keys: ['L'] },
        { what: 'Search', keys: ['K'] },
        { what: 'Shuffle', keys: ['U'] },
      ],
    ],
    [
      'Table',
      [
        { what: 'Undo your last action', keys: ['Z'] },
        { what: 'Zoom in / out', keys: ['+', '−'] },
        { what: 'Zoom back to 100%', keys: ['0'] },
        { what: 'Zoom around the mouse', keys: [MOD], with: 'wheel' },
        { what: 'Let go of the selection', keys: ['Esc'] },
        { what: 'This sheet', keys: ['?'] },
      ],
    ],
    [
      'Mouse',
      [
        { what: 'Ping a spot', keys: ['Alt'], with: 'click' },
        { what: 'Arrow from a card to another', keys: ['Shift'], with: 'drag' },
      ],
    ],
  ];

  // Room kept from the window edges, and between the sheet and its button.
  const EDGE = 16;
  const GAP = 14;

  const uid = $props.id();
  let sheet = $state<HTMLElement>();
  let top = $state(0);
  let left = $state(0);

  /** Above the button, its right edge on the button's, kept inside the window. */
  function place(): void {
    if (!sheet || !anchor) {
      return;
    }
    const button = anchor.getBoundingClientRect();
    top = Math.max(EDGE, button.top - GAP - sheet.offsetHeight);
    left = Math.max(EDGE, button.right - sheet.offsetWidth);
  }

  onMount(place);

  function onPointerDown(event: PointerEvent): void {
    const target = event.target instanceof Node ? event.target : null;
    if (sheet?.contains(target) || anchor?.contains(target)) {
      return;
    }
    onclose();
  }
</script>

<!-- In the capture phase: a press that something else stops still closes the sheet. -->
<svelte:window onpointerdowncapture={onPointerDown} onresize={place} />

<div
  class="keys"
  role="dialog"
  aria-modal="false"
  aria-labelledby="{uid}-title"
  bind:this={sheet}
  style:top="{top}px"
  style:left="{left}px"
>
  <div class="khead">
    <b id="{uid}-title">Keyboard shortcuts</b>
    <button aria-label="Close" onclick={onclose}>×</button>
  </div>
  <div class="kcols">
    {#each GROUPS as [title, rows] (title)}
      <section>
        <h4>{title}</h4>
        {#each rows as row (row.what)}
          <div class="row">
            <span>{row.what}</span>
            <span>
              {#each row.keys as key (key)}<kbd>{key}</kbd
                >{/each}{#if row.with}{` + ${row.with}`}{/if}
            </span>
          </div>
        {/each}
      </section>
    {/each}
  </div>
</div>

<style>
  /* Over the table, the hand and the action bar; under the dialogs (5600). */
  .keys {
    position: fixed;
    z-index: 5200;
    width: min(640px, calc(100vw - 32px));
    max-height: 80vh;
    overflow: auto;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 16px;
    box-shadow: 0 24px 60px #000c;
  }

  .khead {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
  }

  .khead b {
    margin-right: auto;
    font-stretch: 85%;
    font-weight: 800;
    font-size: 18px;
  }

  .khead button {
    border: none;
    background: none;
    font-size: 20px;
    padding: 0 6px;
    color: var(--muted);
  }

  .kcols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 6px 24px;
    padding: 12px 16px 16px;
  }

  h4 {
    margin: 10px 0 4px;
    font-stretch: 75%;
    font-weight: 800;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 3px 0;
    font-size: 13px;
  }

  .row span:last-child {
    white-space: nowrap;
  }

  kbd {
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    background: var(--bg);
    border-radius: 5px;
    padding: 1px 6px;
    margin-left: 4px;
  }
</style>
