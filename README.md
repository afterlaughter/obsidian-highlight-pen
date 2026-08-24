# Highlight Pen

Turn the cursor into a pen. Pick a style once, and every selection you make gets that style — no `==`, no menus.

## Install

1. In your vault, create the folder `.obsidian/plugins/highlight-pen/`
2. Copy `main.js`, `manifest.json` and `styles.css` into it
3. Obsidian → Settings → Community plugins → **Reload plugins** (or restart), then enable **Highlight Pen**

Restricted mode must be off. No build step, no dependencies — it's plain JavaScript.

## Use

- **Status bar, bottom right:** click to turn the pen on/off, right-click to change style or colour
- **Ribbon:** the highlighter icon toggles the pen too
- **On:** select text with the mouse and it's styled immediately; the cursor turns into a crosshair so you always know the pen is live

Styles: highlight, bold, italic, underline, strikethrough, text colour.

**Painting over the same text again removes the style.** It detects markers whether they're inside your selection or wrapped just outside it, so you can undo a highlight by re-selecting the words.

## Hotkeys worth setting

Settings → Hotkeys → search "Highlight Pen":

| Command | Suggestion |
| --- | --- |
| Toggle pen on/off | `Ctrl+Alt+P` |
| Next style | `Ctrl+Alt+N` |
| Open style picker | `Ctrl+Alt+K` |
| Set style: highlight / bold / italic … | one each, if you switch often |
| Apply current style to selection | works with the pen **off**, for one-off use |

That last one is the useful one if you decide always-on painting gets in the way: leave the pen off and use it as a plain hotkey.

## Settings

- **Highlight output** — `==text==` (portable markdown, theme's yellow) or `<mark style="background-color:…">` (any colour, HTML)
- **Italic marker** — `*` or `_`
- **Single stroke** — pen switches itself off after one selection
- **Keyboard selections** — also paint shift+arrow selections, applied when you release shift
- **Minimum characters** — default 2, so a stray click or double-click doesn't paint a word
- **Palettes** — name and edit your own highlight and text colours; the tick button sets one as current, and they all appear in the right-click picker

## Notes

Bold, italic and strikethrough use standard markdown, so they stay portable. Underline and text colour have no markdown equivalent and are written as `<u>` and `<span style="color:…">` — Obsidian renders both fine, and they survive export to HTML but not to plain-markdown tools.

Reading view is ignored; the pen only works in Source and Live Preview, where the text is editable.
