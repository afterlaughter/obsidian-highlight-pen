# Changelog

All notable changes to Highlight Pen are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).
Obsidian release tags carry no `v` prefix, so the tag for 1.1.0 is `1.1.0`.

## [1.1.0]

First public release.

### Added

- **Style mixing.** Several styles can apply to one selection. Click styles in
  the toolbar to add or remove them; `Ctrl`/`Cmd`+click drops back to one. The
  nesting order is fixed, so a given set of styles always produces the same
  markup. Painting the same mix again removes all of it.
- Mixes involving underline or text colour are written entirely as HTML.
  Obsidian does not combine markdown emphasis with inline HTML in either
  direction, so `<u>**word**</u>` renders the asterisks literally and
  `**<u>word</u>**` loses the bold. All-HTML is the only spelling that renders.
  Single styles are unaffected and stay as plain markdown.
- **Protection for code, math and links.** The pen refuses to write into fenced
  or inline code, inline or display math, wiki links, the target half of a
  markdown link, and YAML frontmatter. Link text is still paintable. A short
  notice explains when it declines.
- **Selection snapping.** A selection that only partly covers formatted text now
  grows out to the whole run instead of splitting the markers.
- **Status bar toolbar.** Every style is reachable as an icon, with an explicit
  ON/OFF button and an arrow for colours and options. A compact layout shows
  only the styles currently on.
- **Aqua** in both colour palettes, and a reset button for each palette.
- Commands to add or remove an individual style, and to reset to a single style.
- An intro in the settings tab and a one-time notice on first enable, since
  select-to-style is not guessable from the status bar alone.

### Changed

- Brighter, more saturated default palettes.
- Marked desktop only. Obsidian has no status bar on mobile, and the status bar
  is where the plugin lives.
- Colour values are validated as hex before they reach a note.

### Fixed

- The italic pen no longer eats bold markers. A single `*` could match one half
  of a `**` pair, so painting italic over `**bold**` quietly produced `*bold*`.
  Same for `_` and `__`.
- The cursor no longer lands off the end of the first line after a multi-line
  edit. Character counts were being added to a column position, ignoring newlines.
- Two selections landing within the same 10ms settle window can no longer both
  paint. The guard was set inside the timeout rather than before it.
- Palettes saved by an earlier version no longer hide colours added later.
  Saved settings replaced the defaults wholesale, so new colours were invisible
  to anyone who had used the plugin before. Missing entries are now appended by
  name, leaving customised colours alone.

## [1.0.1]

Not distributed. Repository was private.

- Author name in the manifest.
- Release workflow made safe to re-run: it now updates an existing release
  rather than failing on it.
- `actions/checkout` bumped to v5 to clear the Node 20 deprecation warning.

## [1.0.0]

Not distributed. Repository was private.

Initial build: pen toggle, six styles, status bar and ribbon controls, commands
for toggling and cycling styles, and a settings tab covering markdown or HTML
highlight output, italic marker, single-stroke mode, keyboard selections,
minimum selection length, status bar visibility and editable colour palettes.

[1.1.0]: https://github.com/afterlaughter/obsidian-highlight-pen/releases/tag/1.1.0
[1.0.1]: https://github.com/afterlaughter/obsidian-highlight-pen/releases/tag/1.0.1
[1.0.0]: https://github.com/afterlaughter/obsidian-highlight-pen/releases/tag/1.0.0
