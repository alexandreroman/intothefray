// Touch mode: the screen's main pointer is a finger, which has no hover (a
// phone, a tablet). The table then previews no card, as a tap opens the
// card's menu and the finger would cover a preview anyway, and it offers no
// keyboard shortcuts. A mouse or a pen, on any screen, keeps both.

/** The media query that tells touch mode; Table.svelte follows it as it changes. */
export const TOUCH_MODE_QUERY = '(hover: none) and (pointer: coarse)';
