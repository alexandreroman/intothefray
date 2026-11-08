---
name: "On-screen keyboard keeps the UI in sight"
description: "One code path for iOS and Android: the visual viewport drives dialogs and menus; 16 px fields; no focus that pops a keyboard on touch"
type: project
---

# On-screen keyboard keeps the UI in sight

- The page uses the browsers' default keyboard behaviour
  (`interactive-widget=resizes-visual`, Safari's only one and Chrome's
  default): the keyboard shrinks the visual viewport only, the same way on
  iOS and Android. The viewport meta sets no `interactive-widget`.
- `web/src/lib/visibleArea.ts` is the one place that follows the visual
  viewport, installed for the page's life in `main.ts`:
  - it writes `--visible-top` and `--visible-height` on `<html>`; they are
    absent while the page is pinch-zoomed;
  - `visibleRect()`, `withinVisible(room)` and `onVisibleAreaChange()` give
    scripts the part of the window the user sees;
  - on a page that cannot scroll (`fixed-screen`, `scroll-locked`) it puts
    back the window scroll offset iOS leaves once a text field loses the
    focus and the keyboard closes.
- Every dialog (`Dialog.svelte`) sits in the visible area: its backdrop
  follows `--visible-top` / `--visible-height`, and a wide box (card boxes)
  is never taller than it, so a card box's list and footer stay above the
  keyboard.
- The lobby's Add a set menu is placed within the visible area and placed
  again as it changes.
- On any coarse pointer, text fields and selects are 16 px
  (`tokens.css`): iOS zooms the page into a smaller focused field and stays
  zoomed after the keyboard closes.
- In touch mode nothing focuses a text field on its own: card boxes focus
  their box, the Add a set menu leaves its filter for a tap. A keyboard
  shows only when the player taps a field.

**Why:** a keyboard over a full-window layer, or a zoomed field, hides the
UI on phones and tablets; one mechanism serves both platforms and every
field, and Safari supports no `resizes-content`.

**How to apply:** a new fixed layer holding a text field follows
`--visible-top` / `--visible-height` (or goes through `Dialog.svelte`); a
new menu or popover with a field places itself with `withinVisible` and
re-places on `onVisibleAreaChange`; a new text field needs no size of its
own on touch screens and takes no focus on open in touch mode.
