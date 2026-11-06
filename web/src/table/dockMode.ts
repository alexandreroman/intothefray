// Dock mode, as the table's cards and piles read it: Table.svelte knows it from the
// screen and hands it down through a context, so the components between them (Surface, the drag
// and presence layers) need not pass it on.

import { getContext, setContext } from 'svelte';

/** Whether the table is in dock mode, read live: a getter follows the screen. */
export interface DockMode {
  readonly current: boolean;
  /** The table's zoom, read live: dock mode draws a card's counters at a fixed screen size. 1 when unknown. */
  readonly zoom?: number;
}

/** The context key, exported for tests that render a card or a pile on their own. */
export const DOCK_MODE_KEY = Symbol('dock mode');

const NO_DOCK: DockMode = { current: false };

/** Hands dock mode down to every card and pile under the calling component (Table.svelte). */
export function setDockMode(mode: DockMode): void {
  setContext(DOCK_MODE_KEY, mode);
}

/** Dock mode, from the table above the calling component; never on outside a table. */
export function dockMode(): DockMode {
  return getContext<DockMode | undefined>(DOCK_MODE_KEY) ?? NO_DOCK;
}
