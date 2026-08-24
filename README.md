# Highlight Pen

Switch the pen on, then just select text. It gets styled the moment you release the mouse. No menus, no hotkeys, no `==` typed by hand.

Select the same text again and the style comes off. Painting twice is undo.

<!--
  TODO before submitting: a GIF here does more than every paragraph below it.
  Record about 6 seconds: pen on, drag over a few phrases, drag over one again to
  remove it. Save as docs/demo.gif and uncomment:

  ![Highlight Pen in action](docs/demo.gif)
-->

## Why you might want it

Obsidian already has commands for bold, italic and highlight. They work one selection at a time, and each one costs a keystroke or a trip to a menu. If you're reading through a long note marking things up, that friction adds up.

Highlight Pen inverts it. Choose a style once, leave the pen on, and marking up a page becomes selection after selection, much closer to dragging a real highlighter down a printed page.

## Install

**From the community store.** Settings → Community plugins → Browse → search "Highlight Pen" → Install → Enable.

**Manually.** Download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest), put them in `<vault>/.obsidian/plugins/highlight-pen/`, then reload Obsidian and enable the plugin under Community plugins. Restricted mode must be off.

## Use it

1. Find the pen in the status bar, on the bottom right of the Obsidian window.
2. Click **OFF** so it reads **ON**. The cursor becomes a crosshair over the editor.
3. Select text.

That's the whole thing. The toolbar next to the switch holds the six styles:

| | Style | Writes |
| --- | --- | --- |
| 🖍 | Highlight | `==text==`, or `<mark>` with a colour |
| **B** | Bold | `**text**` |
| *I* | Italic | `*text*` or `_text_` |
| <u>U</u> | Underline | `<u>text</u>` |
| ~~S~~ | Strikethrough | `~~text~~` |
| 🎨 | Text colour | `<span style="color: …">` |

Click a style to switch to it. Click the colour icon to pick a colour.

### Mixing styles

Click more than one style and they all apply at once. Bold plus underline plus a colour gives you:

```markdown
<span style="color: #e01b24;"><u>**important**</u></span>
```

Markdown always ends up innermost and HTML outermost, whatever order you clicked them in, so if the HTML is ever stripped out, the bold survives.

Painting the same mix again removes all of it. `Ctrl`/`⌘`+click a style to drop back to that one alone.

### Layouts

The status bar has two looks, switchable from the **▴** arrow:

- **Toolbar**: all six styles on show
- **Compact**: only the styles currently active

### Hotkeys worth setting

Settings → Hotkeys → search "Highlight Pen":

| Command | Suggestion |
| --- | --- |
| Toggle pen on/off | `Ctrl+Alt+P` |
| Next style | `Ctrl+Alt+N` |
| Open style picker | `Ctrl+Alt+K` |
| Set style: highlight / bold / … | one each, if you switch often |
| Add or remove style: … | for building a mix from the keyboard |
| Apply current style to selection | works with the pen **off**, for one-off use |

That last one matters. If always-on painting turns out not to suit you, leave the pen off and use Highlight Pen as an ordinary hotkey plugin.

## What it won't touch

The pen refuses to write into places where markers would break something:

- fenced and inline code
- inline and display math
- `[[wiki links]]`, and the `](url)` half of markdown links. The link *text* is still fair game
- YAML frontmatter

You get a brief notice when it declines. If your selection only partly covers something already formatted, the pen grows it out to the whole run rather than splitting the markers and leaving broken markdown behind.

Both behaviours are the **Protect code, math and links** setting, on by default.

## Highlight Pen settings

Open them at **Settings → Highlight Pen**, listed in the left sidebar under Community plugins.

| Setting | What it does |
| --- | --- |
| **Mix styles** | Let several styles apply at once. Off means clicking a style always replaces the current one. |
| **Protect code, math and links** | Skip protected regions, and snap partial selections out to whole runs. |
| **Highlight output** | `==text==` (portable, theme's yellow) or `<mark style="…">` (any colour, HTML). |
| **Italic marker** | `*` or `_`, for themes and linters that prefer underscores. |
| **Single stroke** | Pen switches itself off after one selection. |
| **Keyboard selections** | Also paint shift+arrow selections, applied when you release shift. |
| **Minimum characters** | Ignore short selections, so a stray double-click doesn't paint a word. Default 2. |
| **Status bar layout** | Toolbar shows every style; compact shows only the ones that are on. |
| **Status bar control** | Hide the pen from the status bar entirely. Needs a reload. |
| **Palettes** | Name and edit your own highlight and text colours, with a reset button. |

## A note on portability

Not everything the pen writes is standard markdown, and it's worth knowing which is which:

- `**bold**`, `*italic*` and `~~strikethrough~~` are CommonMark. They travel anywhere.
- `==highlight==` is an Obsidian and extended-markdown convention, not CommonMark. Some renderers show the `==` literally.
- Underline and text colour have no markdown equivalent at all, so they're written as `<u>` and `<span style="…">`. Obsidian renders them and they survive export to HTML, but not conversion to plain markdown.

If portability is what you care about, stay on markdown highlight output and the three standard styles.

## Compatibility

Desktop only. Obsidian's status bar doesn't exist on mobile, and the status bar is where this plugin lives.

Requires Obsidian 1.4.0 or newer. No build step, no dependencies. `main.js` is plain JavaScript you can read.

## Development

```bash
node test.js
```

59 assertions covering marker collisions, protected regions, selection snapping, style mixing and colour validation. No dependencies; it stubs the Obsidian API and drives the plugin against a fake editor.

To work against a live plugin, junction the repo into a scratch vault:

```powershell
cmd /c mklink /J "<vault>\.obsidian\plugins\highlight-pen" "<path to this repo>"
```

Don't do that inside a vault synced by Dropbox, Google Drive or similar. A junction is machine-local and sync clients handle them badly.

## Support

Bugs and requests: [open an issue](../../issues).

If it saves you time, you can [buy me a coffee](https://ko-fi.com/AlbyVitt). Entirely optional, and the plugin is free and always will be.

## Licence

MIT. See [LICENSE](LICENSE).
