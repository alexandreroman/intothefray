<!--
  The inspector of a table card or pile on a touch screen, in place of its
  context menu (ContextMenu.svelte): a bottom sheet (Sheet.svelte) with the
  card's face large beside its header and its counters, then the same entries
  as the menu (contextItems.ts). The first group shows as large buttons, the
  default one in Fray red, the others as rows; a submenu opens in the sheet,
  with a Back row. A disabled entry shows its reason under its label: a finger
  has no tooltip. No key hints: a touch screen has no keyboard to press them on.
  A chosen entry runs as the menu's does: the caller closes the sheet.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Sheet from '../components/Sheet.svelte';
  import CardFace from './CardFace.svelte';
  import { counterName, MAX_MODIFIER, withSign, type ActionItem } from './actions';
  import type { ContextAction, ContextEntry, ContextHeader, ContextSubmenu } from './contextItems';
  import { splitEntries, type SheetCounter } from './inspector';

  let {
    header,
    entries,
    note,
    images,
    landscape = false,
    counters,
    onrun,
    onstep,
    onclose,
  }: {
    /** What the element is and whose; the sheet is named by its label. */
    header: ContextHeader;
    entries: ContextEntry[];
    /** Why the element has no entries for the viewer, shown instead of them. */
    note?: string;
    /** The face it shows: a card's, a pile's top face or back. */
    images: string[];
    /** The face is a landscape card. */
    landscape?: boolean;
    /** The tokens, statuses and modifiers the card carries (inspector.countersFor). */
    counters: SheetCounter[];
    /** Runs a chosen item; the caller closes the sheet. */
    onrun: (item: ActionItem) => void;
    /** Adds one to a counter, or takes one away. */
    onstep: (counter: SheetCounter, delta: -1 | 1) => void;
    onclose: () => void;
  } = $props();

  const uid = $props.id();

  const split = $derived(splitEntries(entries));

  let openId = $state<string | null>(null);
  let content = $state<HTMLElement>();

  // Found again in every redraw's entries: a submenu whose row went, or got disabled, closes.
  const openSubmenu = $derived(
    entries.find(
      (entry): entry is ContextSubmenu =>
        entry.kind === 'submenu' && entry.id === openId && !entry.disabled,
    ),
  );

  /** A disabled item is aria-disabled rather than disabled, so that its reason is read: its taps do nothing. */
  function run(item: ActionItem): void {
    if (!item.disabled) {
      onrun(item);
    }
  }

  // The row the focus was on goes as the list changes: the focus moves to the Back row, or back to
  // the submenu's row, rather than falling out of the sheet.
  async function openSub(entry: ContextSubmenu): Promise<void> {
    if (entry.disabled) {
      return;
    }
    openId = entry.id;
    await tick();
    content?.querySelector<HTMLElement>('.back')?.focus();
  }

  async function closeSub(): Promise<void> {
    const id = openId;
    openId = null;
    await tick();
    if (id !== null) {
      content?.querySelector<HTMLElement>(`[data-submenu="${CSS.escape(id)}"]`)?.focus();
    }
  }

  /** The id of a disabled entry's reason, which describes it. */
  function reasonId(where: 'main' | 'menu' | 'submenu', id: string): string {
    return `${uid}-${where}-${id}-reason`;
  }

  /** What a stepper button does, as a screen reader says it: "Add one damage", "Remove one from the DEF modifier". */
  function stepLabel(counter: SheetCounter, delta: -1 | 1): string {
    const name = counterName(counter.kind, counter.name);
    if (counter.kind === 'modifier') {
      return delta === 1 ? `Add one to the ${name}` : `Remove one from the ${name}`;
    }
    return delta === 1 ? `Add one ${name}` : `Remove one ${name}`;
  }

  /** Tells the entries apart in an each block: separators have no id. */
  function keyOf(entry: ContextEntry, i: number): string {
    switch (entry.kind) {
      case 'action':
        return entry.item.id;
      case 'submenu':
        return `sub:${entry.id}`;
      case 'separator':
        return `sep:${i}`;
    }
  }
</script>

<!-- Why an entry is disabled: shown under its label, and read as its description. -->
{#snippet reasonText(id: string | undefined, reason: string | undefined)}
  {#if id !== undefined}<span class="reason" {id} aria-hidden="true">{reason}</span>{/if}
{/snippet}

{#snippet actionRow(entry: ContextAction, where: 'menu' | 'submenu')}
  {@const item = entry.item}
  {@const reason = item.disabled ? item.reason : undefined}
  {@const reasonFor = reason === undefined ? undefined : reasonId(where, item.id)}
  <button
    type="button"
    class="row btn-ghost"
    class:default={item.default}
    aria-disabled={item.disabled}
    aria-describedby={reasonFor}
    onclick={() => run(item)}
    ><span class="label">{item.label}</span>{@render reasonText(reasonFor, reason)}</button
  >
{/snippet}

{#snippet separator()}
  <div class="sep" role="separator"></div>
{/snippet}

{#snippet counterRow(counter: SheetCounter)}
  <div class="counter">
    <span class="what"
      ><i class="dot {counter.kind} {counter.name}" class:neg={counter.value < 0}
      ></i>{counter.label}</span
    >
    {#if counter.kind === 'status'}
      {#if counter.value > 1}<span class="value">×{counter.value}</span>{/if}
      <button
        type="button"
        class="step"
        aria-label="Remove {counterName('status', counter.name)}"
        onclick={() => onstep(counter, -1)}>✕</button
      >
    {:else}
      <button
        type="button"
        class="step"
        aria-label={stepLabel(counter, -1)}
        disabled={counter.signed && counter.value <= -MAX_MODIFIER}
        onclick={() => onstep(counter, -1)}>−</button
      >
      <span class="value">{counter.signed ? withSign(counter.value) : counter.value}</span>
      <button
        type="button"
        class="step"
        aria-label={stepLabel(counter, 1)}
        disabled={counter.signed && counter.value >= MAX_MODIFIER}
        onclick={() => onstep(counter, 1)}>+</button
      >
    {/if}
  </div>
{/snippet}

<Sheet label={header.label} {onclose}>
  <div class="inspector" bind:this={content}>
    <div class="top">
      <div class="face" class:land={landscape}>
        <CardFace {images} name={header.name} {landscape} />
      </div>
      <div class="side">
        <!-- The sheet is named by its header, which is not read a second time. -->
        <div class="title" aria-hidden="true" style:--owner={header.color}>
          <div class="eyebrow">{header.eyebrow}</div>
          <div class="nameline">
            <span class="name">{header.name}</span>
            {#if header.count !== undefined}<span class="count">{header.count}</span>{/if}
          </div>
        </div>
        {#each counters as counter (`${counter.kind}:${counter.name}`)}
          {@render counterRow(counter)}
        {/each}
      </div>
    </div>

    {#if note !== undefined}
      <p class="note">{note}</p>
    {/if}

    {#if openSubmenu}
      <div class="rows">
        <button type="button" class="row back btn-ghost" onclick={closeSub}
          ><span class="label"><span aria-hidden="true">‹ </span>Back</span><span class="where"
            >{openSubmenu.label}</span
          ></button
        >
        {#each openSubmenu.entries as entry, i (keyOf(entry, i))}
          {#if entry.kind === 'separator'}
            {@render separator()}
          {:else}
            {@render actionRow(entry, 'submenu')}
          {/if}
        {/each}
      </div>
    {:else}
      {#if split.main.length > 0}
        <div class="main-grid" style:--columns={split.main.length}>
          {#each split.main as entry (entry.item.id)}
            {@const item = entry.item}
            {@const reason = item.disabled ? item.reason : undefined}
            {@const reasonFor = reason === undefined ? undefined : reasonId('main', item.id)}
            <button
              type="button"
              class="main"
              class:default={item.default}
              aria-disabled={item.disabled}
              aria-describedby={reasonFor}
              onclick={() => run(item)}
              ><span class="label">{item.label}</span>{@render reasonText(
                reasonFor,
                reason,
              )}</button
            >
          {/each}
        </div>
      {/if}
      {#if split.rest.length > 0}
        <div class="rows">
          {#each split.rest as entry, i (keyOf(entry, i))}
            {#if entry.kind === 'separator'}
              {@render separator()}
            {:else if entry.kind === 'submenu'}
              {@const reason = entry.disabled ? entry.reason : undefined}
              {@const reasonFor = reason === undefined ? undefined : reasonId('menu', entry.id)}
              <button
                type="button"
                class="row btn-ghost"
                aria-disabled={entry.disabled}
                aria-describedby={reasonFor}
                data-submenu={entry.id}
                onclick={() => openSub(entry)}
                ><span class="label">{entry.label}</span><span class="opens" aria-hidden="true"
                  >›</span
                >{@render reasonText(reasonFor, reason)}</button
              >
            {:else}
              {@render actionRow(entry, 'menu')}
            {/if}
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</Sheet>

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 0 14px;
    user-select: none;
    -webkit-user-select: none;
  }

  /* The face beside what the element is and the counters it carries. */
  .top {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .face {
    flex: none;
    width: 46%;
    aspect-ratio: 5 / 7;
    border-radius: var(--card-radius);
    box-shadow: 4px 6px 16px #000c;
  }

  .face.land {
    aspect-ratio: 7 / 5;
    border-radius: var(--card-radius-land);
  }

  .side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .title {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* A caps label in the owner's colour, as the menu's header has it. */
  .eyebrow {
    color: var(--owner);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .nameline {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .name {
    min-width: 0;
    color: var(--text);
    font-size: 20px;
    font-weight: 800;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }

  /* A pile's count: a small pill, its digits lined up as they change. */
  .count {
    flex: none;
    padding: 0 8px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--panel-2);
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 22px;
  }

  /* A counter: its colour and name, then its steppers. */
  .counter {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: 12px;
    background: var(--panel-2);
  }

  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 6px;
    overflow: hidden;
    font-size: 14px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The colours of the card's discs and tabs (CardView.svelte). */
  .dot {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--line-strong);
  }

  .dot.token.dmg {
    background: #d8352b;
  }

  .dot.token.thr {
    background: #e08a1e;
  }

  .dot.token.gen {
    background: #1b8a4a;
  }

  .dot.token.acc {
    background: var(--accent);
  }

  .dot.status.stunned {
    background: #25a058;
  }

  .dot.status.confused {
    background: #a274e6;
  }

  .dot.status.tough {
    background: #f0a53a;
  }

  .dot.status.retaliate {
    background: #2bb0b5;
  }

  .dot.status.locked {
    background: #7d8aa8;
  }

  /* A modifier is a tab rather than a disc; a penalty is in the Fray red. */
  .dot.modifier {
    border-radius: 3px;
    background: var(--muted);
  }

  .dot.modifier.neg {
    background: var(--accent);
  }

  .value {
    flex: none;
    min-width: 30px;
    font-size: 17px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .step {
    flex: none;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: var(--panel);
    font-size: 22px;
    font-weight: 700;
  }

  .step:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .note {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  /* The first group: large buttons side by side, the default one in Fray red. */
  .main-grid {
    display: grid;
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    gap: 8px;
  }

  .main {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 64px;
    padding: 6px;
    border: 0;
    border-radius: 14px;
    background: var(--panel-2);
    font-size: 13px;
    font-weight: 700;
    white-space: normal;
    text-align: center;
  }

  .main.default {
    background: var(--accent);
    color: var(--bg);
  }

  .main.default:hover:not([aria-disabled='true']) {
    background: var(--accent-hover);
  }

  /* The other groups: full-width rows. */
  .rows {
    display: flex;
    flex-direction: column;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    column-gap: 12px;
    row-gap: 2px;
    width: 100%;
    min-height: 48px;
    padding: 6px 4px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    text-align: left;
  }

  .row.default .label {
    font-weight: 800;
  }

  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .opens,
  .where {
    flex: none;
    color: var(--muted);
    font-size: 14px;
    font-weight: 500;
  }

  .sep {
    height: 1px;
    margin: 4px 0;
    background: var(--line-strong);
  }

  /* Greyed, and its reason on a line of its own below the label. */
  [aria-disabled='true'] {
    opacity: 0.45;
    cursor: default;
  }

  .reason {
    flex: 1 0 100%;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
    white-space: normal;
  }

  .main.default .reason {
    color: inherit;
  }

  .main .reason {
    flex: none;
  }
</style>
