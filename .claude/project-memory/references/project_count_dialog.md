---
name: "Count dialog takes typed digits"
description: "\"How many cards?\" (Draw X, Top X, Discard X, Set aside X): stepped or typed with digit keys; no text field"
type: project
---

# Count dialog takes typed digits

- The "How many cards?" dialog (Draw X, Top X, Discard X, Set aside X)
  shows its value in a spinbutton, not a text field: − and + buttons,
  arrows, + and −, Home and End step it; the digit keys (main row or
  keypad, no Ctrl, Meta or Alt) type it, wherever the focus is in the
  box.
- The first digit replaces the value (a leading 0 is ignored), the next
  ones append; Backspace removes the last digit, and on a single digit
  sets 1 and the next digit replaces it. Delete does nothing.
- A typed value stays between 1 and max: one above max shows max. A step
  or Home / End starts from the typed value, and the next digit replaces
  it again. Enter confirms the shown value.

**Why:** typing 6 then Enter is quicker than stepping; without a text
field, a touch screen shows no on-screen keyboard and the browser offers
no autocomplete.

**How to apply:** keep the count dialog free of `<input>` and
contenteditable; handle new keys in its `onKeydown` with preventDefault.
