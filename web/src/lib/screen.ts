// The screen sizes the app adapts to, as media queries for scripts (MediaQuery). The @media
// rules of the components' styles write the same sizes out, as CSS takes no variable there.

/**
 * Touch mode: the screen's main pointer is a finger, which has no hover (a phone, a tablet). The
 * table then previews no card, and a tap opens the card's inspector; the shortcuts button is
 * hidden, though the keys still work. A mouse or a pen, on any screen, keeps the previews and the
 * button. Table.svelte follows the query as it changes.
 */
export const TOUCH_MODE_QUERY = '(hover: none) and (pointer: coarse)';

/**
 * A phone either way up: up to 600px wide (a phone upright) or up to 500px tall (a phone on its
 * side, 320 to 440px tall, where a tablet on its side is 744px tall or more). Outside dock mode,
 * the top bar hides on scroll (TopBar.svelte) and floats over the table, whose hand cards follow
 * the window and whose bottom controls gather in one bar above the resting hand. A touch screen
 * of this size is dock mode (Table.svelte).
 */
export const SMALL_SCREEN_QUERY = '(max-width: 600px), (max-height: 500px)';

/**
 * A phone on its side, up to 500px tall: in dock mode, the dock is a rail down the left edge
 * (Table.svelte), and the card inspector lays the card's column beside it rather than under it
 * (CardSheet.svelte).
 */
export const SHORT_SCREEN_QUERY = '(max-height: 500px)';

/**
 * A screen wider than it is high: a tablet on its side, whose inspector lays every card beside its
 * actions, a scheme included (CardSheet.svelte).
 */
export const SIDEWAYS_QUERY = '(orientation: landscape)';

/**
 * A narrow screen, up to 900px wide: the table's side column goes and the history column is not
 * shown; a touch screen opens the history in a sheet (`historySheetMode` in Table.svelte).
 */
export const NARROW_SCREEN_QUERY = '(max-width: 900px)';

/**
 * A phone held upright, up to 600px wide: outside dock mode, the table zooms further out and fits
 * its width until the viewer zooms. The top bar reads it too: a mouse window this narrow drops
 * Fullscreen (TopBar.svelte).
 */
export const PHONE_QUERY = '(max-width: 600px)';

/**
 * A bar narrower than the narrowest common Android phone, under 360px wide: the table's top bar in
 * the standalone installed app has no room there for both Fullscreen and Reload, which then share
 * one slot (TopBar.svelte).
 */
export const NARROW_BAR_QUERY = '(max-width: 359px)';
