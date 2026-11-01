---
name: "Stage change carry-over"
description: "Changing a stage's card: a villain keeps all but damage, a main scheme only acceleration; the previous card is cleared"
type: project
---

# Stage change carry-over

- Choosing another card of a stage ("Change card…", action
  `chooseStage`) moves the counters the rules carry over to the new card,
  replacing its own:
  - a villain stage keeps every token but damage (threat, counters,
    acceleration), every status with its value (Retaliate 2 stays 2) and
    every stat modifier;
  - a main scheme stage keeps only its acceleration tokens; its threat
    stays behind.
- Attachments and tucked cards follow the new card on both kinds.
- The previous card returns to the stage zone with no token, status or
  modifier: it is removed from the game. Undo restores it exactly,
  through the action history.
- Another face of the same card (1A to 1B) changes only the face.
- Setup marks a stage as a villain's (`Stage.Villain`) when its top card
  is a villain; any other stage follows the main scheme rule.

**Why:** user decision, from the Rules Reference v1.3: "Excess damage
... does not carry over to the new stage. Attachments, status cards,
counters, and non-damage tokens on a villain carry over" (Villain
Defeat); "excess threat ... does not carry over ... acceleration tokens
on it carry over" (Main Scheme). Players move these by hand on a real
table, so the table does it for them.

**How to apply:** keep it generic: a scenario with several villains
(Wrecking Crew) follows the same rule per stage, with no per-scenario
code. A new counter kind decides whether it carries over in
`carryStageCounters` (internal/game/apply.go). See
[[project_scenario_decks]], [[project_acceleration_token]],
[[project_stat_modifiers]], [[project_retaliate_status]] and
[[project_objective]].
