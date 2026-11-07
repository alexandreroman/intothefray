---
name: "README home page screenshot"
description: "README shows .github/images/home.webp; a change to the home page refreshes it; capture and border recipe"
type: project
---

# README home page screenshot

`README.md` shows the home page from `.github/images/home.webp`. Any
change to what the home page shows (`web/src/screens/Home.svelte`, its
components, the logo, the theme tokens) refreshes the screenshot in the
same change.

Recipe:

1. `make web-build`, then serve `web/dist` (for example
   `python3 -m http.server 8765 --bind 127.0.0.1` in `web/dist`).
2. Capture with headless Chrome, which lets the entrance animation finish
   (the Casper browser screenshot freezes it on its first frame and shows
   a blank page):

   ```bash
   chrome --headless --disable-gpu --hide-scrollbars \
     --window-size=1440,900 --force-device-scale-factor=2 \
     --virtual-time-budget=5000 --screenshot=home.png http://127.0.0.1:8765/
   ```

3. Resize to 1920×1200, round the corners (radius 28 px, transparent
   outside) and draw a 4 px `#8b949e` border with ImageMagick, then encode
   WebP at quality 90:

   ```bash
   magick home.png -resize 1920x1200 \
     \( +clone -alpha extract -fill black -colorize 100 -fill white \
        -draw "roundrectangle 0,0,1919,1199,28,28" \) \
     -alpha off -compose CopyOpacity -composite \
     \( -size 1920x1200 xc:none -fill none -stroke "#8b949e" \
        -strokewidth 4 -draw "roundrectangle 2,2,1917,1197,26,26" \) \
     -compose over -composite -quality 90 \
     -define webp:alpha-quality=100 .github/images/home.webp
   ```

**Why:** GitHub strips styles from README images, so the border and the
rounded corners are part of the image; a stale screenshot misleads the
README's readers.

**How to apply:** capture from the branch's own build, not from
production, and check the result on a light and a dark background. See
[[project_docs_layout]].
