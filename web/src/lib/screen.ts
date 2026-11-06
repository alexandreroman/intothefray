// The screen sizes the app adapts to, as media queries for scripts (MediaQuery). The @media
// rules of the components' styles write the same sizes out, as CSS takes no variable there.

/**
 * A phone either way up: up to 600px wide (a phone upright) or up to 500px tall (a phone on its
 * side, 320 to 440px tall, where a tablet on its side is 744px tall or more). On such a screen
 * the top bar hides on scroll (TopBar.svelte) and floats over the table, whose hand cards follow
 * the window and whose bottom controls gather in one bar above the resting hand (Table.svelte).
 */
export const SMALL_SCREEN_QUERY = '(max-width: 600px), (max-height: 500px)';

/**
 * A phone on its side, up to 500px tall: in dock mode, the card inspector lays the card's column
 * beside it rather than under it (CardSheet.svelte).
 */
export const SHORT_SCREEN_QUERY = '(max-height: 500px)';

/** A narrow screen, up to 900px wide: the table's side column goes, the history is not shown. */
export const NARROW_SCREEN_QUERY = '(max-width: 900px)';

/**
 * A phone held upright, up to 600px wide: the table zooms further out and fits its width until the
 * viewer zooms.
 */
export const PHONE_QUERY = '(max-width: 600px)';
