<!--
  A segmented control: a pill of pressed-or-not buttons, one of them selected, under a highlight
  that slides from option to option (lib/selectionIndicator.ts).

  Its look adapts through custom properties: --segmented-height (34px, an encounter set's chip),
  --segmented-bg, --segmented-pad (the buttons' side padding), --segmented-weight (the labels'),
  and --segmented-label-display, to keep only the icons of a narrow bar.
-->
<script lang="ts" generics="T extends string">
  import Icon, { type IconName } from './Icon.svelte';
  import { selectionIndicator } from '../lib/selectionIndicator';

  interface Option {
    value: T;
    label: string;
    /** Drawn before the label. The label then names the button and shows in its tooltip too,
     *  since a narrow bar may hide it. */
    icon?: IconName;
  }

  let {
    options,
    value,
    onchange,
    label,
    disabled = false,
  }: {
    options: readonly Option[];
    value: T;
    /** Called with another option than the selected one. */
    onchange: (value: T) => void;
    /** The name of the whole control, for screen readers. */
    label: string;
    /** Read only: the selection shows, as bright as ever, but cannot change. */
    disabled?: boolean;
  } = $props();

  function choose(next: T): void {
    if (next !== value) {
      onchange(next);
    }
  }
</script>

<div class="segmented" role="group" aria-label={label} use:selectionIndicator>
  <span class="indicator" data-indicator aria-hidden="true"></span>
  {#each options as option (option.value)}
    <button
      class="btn-ghost"
      type="button"
      aria-pressed={option.value === value}
      aria-label={option.icon ? option.label : undefined}
      title={option.icon ? option.label : undefined}
      {disabled}
      onclick={() => choose(option.value)}
    >
      {#if option.icon}
        <Icon name={option.icon} />
        <span class="label">{option.label}</span>
      {:else}
        {option.label}
      {/if}
    </button>
  {/each}
</div>

<style>
  /* 1px border, 3px padding, then the buttons fill the rest of the height. */
  .segmented {
    position: relative;
    display: inline-flex;
    gap: 2px;
    height: var(--segmented-height, 34px);
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--segmented-bg, var(--table-bg));
  }

  .indicator {
    border-radius: 999px;
    background: var(--panel-2);
  }

  /* Over the indicator, which is positioned. */
  button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 var(--segmented-pad, 14px);
    border: 0;
    border-radius: 999px;
    color: var(--muted);
    font-size: 13px;
    font-weight: var(--segmented-weight, 700);
    line-height: 1;
  }

  button[aria-pressed='true'] {
    color: var(--text);
  }

  button:disabled {
    opacity: 1;
  }

  button :global(svg) {
    width: 16px;
    height: 16px;
  }

  .label {
    display: var(--segmented-label-display, inline);
  }
</style>
