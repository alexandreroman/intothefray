---
name: "Visual identity"
description: "Ink & Signal look: Archivo, ink palette, split-card logo, full wordmark in every app bar"
type: project
---

# Visual identity

- The look is "Ink & Signal": dark ink grounds, Fray red `#FF4438` for the
  main action, Spark yellow `#FFCE3A` for caption boxes, threat and first
  player, Signal blue `#49C6FF` for selection and focus only. Tokens live
  in `web/src/styles/tokens.css`.
- Type is Archivo from Google Fonts, one family used at three widths
  (condensed black italic display, normal UI, semi-condensed caps labels).
- The logo is a tilted card split by a fracture, with a yellow spark;
  `Logo.svelte` draws the mark, the horizontal and the stacked lockups.
- Every app bar shows the full "INTO THE FRAY" wordmark.
- Comic cues stay sparse: slanted primary button, yellow narration
  captions, speech-bubble tooltips, halftone dots.

**Why:** chosen with the user from mockups on a claude.ai design canvas:
themed but modern and clean, original mark with no Marvel branding.

**How to apply:** reuse the tokens and shared classes (`.btn-primary`,
`.caption`, `.display`) for new UI; keep the full wordmark in bars.
