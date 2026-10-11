# TeachMate icon

The app's home-tile icon, declared in `dapp.json` as `{ "image": "brand/icon.png" }`.

- **Glyph:** an orange graduation cap resting above a white open book.
  Paths are Lucide (`graduation-cap`, `book-open`, ISC licence), 2px round
  strokes on the 24-unit grid, scaled ×12 into the middle 288 px; the cap
  sits at 0.62 scale, the book at 0.75.
- **Colour:** deep blue diagonal gradient, `#1E40AF` (top left) to
  `#172554` (bottom right), under a faint white highlight at the top left.
  Cap in `#FFA552`, book in white. No text inside the icon.
- **Files:** `icon.svg` is the source; render it to the committed
  `icon.png` (512 × 512, ≤ 256 KB) with
  `rsvg-convert -w 512 -h 512 icon.svg -o icon.png` (or any SVG
  rasteriser). The app's favicon and in-app mark are the flat
  rounded-square version at `public/logo.svg` — keep the two in sync when
  the mark changes.
