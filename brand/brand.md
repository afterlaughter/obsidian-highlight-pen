# Highlight Pen brand

## The idea

The mark is not a picture of a highlighter. It is the plugin's own syntax: `==`,
drawn as two bars cut at the angle of a chisel nib. Violet over electric yellow,
the two colours the plugin actually writes.

The wordmark highlights its own first word. That is the whole product in one image.

## Colour

Both palettes are the plugin's shipped defaults, straight out of `main.js`.
Use them and nothing else.

| Role | Hex | Notes |
| --- | --- | --- |
| Violet | `#8E44FF` | Primary. The default Purple text colour. |
| Electric yellow | `#FFE814` | Accent. The default Yellow highlight. |
| Ink | `#0B0910` | Dark ground. Never pure black. |
| Paper | `#F6F4FB` | Light ground. Never pure white. |
| Muted | `#8B8399` | Secondary text on ink. |
| Violet deep | `#4E12AE` | Gradients and glows only. |

Highlight palette: `#FFE814` `#7BF59B` `#4FE8E0` `#6BB8FF` `#FF7AB8` `#FFA53D`
Text palette: `#E01B24` `#F57C00` `#00B8B0` `#1A73E8` `#00A152` `#8E44FF`

The twelve swatches are a brand element in their own right. A row of them says
what the plugin does without a word of copy.

## Type

| Use | Face | Setting |
| --- | --- | --- |
| Wordmark and display | TeX Gyre Adventor Bold (URW Gothic, an Avant Garde Gothic clone) | Uppercase, tracking 0.115em |
| Body and captions | TeX Gyre Heros (a Helvetica clone) | Regular and Bold |
| Code, labels, metadata | DejaVu Sans Mono | Uppercase for labels, tracking 0.22em |

Substitutes if those are not installed: Poppins or Century Gothic for display,
Helvetica or Arial for body, any grotesque mono for code. Never set the wordmark
in a humanist or a serif face.

## Geometry

Everything is built on one angle. The chisel cut runs 42 percent of the cap
height horizontally for every unit of vertical, which is roughly 47 degrees.
Bars, bands, rules and the wordmark's highlight all use the same cut. Nothing in
this identity has a rounded end.

## Files

| File | Use |
| --- | --- |
| `mark.svg` | The mark, full colour, on any ground |
| `mark-mono.svg` | Single colour, inherits `currentColor` |
| `mark-glow.svg` | Mark with a bloom, for dark grounds and video only |
| `mark-512.png` | Transparent raster of the mark |
| `tile.svg` | App tile, dark ground with grid and glow |
| `icon-512.png` … `icon-16.png` | Rasters of the tile, for avatars and favicons |
| `wordmark-on-dark.svg` | Primary lockup for dark grounds |
| `wordmark-on-light.svg` | Primary lockup for light grounds |
| `wordmark-plain-on-dark.svg` | Type only, no mark, no band |
| `wordmark-plain-on-light.svg` | Same, for light grounds |
| `obsidian-icon.svg` | 100x100 path pair for Obsidian's `addIcon` |
| `../docs/social-preview.png` | 1280x640, GitHub repo social preview |
| `../docs/banner.png` | 1600x420, README header |

## Using the mark inside the plugin

Obsidian's `addIcon` wants inner SVG content on a 100 by 100 grid. To replace the
built-in highlighter icon on the ribbon and in the status bar:

```js
addIcon("highlight-pen", `
  <path d="M34.375 28.125 H87.5 L68.75 45.3125 H15.625 Z" fill="currentColor"/>
  <path d="M34.375 54.6875 H87.5 L68.75 71.875 H15.625 Z" fill="currentColor"/>
`);
```

Then pass `"highlight-pen"` wherever `"highlighter"` is passed today. It inherits
the theme's colour, so it goes violet on its own when the pen is on, through the
existing `--text-accent` rule in `styles.css`.

This is optional. The built-in icon is perfectly serviceable and costs nothing.

## Do not

- Do not put the violet bar below the yellow one. Violet is the pen, yellow is
  the ink it has already laid down.
- Do not round the ends of the bars, and do not make the two bars different
  lengths.
- Do not set the mark on a mid tone. It needs ink or paper.
- Do not recolour the mark to match a theme. The two colours are the identity.
- Do not stretch the wordmark, and do not retype it in another face. Use the SVG.
- Do not add a drop shadow. Use `mark-glow.svg` if the mark needs to lift.
