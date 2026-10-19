<!--
  The keyboard shortcuts sheet (spec 5.10), opening upward from the keyboard
  button of the zoom control. A dialog like any other (Dialog.svelte): the
  table is frozen under its backdrop. Its × button, ?, Escape or a click on
  the backdrop closes it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Dialog from '../components/Dialog.svelte';

  let {
    anchor,
    alignTo = anchor,
    onclose,
  }: {
    /** The button the sheet opens from. */
    anchor: HTMLElement | undefined;
    /** The box whose right edge the sheet's lines up on (the controls around the button); the button by default. */
    alignTo?: HTMLElement;
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
        { what: 'Discard', keys: ['⌫'] },
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
        { what: 'Discard', keys: ['⌫'] },
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
        { what: 'Ready all your cards', keys: ['⇧ Space'] },
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

  let sheet = $state<HTMLElement>();
  let at = $state<{ top: number; left: number }>();

  /** Above the button, its right edge on the aligned box's, kept inside the window. */
  function place(): void {
    if (!sheet || !anchor) {
      return;
    }
    const button = anchor.getBoundingClientRect();
    const right = (alignTo ?? anchor).getBoundingClientRect().right;
    at = {
      top: Math.max(EDGE, button.top - GAP - sheet.offsetHeight),
      left: Math.max(EDGE, right - sheet.offsetWidth),
    };
  }

  onMount(place);

  // ? shows the sheet, and hides it again: the table keys are off while it is open.
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === '?' && !event.repeat) {
      event.preventDefault();
      onclose();
    }
  }
</script>

<svelte:window onresize={place} />

<Dialog
  title="Keyboard shortcuts"
  wide
  width="min(640px, calc(100vw - 32px))"
  {at}
  bind:box={sheet}
  oncancel={onclose}
  onkeydown={onKeydown}
>
  {#snippet heading(id: string)}
    <div class="khead">
      <b {id}>Keyboard shortcuts</b>
      <button class="btn-ghost" type="button" aria-label="Close" onclick={onclose}>×</button>
    </div>
  {/snippet}
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
</Dialog>

<style>
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
    font-size: 20px;
    padding: 0 6px;
    color: var(--muted);
  }

  /* The part that scrolls when the window is short. */
  .kcols {
    min-height: 0;
    overflow: auto;
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
    color: var(--muted);
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
