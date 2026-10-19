<!--
  The floating action bar of the hovered (or touch-selected) element:
  centred above it, or below it when there is no room above, and lined up on
  its left or right edge when centring would cross the visible table. It
  stays while the pointer is on it, and is never moved under the pointer.
  Its dropdowns open above it.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ActionItem } from './actions';
  import Icons from './Icons.svelte';
  import { interaction } from './interaction.svelte';

  let {
    anchor,
    items,
    hint,
    bounds,
    zoom,
    onrun,
  }: {
    /** The element the bar is for, found anew at every placement as redraws replace it. */
    anchor: () => HTMLElement | null;
    items: ActionItem[] | { text: string };
    /** Shown instead of the items (the arrow mode). */
    hint?: string;
    /** The visible table: the bar stays within it. */
    bounds: HTMLElement;
    /** Read to place the bar again when the table is zoomed. */
    zoom: number;
    onrun: (item: ActionItem) => void;
  } = $props();

  // Room between the bar and its element, and from the table edges.
  const GAP = 8;
  const EDGE = 8;
  const MENU_GAP = 6;

  let bar = $state<HTMLElement>();
  let position = $state<{ x: number; y: number } | null>(null);

  const list = $derived(Array.isArray(items) ? items : []);
  const text = $derived(hint ?? (Array.isArray(items) ? undefined : items.text));

  function place(): void {
    const element = anchor();
    if (!bar || !element) {
      position = null;
      return;
    }
    const r = element.getBoundingClientRect();
    const w = bounds.getBoundingClientRect();
    const own = bar.getBoundingClientRect();

    const above = r.top - own.height - GAP;
    const y = above > w.top + 4 ? above : r.bottom + GAP;

    const left = w.left + EDGE;
    const right = w.right - EDGE;
    const centred = r.left + r.width / 2 - own.width / 2;
    let x = centred;
    if (centred < left) {
      x = Math.max(left, r.left);
    } else if (centred + own.width > right) {
      x = Math.min(right - own.width, r.right - own.width);
    }
    position = { x, y };
  }

  // Placed again whenever the items change (every redraw) or the table zooms,
  // but never while the pointer is on the bar: it would move under it.
  $effect(() => {
    void [items, hint, zoom];
    if (!interaction.onBar) {
      place();
    }
  });

  function onScrollOrResize(): void {
    if (!interaction.onBar) {
      place();
    }
  }

  /**
   * Runs the current item of that id: a button left over from an older bar sends nothing. A
   * disabled item is aria-disabled rather than disabled, so that its tooltip still shows: its
   * clicks arrive here, and are ignored.
   */
  function runItem(id: string, menuId?: string): void {
    const parent = menuId === undefined ? undefined : list.find((item) => item.id === menuId);
    const choices = parent ? (parent.menu ?? []) : list;
    const item = choices.find((choice) => choice.id === id && choice.id !== 'sep');
    if (!item || item.disabled) {
      return;
    }
    interaction.menu = null;
    onrun(item);
  }

  // ---- Dropdowns ----

  let menuElement = $state<HTMLElement>();
  let menuPosition = $state<{ left: number; bottom: number } | null>(null);
  const openMenu = $derived(list.find((item) => item.id === interaction.menu && item.menu));

  function toggleMenu(item: ActionItem): void {
    if (item.disabled) {
      return;
    }
    interaction.menu = interaction.menu === item.id ? null : item.id;
  }

  // Opened above its button, kept inside the window.
  $effect(() => {
    if (!openMenu || !menuElement || !bar) {
      menuPosition = null;
      return;
    }
    const button = bar.querySelector<HTMLElement>(`[data-menu="${openMenu.id}"]`);
    if (!button) {
      return;
    }
    const r = button.getBoundingClientRect();
    const width = menuElement.getBoundingClientRect().width;
    menuPosition = {
      left: Math.min(r.left, window.innerWidth - width - EDGE),
      bottom: window.innerHeight - r.top + MENU_GAP,
    };
  });

  function onDocumentPointerDown(event: PointerEvent): void {
    if (interaction.menu === null) {
      return;
    }
    const target = event.target as Node;
    const onButton = target instanceof Element && target.closest('[data-menu]');
    if (!menuElement?.contains(target) && !onButton) {
      interaction.menu = null;
    }
  }

  /** The open dropdown's items, cut where their section changes; items without one have no heading. */
  const menuSections = $derived.by(() => {
    const sections: { name?: string; choices: ActionItem[] }[] = [];
    for (const choice of openMenu?.menu ?? []) {
      const last = sections.at(-1);
      if (last && last.name === choice.section) {
        last.choices.push(choice);
      } else {
        sections.push({ name: choice.section, choices: [choice] });
      }
    }
    return sections;
  });

  // A dropdown whose item is gone (a redraw changed the bar) closes.
  $effect(() => {
    if (interaction.menu !== null && !openMenu) {
      interaction.menu = null;
    }
  });

  // ---- The pointer on the bar ----

  // A dropdown is removed from under the pointer when a choice is clicked, and
  // a removed element gets no pointerleave: each part is followed on its own,
  // and a removed part no longer counts.
  let pointerOnBar = false;
  let pointerOnMenu = false;

  function followPointer(): void {
    if (pointerOnBar || pointerOnMenu) {
      interaction.enterBar();
    } else {
      interaction.leaveBar();
    }
  }

  function trackMenu(): () => void {
    return () => {
      if (pointerOnMenu) {
        pointerOnMenu = false;
        followPointer();
      }
    };
  }

  // Gone with its element, the bar is no longer under the pointer. No hide is
  // scheduled: whatever replaced it is hovered already.
  onDestroy(() => {
    interaction.onBar = false;
  });

  /** Whether a separator goes before the item at index i: a new group starts there. */
  function startsGroup(i: number): boolean {
    const previous = list[i - 1];
    const item = list[i];
    return previous !== undefined && item !== undefined && previous.group !== item.group;
  }
</script>

<svelte:window onscrollcapture={onScrollOrResize} onresize={onScrollOrResize} />
<svelte:document onpointerdowncapture={onDocumentPointerDown} />

<div
  class="actionbar"
  role="toolbar"
  aria-label="Actions"
  tabindex="-1"
  bind:this={bar}
  style:left="{position?.x ?? 0}px"
  style:top="{position?.y ?? 0}px"
  class:placed={position !== null}
  onpointerenter={() => {
    pointerOnBar = true;
    followPointer();
  }}
  onpointerleave={() => {
    pointerOnBar = false;
    followPointer();
  }}
>
  {#if text !== undefined}
    <span class="hint">{text}</span>
  {:else}
    {#each list as item, i (item.id)}
      {#if startsGroup(i)}
        <span class="sep" role="separator"></span>
      {/if}
      {#if item.menu}
        <!-- An icon dropdown is named by its label: a disabled one explains why in its tooltip only. -->
        <button
          type="button"
          class="dd"
          class:ico={item.icon !== undefined}
          class:add={item.add}
          data-menu={item.id}
          data-tip={item.tip ?? item.label}
          aria-label={item.icon ? item.label : undefined}
          aria-haspopup="menu"
          aria-expanded={interaction.menu === item.id}
          aria-disabled={item.disabled}
          onclick={() => toggleMenu(item)}
        >
          {#if item.icon}
            <Icons name={item.icon} />
          {:else}
            {item.label}<span class="caret" aria-hidden="true">▾</span>
          {/if}
        </button>
      {:else if item.icon}
        <button
          type="button"
          class="ico"
          class:on={item.pressed}
          aria-label={item.tip ?? item.label}
          data-tip={item.tip ?? item.label}
          data-kbd={item.key}
          aria-disabled={item.disabled}
          onclick={() => runItem(item.id)}
        >
          <Icons name={item.icon} />
        </button>
      {:else}
        <button
          type="button"
          data-tip={item.tip ?? item.label}
          data-kbd={item.key}
          aria-disabled={item.disabled}
          onclick={() => runItem(item.id)}>{item.label}</button
        >
      {/if}
    {/each}
  {/if}
</div>

{#if openMenu}
  <div
    class="menu"
    role="menu"
    aria-label={openMenu.label}
    tabindex="-1"
    bind:this={menuElement}
    style:left="{menuPosition?.left ?? 0}px"
    style:bottom="{menuPosition?.bottom ?? 0}px"
    {@attach trackMenu}
    onpointerenter={() => {
      pointerOnMenu = true;
      followPointer();
    }}
    onpointerleave={() => {
      pointerOnMenu = false;
      followPointer();
    }}
  >
    {#each menuSections as section, s (s)}
      {#if section.name === undefined}
        {@render choices(section.choices, openMenu.id)}
      {:else}
        <!-- The group is named by its heading, which is not read a second time. -->
        <div class="section" role="group" aria-label={section.name}>
          <div class="heading" aria-hidden="true">{section.name}</div>
          {@render choices(section.choices, openMenu.id)}
        </div>
      {/if}
    {/each}
  </div>
{/if}

{#snippet choices(list: ActionItem[], menuId: string)}
  {#each list as choice, i (choice.id === 'sep' ? `sep-${i}` : choice.id)}
    {#if choice.id === 'sep'}
      <div class="msep" role="separator"></div>
    {:else}
      <button
        type="button"
        role="menuitem"
        disabled={choice.disabled}
        title={choice.tip}
        onclick={() => runItem(choice.id, menuId)}
        ><span>{choice.label}</span>{#if choice.key}<kbd>{choice.key}</kbd>{/if}</button
      >
    {/if}
  {/each}
{/snippet}

<style>
  .actionbar {
    position: fixed;
    z-index: 3500;
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 2px;
    max-width: calc(100vw - 16px);
    padding: 5px;
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    background: var(--panel-2);
    box-shadow: 0 14px 34px #0000008c;
    cursor: default;
    /* Measured before it is placed: unseen until then. */
    visibility: hidden;
  }

  .actionbar.placed {
    visibility: visible;
    animation: floatin 0.12s ease-out;
  }

  @keyframes floatin {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  .actionbar:focus {
    outline: none;
  }

  .hint {
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
    padding: 0 6px;
  }

  .sep {
    width: 1px;
    align-self: stretch;
    margin: 6px 3px;
    background: var(--line-strong);
  }

  /* Flat buttons on the ink panel: only the hovered one lights up. */
  .actionbar button,
  .menu button {
    height: 34px;
    padding: 0 11px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    font-size: 13px;
    font-weight: 600;
  }

  .actionbar button:hover:not([aria-disabled='true']),
  .menu button:hover:not(:disabled) {
    background: var(--line-strong);
  }

  .actionbar button:focus-visible,
  .menu button:focus-visible {
    outline: 2px solid var(--sel);
    outline-offset: -2px;
  }

  button.ico {
    width: 38px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Pressed: Ready on an exhausted card. */
  button.ico.on {
    background: color-mix(in srgb, var(--sel) 16%, transparent);
    color: var(--sel);
    box-shadow: inset 0 0 0 1px var(--sel);
  }

  /* The "+" dropdown adds something: dashed, and quiet until used. */
  button.add {
    margin: 0 1px;
    border: 1px dashed #3a4766;
    color: var(--muted);
  }

  button.add:hover:not([aria-disabled='true']) {
    color: var(--text);
  }

  button.add[aria-expanded='true'] {
    border-style: solid;
    border-color: #5a6890;
    background: var(--line-strong);
    color: var(--text);
  }

  .caret {
    margin-left: 6px;
    color: var(--muted);
    font-size: 11px;
  }

  .menu {
    position: fixed;
    z-index: 5000;
    display: flex;
    flex-direction: column;
    min-width: 180px;
    padding: 5px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--panel-2);
    box-shadow: 0 14px 34px #0009;
  }

  .menu:focus {
    outline: none;
  }

  .menu button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    width: 100%;
    text-align: left;
  }

  .section {
    display: flex;
    flex-direction: column;
  }

  .section + .section {
    margin-top: 4px;
    border-top: 1px solid var(--line-strong);
  }

  /* A section's caption: small, wide-spaced capitals. */
  .heading {
    padding: 8px 11px 4px;
    font-stretch: 75%;
    font-weight: 800;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .msep {
    height: 1px;
    margin: 4px 2px;
    background: var(--line-strong);
  }

  /* The key of a choice, on a dark chip. */
  kbd {
    padding: 1px 6px;
    border-radius: 5px;
    background: var(--bg);
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
  }
</style>
