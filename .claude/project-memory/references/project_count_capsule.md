---
name: "Card counts use one capsule"
description: "Every card count shows in the piles' count capsule (.count-pill), with no middle dot before it"
type: project
---

# Card counts use one capsule

- Every card count shows in the piles' count capsule
  (`web/src/table/countPill.css`, `.count-pill`): piles, the dock and the
  rail, the hand sheet, the hero selector badges, and the inspector and
  action menu headers. No middle dot comes before it.
- The out-of-play chips and any count that is not a card count keep their
  own look.

**Why:** user decision, for consistency: one look for every card count.

**How to apply:** a new card count uses `.count-pill`.
