# Image sources

The still artwork is built by rendering these pages in Chromium at a fixed
viewport, so every measurement in them is a real pixel measurement rather than
something eyeballed in an editor.

| Page | Renders to | Viewport |
| --- | --- | --- |
| `banner2.html` | `docs/banner.png` | 1600 x 420 at 2x, so 3200 x 840 |
| `masthead.html` | `docs/masthead.png` | 1500 x 500 at 2x, so 3000 x 1000 |

Both pull the wordmark from `brand/wordmark-on-dark.svg`, so the lockup is never
redrawn by hand. Fonts must be installed on the machine doing the render: TeX
Gyre Adventor Bold, TeX Gyre Heros Regular and Bold, DejaVu Sans Mono. All four
are in `design/fonts/`.

```bash
npm i playwright          # only dependency, and only for rendering images
node render.js '[{"url":"/abs/path/banner2.html","w":1600,"h":420,"dpr":2,"out":"banner.png"}]'
```

The plugin itself still has no dependencies. Nothing here is needed to build or
run it.

## House rules for edits

Every angled edge is the same chisel cut, 42 percent of the cap height, about 47
degrees. That covers the mark, the yellow band, the pen chips and the pair of
diagonal rules. Nothing is rounded.

Colours are the plugin's own shipped defaults, read from `main.js`. Do not tune
them by eye. The full palette and the type rules are in `brand/brand.md`.
