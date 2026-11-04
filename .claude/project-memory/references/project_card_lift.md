---
name: "Cards feel lifted, sway and settle"
description: "Discreet physical feel: lift 1.06 with a down-right shade offset, drag sway ±6°, settle on drop, flip and flight lift"
type: project
---

# Cards feel lifted, sway and settle

- The intensity is discreet. A card held up off the table (dragged,
  turning over, flying) is 6 % larger (`LIFT_SCALE`) and its `.shade`
  falls 5 px down and to the right (`LIFT_SHADE`): the light comes from
  the top left. Both constants live in `motion.svelte.ts`; the drag layer
  hands them to the ghosts' CSS as `--lift-scale` and `--lift-shade`.
- The viewer's own drag ghosts sway with the pointer's horizontal speed
  (`sway.ts`): a spring-damped lean, clockwise to the right, ±6° at most,
  upright again once the pointer rests. A `requestAnimationFrame` loop in
  `DragLayer.svelte` writes `--sway` on the layer, only while the spring
  moves. The sway is local: presence sends nothing more, and other
  players' ghosts stay upright and keep their own 1.04 lift.
- A dropped ghost stays held up where it landed until the view shows the
  card. A drop on the table then settles (`settle` in `animate.ts`):
  1.06 → 0.98 → 1 over 220 ms, the shade back under it, upright from the
  ghost's lean. A tucked drop, a flight or a slide leaves from the ghost
  at its lifted size instead.
- A table card turning over (`flip`, `turnIn`) rises to edge-on and comes
  back down; one that slides at the same time is not lifted, as both play
  on `scale`. Copies flying to a pile (not under it) or into the hand rise
  to 1.06 at 45 % of the way.
- Properties stay apart: move on `translate`, lift and settle on `scale`,
  tilt and sway on `rotate`, turns on `transform`. Reduced motion keeps
  only the static lift of a ghost: no sway, settle, flip or flight lift.

**Why:** decided with the user: cards should feel physical and alive,
without drawing attention, and stay cheap to paint (no filter on table
cards, no box-shadow animation).

**How to apply:** a new card motion reuses `LIFT_SCALE` and `LIFT_SHADE`
and never animates a property another motion of the same card plays on.
See [[project_card_move_animations]] and [[project_card_paint_cost]].
