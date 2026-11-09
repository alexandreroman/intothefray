---
name: "A press shows the hover's look"
description: "No browser tap highlight; a press shows the hover's look, rounded like the control; own-feedback elements take none"
type: project
---

# A press shows the hover's look

- The browser's tap highlight is off for the whole page: one
  `html { -webkit-tap-highlight-color: transparent; }` rule in
  `web/src/styles/tokens.css`. Components carry no tap highlight rule of
  their own.
- A press (`:active`) shows the control's hover look, under any pointer,
  outside any media query: `button` and `.btn-ghost` in tokens.css, with
  selectors that weigh as the hovers', and a component's `:active` beside
  its own hover look. A background shade, a border or a box-shadow ring
  follows the control's `border-radius`. Under a mouse the control is
  hovered already, so the press changes nothing there; on a touch screen
  it is the tap's feedback. The hover itself stays under
  `@media (hover: hover)` (see [[project_press_releases_focus]]).
- A touch-only control with no hover (the hand sheet's actions, the dock
  rail's hand button) gets a press look from the existing tokens.
- Elements with their own feedback take no press shade: switch options
  (`:where([data-indicator] ~ button)` left out of the global presses) and
  hero selector entries (the sliding indicator), the hand (the lift), the
  inspector carousel's slides, table cards, piles and markers (the hold
  and drag). The primary button keeps its own press, the sinking deep red
  panel, its own surface transparent when pressed as when hovered.
- `web/src/main.ts` adds an empty passive `touchstart` listener on the
  document: Safari on iOS applies `:active` only under one.

**Why:** the native tap highlight is a square over the tapped element and
cannot be rounded; it clashed with every rounded control. A press equal to
the hover keeps one look per control and no visible change on desktop.

**How to apply:** a new tappable control gives its press the look of its
hover (add `:active` beside the hover, outside `(hover: hover)`), or none
when it has its own feedback; never set `-webkit-tap-highlight-color` on a
component. Card elements stay filter-free (see [[project_card_paint_cost]]).
