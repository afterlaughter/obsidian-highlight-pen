"use strict";

const {
  Plugin,
  PluginSettingTab,
  Setting,
  MarkdownView,
  Menu,
  Notice,
  setIcon,
  Platform,
} = require("obsidian");

/* ------------------------------------------------------------------ *
 * Defaults
 * ------------------------------------------------------------------ */

const TOOL_LABELS = {
  highlight: "Highlight",
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strikethrough: "Strikethrough",
  color: "Text colour",
};

const TOOL_ICONS = {
  highlight: "highlighter",
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikethrough: "strikethrough",
  color: "palette",
};

/** Display order in the toolbar and menus. */
const TOOL_ORDER = ["highlight", "bold", "italic", "underline", "strikethrough", "color"];

/**
 * Order styles are applied in when several are mixed, innermost first. Fixed,
 * so the same set of styles always produces the same markup no matter which
 * order they were clicked in.
 */
const MIX_ORDER = ["bold", "italic", "strikethrough", "highlight", "underline", "color"];

const DEFAULT_HIGHLIGHT_PALETTE = [
  { name: "Yellow", color: "#ffe814" },
  { name: "Green", color: "#7bf59b" },
  { name: "Aqua", color: "#4fe8e0" },
  { name: "Blue", color: "#6bb8ff" },
  { name: "Pink", color: "#ff7ab8" },
  { name: "Orange", color: "#ffa53d" },
];

const DEFAULT_TEXT_PALETTE = [
  { name: "Red", color: "#e01b24" },
  { name: "Orange", color: "#f57c00" },
  { name: "Aqua", color: "#00b8b0" },
  { name: "Blue", color: "#1a73e8" },
  { name: "Green", color: "#00a152" },
  { name: "Purple", color: "#8e44ff" },
];

const DEFAULT_SETTINGS = {
  penOn: false,
  tools: ["highlight"],
  highlightColor: "#ffe814",
  textColor: "#e01b24",
  highlightStyle: "markdown", // "markdown" (==text==) or "mark" (<mark style=...>)
  italicMarker: "*",
  oneShot: false,
  keyboardSelection: true,
  minLength: 2,
  showStatusBar: true,
  statusBarMode: "toolbar", // "toolbar" (every style) or "compact" (active style only)
  guardMarkup: true,
  allowMixing: true,
  introShown: false,
  highlightPalette: DEFAULT_HIGHLIGHT_PALETTE.map((e) => ({ ...e })),
  textPalette: DEFAULT_TEXT_PALETTE.map((e) => ({ ...e })),
};

const FALLBACK_COLORS = { highlight: "#ffe814", text: "#e01b24" };

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Colour values end up inside an HTML style attribute that gets written into
 * the user's note. data.json is a plain file that syncs between machines, so a
 * corrupted or hand-edited value could otherwise break out of the attribute and
 * inject live markup. Only hex is ever allowed through.
 */
function safeColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value.trim())
    ? value.trim()
    : fallback;
}

/**
 * Saved palettes take precedence over the defaults, so a user who installed an
 * earlier version would never see colours added later. Append anything missing
 * by name rather than overwriting what they've customised.
 */
function mergePalette(saved, defaults) {
  const list = Array.isArray(saved) ? saved.filter((e) => e && typeof e.name === "string") : [];
  const have = new Set(list.map((e) => e.name.toLowerCase()));
  for (const entry of defaults) {
    if (!have.has(entry.name.toLowerCase())) list.push({ ...entry });
  }
  return list;
}

function markersFor(tool, s) {
  switch (tool) {
    case "highlight":
      if (s.highlightStyle === "mark") {
        const c = safeColor(s.highlightColor, FALLBACK_COLORS.highlight);
        return {
          open: `<mark style="background-color: ${c};">`,
          close: "</mark>",
          inOpen: /^<mark\b[^>]*>/,
          inClose: /<\/mark>$/,
          outOpen: /<mark\b[^>]*>$/,
          outClose: /^<\/mark>/,
        };
      }
      return { open: "==", close: "==" };
    case "bold":
      return { open: "**", close: "**" };
    case "italic": {
      // A single "*" must not match one half of a "**" bold pair, or the italic
      // pen quietly turns **bold** into *italic*. Same for "_" and "__".
      const mk = s.italicMarker === "_" ? "_" : "*";
      const e = escapeRe(mk);
      return {
        open: mk,
        close: mk,
        inOpen: new RegExp(`^${e}(?!${e})`),
        inClose: new RegExp(`(?<!${e})${e}$`),
        outOpen: new RegExp(`(?<!${e})${e}$`),
        outClose: new RegExp(`^${e}(?!${e})`),
      };
    }
    case "strikethrough":
      return { open: "~~", close: "~~" };
    case "underline":
      return {
        open: "<u>",
        close: "</u>",
        inOpen: /^<u>/,
        inClose: /<\/u>$/,
        outOpen: /<u>$/,
        outClose: /^<\/u>/,
      };
    case "color": {
      const c = safeColor(s.textColor, FALLBACK_COLORS.text);
      return {
        open: `<span style="color: ${c};">`,
        close: "</span>",
        inOpen: /^<span\b[^>]*>/,
        inClose: /<\/span>$/,
        outOpen: /<span\b[^>]*>$/,
        outClose: /^<\/span>/,
      };
    }
    default:
      return { open: "==", close: "==" };
  }
}

/**
 * HTML equivalents of the markdown styles.
 *
 * Obsidian will not combine markdown emphasis with inline HTML in either
 * direction: `<u>**word**</u>` shows the asterisks literally, and
 * `**<u>word</u>**` drops the bold. `<u><strong>word</strong></u>` renders
 * correctly, so any mix that already needs HTML uses HTML throughout.
 */
function htmlMarkersFor(tool, s) {
  switch (tool) {
    case "bold":
      return { open: "<strong>", close: "</strong>", inOpen: /^<strong>/, inClose: /<\/strong>$/ };
    case "italic":
      return { open: "<em>", close: "</em>", inOpen: /^<em>/, inClose: /<\/em>$/ };
    case "strikethrough":
      return { open: "<s>", close: "</s>", inOpen: /^<s>/, inClose: /<\/s>$/ };
    case "highlight":
      if (s.highlightStyle === "mark") return markersFor("highlight", s);
      return { open: "<mark>", close: "</mark>", inOpen: /^<mark\b[^>]*>/, inClose: /<\/mark>$/ };
    default:
      return markersFor(tool, s);
  }
}

/** True when a mix contains a style that can only be written as HTML. */
function needsHtml(tools, s) {
  return tools.some(
    (t) => t === "underline" || t === "color" || (t === "highlight" && s.highlightStyle === "mark")
  );
}

function fillRegexes(m) {
  return {
    open: m.open,
    close: m.close,
    inOpen: m.inOpen || new RegExp("^" + escapeRe(m.open)),
    inClose: m.inClose || new RegExp(escapeRe(m.close) + "$"),
    outOpen: m.outOpen || new RegExp(escapeRe(m.open) + "$"),
    outClose: m.outClose || new RegExp("^" + escapeRe(m.close)),
  };
}

/* ------------------------------------------------------------------ *
 * Markup awareness
 * ------------------------------------------------------------------ */

function pushMatches(doc, re, out, skip) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(doc)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const start = m.index;
    const end = m.index + m[0].length;
    if (!skip || !skip.some(([s, e]) => start < e && end > s)) out.push([start, end]);
  }
}

/**
 * Fenced code blocks, scanned line by line.
 *
 * This was a regex once. With the multiline flag `$` matches at the end of
 * every line, so the lazy body terminated at the first line break and only the
 * opening fence plus one line were ever protected. Fences are a line-oriented
 * construct; walking the lines is both correct and easier to read.
 */
function fencedRegions(doc) {
  const out = [];
  const lines = doc.split("\n");
  const opener = /^[ \t]{0,3}(`{3,}|~{3,})/;
  const closer = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*\r?$/;

  let offset = 0;
  let open = null;

  for (const line of lines) {
    if (open) {
      const close = line.match(closer);
      // A closing fence uses the same character and is at least as long.
      if (close && close[1][0] === open.char && close[1].length >= open.len) {
        out.push([open.start, offset + line.length]);
        open = null;
      }
    } else {
      const start = line.match(opener);
      if (start) open = { char: start[1][0], len: start[1].length, start: offset };
    }
    offset += line.length + 1;
  }

  // An unterminated fence protects everything to the end of the note.
  if (open) out.push([open.start, doc.length]);

  return out;
}

/** Ranges the pen must never write into. */
function protectedRegions(doc) {
  const regions = [];

  if (/^---\r?\n/.test(doc)) {
    const close = doc.search(/\r?\n---[ \t]*(\r?\n|$)/);
    if (close !== -1) {
      const after = doc.indexOf("\n", close + 1);
      regions.push([0, after === -1 ? doc.length : after]);
    }
  }

  for (const r of fencedRegions(doc)) regions.push(r);
  pushMatches(doc, /\$\$[\s\S]*?\$\$/g, regions);

  const blocks = regions.slice();

  pushMatches(doc, /(`+)[^`\n]*?\1/g, regions, blocks);
  pushMatches(doc, /(?<!\$)\$(?!\$)[^\n$]+?\$(?!\$)/g, regions, blocks);
  pushMatches(doc, /!?\[\[[^\]\n]*\]\]/g, regions, blocks);
  pushMatches(doc, /\]\([^)\n]*\)/g, regions, blocks);

  return regions;
}

/**
 * Complete emphasis spans, used to grow a partial selection out to whole runs.
 *
 * Styles nest, so `~~***word***~~` has to yield both the outer and the inner
 * span. Only the asterisk and underscore families are mutually exclusive, since
 * a run of three would otherwise also match the two- and one-character
 * patterns; those are resolved longest-first among themselves. Everything else
 * is free to overlap.
 */
function emphasisSpans(doc, skip) {
  const guarded = skip || [];
  const spans = [];

  // Distinct delimiters, allowed to nest with anything.
  for (const re of [
    /<mark\b[^>]*>[\s\S]*?<\/mark>/g,
    /<span\b[^>]*>[\s\S]*?<\/span>/g,
    /<u>[\s\S]*?<\/u>/g,
    /<strong>[\s\S]*?<\/strong>/g,
    /<em>[\s\S]*?<\/em>/g,
    /<s>[\s\S]*?<\/s>/g,
    /==[^\n]+?==/g,
    /~~[^\n]+?~~/g,
  ]) {
    pushMatches(doc, re, spans, guarded);
  }

  // Asterisk and underscore runs, longest first so "***" wins over "**".
  // The two characters get separate exclusion lists: a run of three asterisks
  // must not also match the two-asterisk pattern, but "_**word**_" is a real
  // underscore span wrapped around a real asterisk span and both are wanted.
  for (const family of [
    [/\*\*\*[^\n]+?\*\*\*/g, /\*\*[^\n]+?\*\*/g, /(?<![*\w])\*(?!\*)[^\n]+?(?<!\*)\*(?!\*)/g],
    [/___[^\n]+?___/g, /__[^\n]+?__/g, /(?<![_\w])_(?!_)[^\n]+?(?<!_)_(?!_)/g],
  ]) {
    const taken = guarded.slice();
    for (const re of family) {
      const found = [];
      pushMatches(doc, re, found, taken);
      for (const span of found) {
        spans.push(span);
        taken.push(span);
      }
    }
  }

  return spans;
}

/**
 * Markers for a mix, in application order.
 *
 * Bold and italic share the "*" character, so bold + italic is a single run of
 * three, not "**" wrapped around "*". Left as two markers, the italic detector
 * (which refuses to match half of a "**" pair) cannot see its own marker inside
 * "***", so painting the mix a second time nests it instead of removing it.
 * Folding them into one "***" marker makes both directions symmetrical.
 */
function mixMarkers(tools, s) {
  return mixMarkerSets(tools, s)[0];
}

/**
 * Both ways a mix can be written, current mode first. Wrapping uses the first;
 * removing tries each in turn, so text styled before the HTML switch (or by an
 * older version of the plugin) still comes off cleanly.
 */
function mixMarkerSets(tools, s) {
  const html = tools.map((t) => fillRegexes(htmlMarkersFor(t, s)));
  const md = markdownMixMarkers(tools, s);
  return needsHtml(tools, s) ? [html, md] : [md, html];
}

function markdownMixMarkers(tools, s) {
  const italicChar = s.italicMarker === "_" ? "_" : "*";
  const collide = tools.includes("bold") && tools.includes("italic") && italicChar === "*";
  const out = [];

  for (const tool of tools) {
    if (collide && tool === "italic") continue; // folded into the bold entry
    if (collide && tool === "bold") {
      out.push(
        Object.assign(
          fillRegexes({
            open: "***",
            close: "***",
            inOpen: /^\*\*\*(?!\*)/,
            inClose: /(?<!\*)\*\*\*$/,
            outOpen: /(?<!\*)\*\*\*$/,
            outClose: /^\*\*\*(?!\*)/,
          }),
          { runChar: "*" }
        )
      );
      continue;
    }
    out.push(fillRegexes(markersFor(tool, s)));
  }

  return out;
}

/**
 * Strip whichever of these markers happen to be there, ignoring the rest.
 * Used to convert text already styled in the other spelling: `**word**` gaining
 * underline has to become `<u><strong>word</strong></u>`, not
 * `<u><strong>**word**</strong></u>`.
 */
function peelSome(core, markers) {
  let text = core;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 12) {
    changed = false;
    for (let i = markers.length - 1; i >= 0; i--) {
      const m = markers[i];
      if (m.inOpen.test(text) && m.inClose.test(text)) {
        const next = text.replace(m.inOpen, "").replace(m.inClose, "");
        if (next.trim()) {
          text = next;
          changed = true;
        }
      }
    }
  }
  return text;
}

/**
 * Strip every marker from `core`, outermost first. Returns null if any of them
 * isn't actually there, meaning this is not a "paint twice" undo.
 */
function peelAll(core, markers) {
  let text = core;
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    if (!m.inOpen.test(text) || !m.inClose.test(text)) return null;
    text = text.replace(m.inOpen, "").replace(m.inClose, "");
  }
  return text;
}

function overlapsAny(a, b, regions) {
  return regions.some(([s, e]) => a < e && b > s);
}

/** Grow [a, b] so it never cuts a formatted run in half. */
function snapToSpans(a, b, spans) {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 20) {
    changed = false;
    for (const [s, e] of spans) {
      const overlapping = a < e && b > s;
      const contained = a <= s && b >= e;
      if (overlapping && !contained) {
        if (s < a) {
          a = s;
          changed = true;
        }
        if (e > b) {
          b = e;
          changed = true;
        }
      }
    }
  }
  return [a, b];
}

/* ------------------------------------------------------------------ *
 * Plugin
 * ------------------------------------------------------------------ */

class PenModePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.migrateSettings();

    this.busy = false;
    this.pending = null;
    this.lastNotice = 0;

    this.addSettingTab(new PenModeSettingTab(this.app, this));
    this.buildStatusBar();

    this.ribbonEl = this.addRibbonIcon("highlighter", "Toggle Highlight Pen", () => this.togglePen());
    this.refreshRibbon();

    this.addCommand({
      id: "toggle-pen",
      name: "Toggle pen on/off",
      callback: () => this.togglePen(),
    });

    this.addCommand({
      id: "apply-once",
      name: "Apply current style to selection",
      editorCallback: (editor) => this.applyTools(editor),
    });

    this.addCommand({
      id: "cycle-tool",
      name: "Next style",
      callback: () => {
        const i = TOOL_ORDER.indexOf(this.primaryTool());
        this.setTools([TOOL_ORDER[(i + 1) % TOOL_ORDER.length]]);
      },
    });

    this.addCommand({
      id: "open-picker",
      name: "Open style picker",
      callback: () => this.openMenu(),
    });

    this.addCommand({
      id: "clear-mix",
      name: "Reset to a single style",
      callback: () => this.setTools([this.primaryTool()]),
    });

    for (const tool of TOOL_ORDER) {
      this.addCommand({
        id: `set-tool-${tool}`,
        name: `Set style: ${TOOL_LABELS[tool].toLowerCase()}`,
        callback: () => this.setTools([tool]),
      });
      this.addCommand({
        id: `toggle-tool-${tool}`,
        name: `Add or remove style: ${TOOL_LABELS[tool].toLowerCase()}`,
        callback: () => this.toggleTool(tool),
      });
    }

    // Said once, ever. The select-to-style idea isn't guessable from the
    // status bar alone, and there's nowhere else in the app to explain it.
    if (!this.settings.introShown) {
      this.settings.introShown = true;
      this.saveSettings();
      this.app.workspace.onLayoutReady(() => {
        new Notice(
          "Highlight Pen: switch it ON in the status bar, on the bottom right of the window, then select any text to style it. Select it again to remove the style.",
          8000
        );
      });
    }

    this.registerDomEvent(document, "mouseup", (evt) => {
      const target = evt.target;
      if (!target || typeof target.closest !== "function") return;
      if (!target.closest(".cm-editor")) return;
      this.handleSelection();
    });

    this.registerDomEvent(document, "keyup", (evt) => {
      if (!this.settings.keyboardSelection) return;
      if (evt.key !== "Shift") return;
      this.handleSelection();
    });

    this.registerDomEvent(document, "touchend", (evt) => {
      const target = evt.target;
      if (!target || typeof target.closest !== "function") return;
      if (!target.closest(".cm-editor")) return;
      this.handleSelection();
    });
  }

  onunload() {
    if (this.pending) window.clearTimeout(this.pending);
    document.body.removeClass("pen-mode-active");
  }

  /** Bring settings written by earlier versions up to date. */
  migrateSettings() {
    const s = this.settings;

    // 1.0.x stored a single `tool` string.
    if (!Array.isArray(s.tools) || s.tools.length === 0) {
      s.tools = [TOOL_ORDER.includes(s.tool) ? s.tool : "highlight"];
    }
    s.tools = s.tools.filter((t) => TOOL_ORDER.includes(t));
    if (s.tools.length === 0) s.tools = ["highlight"];
    delete s.tool;

    // Colours added in later versions would otherwise never appear.
    s.highlightPalette = mergePalette(s.highlightPalette, DEFAULT_HIGHLIGHT_PALETTE);
    s.textPalette = mergePalette(s.textPalette, DEFAULT_TEXT_PALETTE);

    s.highlightColor = safeColor(s.highlightColor, FALLBACK_COLORS.highlight);
    s.textColor = safeColor(s.textColor, FALLBACK_COLORS.text);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /* ---------------- state ---------------- */

  primaryTool() {
    return this.settings.tools[0] || "highlight";
  }

  /** Active styles in the order they get applied, innermost first. */
  activeTools() {
    return MIX_ORDER.filter((t) => this.settings.tools.includes(t));
  }

  /** Active styles in toolbar order, so compact matches the toolbar's layout. */
  displayTools() {
    const active = TOOL_ORDER.filter((t) => this.settings.tools.includes(t));
    return active.length ? active : [this.primaryTool()];
  }

  isActive(tool) {
    return this.settings.tools.includes(tool);
  }

  togglePen() {
    this.setPen(!this.settings.penOn);
  }

  setPen(on) {
    this.settings.penOn = on;
    this.saveSettings();
    this.refreshStatusBar();
    this.refreshRibbon();
    document.body.toggleClass("pen-mode-active", on);
  }

  setTools(tools) {
    const next = tools.filter((t) => TOOL_ORDER.includes(t));
    this.settings.tools = next.length ? next : ["highlight"];
    this.saveSettings();
    this.refreshStatusBar();
  }

  /** Add or remove one style from the mix, never emptying it. */
  toggleTool(tool) {
    if (!this.settings.allowMixing) return this.setTools([tool]);
    const set = this.settings.tools.slice();
    const i = set.indexOf(tool);
    if (i === -1) set.push(tool);
    else if (set.length > 1) set.splice(i, 1);
    this.setTools(set);
  }

  setColor(hex) {
    const safe = safeColor(hex, null);
    if (!safe) return;
    if (this.isActive("color") && !this.isActive("highlight")) this.settings.textColor = safe;
    else if (this.isActive("highlight") && !this.isActive("color")) this.settings.highlightColor = safe;
    else this.settings.textColor = safe;
    this.saveSettings();
    this.refreshStatusBar();
  }

  colorContext() {
    if (this.isActive("color")) return "text";
    if (this.isActive("highlight") && this.settings.highlightStyle === "mark") return "highlight";
    return null;
  }

  currentColor() {
    return this.colorContext() === "highlight"
      ? safeColor(this.settings.highlightColor, FALLBACK_COLORS.highlight)
      : safeColor(this.settings.textColor, FALLBACK_COLORS.text);
  }

  /** Dragging over a code block shouldn't produce a wall of notices. */
  notify(message) {
    const now = Date.now();
    if (now - this.lastNotice < 1500) return;
    this.lastNotice = now;
    new Notice(message, 2500);
  }

  /* ---------------- status bar ---------------- */

  buildStatusBar() {
    if (!this.settings.showStatusBar) return;
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("pen-mode-status");
    this.statusEl.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.openMenu(evt);
    });
    this.refreshStatusBar();
  }

  makeButton(parent, cls, icon, label) {
    const el = parent.createSpan({ cls });
    if (icon) setIcon(el, icon);
    el.setAttribute("aria-label", label);
    // Without this the tooltip renders over the toolbar itself.
    el.setAttribute("data-tooltip-position", "top");
    return el;
  }

  /** One tool button, shared by both layouts. */
  addToolButton(tool) {
    const mod = Platform.isMacOS ? "⌘" : "Ctrl";
    const active = this.isActive(tool);

    let label = TOOL_LABELS[tool];
    if (this.settings.allowMixing) {
      label += active ? ": click to remove" : ": click to add";
      label += `, ${mod}+click for this style alone`;
    }
    if (tool === "color") label += active ? " · pick a colour" : "";

    const btn = this.makeButton(
      this.statusEl,
      `pen-mode-tool${tool === "color" ? " pen-mode-color" : ""}`,
      TOOL_ICONS[tool],
      label
    );
    btn.toggleClass("is-active", active);

    if (tool === "color") {
      btn.createSpan({ cls: "pen-mode-color-chip" }).style.backgroundColor = safeColor(
        this.settings.textColor,
        FALLBACK_COLORS.text
      );
    }

    btn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      // Plain click toggles the style in or out of the mix; the modifier is the
      // escape hatch back to a single style.
      const solo = !this.settings.allowMixing || evt.ctrlKey || evt.metaKey;
      if (solo) this.setTools([tool]);
      else this.toggleTool(tool);
      if (!this.settings.penOn && this.isActive(tool)) this.setPen(true);
      if (tool === "color" && this.isActive("color")) this.openColorMenu(evt);
    });

    return btn;
  }

  refreshStatusBar() {
    if (!this.statusEl) return;
    this.statusEl.empty();

    const on = this.settings.penOn;
    const toolbar = this.settings.statusBarMode === "toolbar";
    this.statusEl.toggleClass("is-on", on);
    this.statusEl.toggleClass("is-toolbar", toolbar);
    this.statusEl.toggleClass("is-compact", !toolbar);

    // Identifies the group. A row of icons in a shared status bar otherwise
    // gives no clue whose they are or what arming them does.
    const names = this.displayTools().map((t) => TOOL_LABELS[t].toLowerCase()).join(" + ");
    this.statusEl.setAttribute(
      "aria-label",
      on
        ? `Highlight Pen is on. Select text to apply ${names}`
        : `Highlight Pen: switch ON, then select text to apply ${names}`
    );
    this.statusEl.setAttribute("data-tooltip-position", "top");

    /* On/off, an explicit button in both layouts. */
    const power = this.makeButton(
      this.statusEl,
      "pen-mode-power",
      "power",
      on ? "Pen is on. Click to turn off." : "Pen is off. Click to turn on."
    );
    power.toggleClass("is-on", on);
    power.createSpan({ cls: "pen-mode-power-label", text: on ? "ON" : "OFF" });
    power.addEventListener("click", (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      this.togglePen();
    });

    // Toolbar offers every style; compact shows only the ones that are on.
    const shown = toolbar ? TOOL_ORDER : this.displayTools();
    for (const tool of shown) this.addToolButton(tool);

    const caret = this.makeButton(this.statusEl, "pen-mode-caret", null, "More options");
    caret.setText("▴"); // menus open upward from the status bar
    caret.addEventListener("click", (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      this.openMenu(evt);
    });
  }

  refreshRibbon() {
    if (!this.ribbonEl) return;
    this.ribbonEl.toggleClass("pen-mode-ribbon-on", this.settings.penOn);
  }

  currentPalette() {
    return this.colorContext() === "highlight"
      ? this.settings.highlightPalette
      : this.settings.textPalette;
  }

  addColorItems(menu) {
    for (const entry of this.currentPalette()) {
      const hex = safeColor(entry.color, null);
      if (!hex) continue;
      menu.addItem((item) =>
        item
          .setTitle(entry.name)
          .setChecked(this.currentColor().toLowerCase() === hex.toLowerCase())
          .onClick(() => this.setColor(hex))
      );
    }
  }

  /** Colours only, which is what the merged colour button opens. */
  openColorMenu(evt) {
    const menu = new Menu();
    this.addColorItems(menu);
    this.showMenu(menu, evt);
  }

  openMenu(evt) {
    const menu = new Menu();
    const mixing = this.settings.allowMixing;

    for (const tool of TOOL_ORDER) {
      menu.addItem((item) =>
        item
          .setTitle(TOOL_LABELS[tool])
          .setIcon(TOOL_ICONS[tool])
          .setChecked(this.isActive(tool))
          .onClick(() => (mixing ? this.toggleTool(tool) : this.setTools([tool])))
      );
    }

    if (this.colorContext()) {
      menu.addSeparator();
      this.addColorItems(menu);
    }

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle(this.settings.statusBarMode === "toolbar" ? "Compact layout" : "Toolbar layout")
        .setIcon("layout")
        .onClick(async () => {
          this.settings.statusBarMode =
            this.settings.statusBarMode === "toolbar" ? "compact" : "toolbar";
          await this.saveSettings();
          this.refreshStatusBar();
        })
    );

    if (mixing && this.activeTools().length > 1) {
      menu.addItem((item) =>
        item
          .setTitle("Reset to one style")
          .setIcon("rotate-ccw")
          .onClick(() => this.setTools([this.primaryTool()]))
      );
    }

    menu.addItem((item) =>
      item
        .setTitle(this.settings.penOn ? "Turn pen off" : "Turn pen on")
        .setIcon("power")
        .onClick(() => this.togglePen())
    );

    this.showMenu(menu, evt);
  }

  showMenu(menu, evt) {
    if (evt && typeof evt.clientX === "number") menu.showAtMouseEvent(evt);
    else if (this.statusEl) {
      const rect = this.statusEl.getBoundingClientRect();
      menu.showAtPosition({ x: rect.left, y: rect.top });
    } else {
      menu.showAtPosition({ x: 100, y: 100 });
    }
  }

  /* ---------------- the pen ---------------- */

  handleSelection() {
    if (!this.settings.penOn || this.busy) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    if (typeof view.getMode === "function" && view.getMode() === "preview") return;

    const editor = view.editor;
    if (!editor || !editor.somethingSelected()) return;
    if (editor.getSelection().trim().length < this.settings.minLength) return;

    // Claim the pen now, not inside the timeout. Otherwise two selection
    // events landing within the settle window both get through the guard.
    this.busy = true;

    this.pending = window.setTimeout(() => {
      this.pending = null;
      try {
        if (!editor.somethingSelected()) return;
        this.applyTools(editor);
        if (this.settings.oneShot) this.setPen(false);
      } finally {
        this.busy = false;
      }
    }, 10);
  }

  /**
   * Apply every active style in turn, innermost first. Each pass either wraps
   * or strips that one style, so painting the same mix twice removes it all.
   */
  applyTools(editor) {
    const s = this.settings;
    const doc = editor.getValue();

    let a = editor.posToOffset(editor.getCursor("from"));
    let b = editor.posToOffset(editor.getCursor("to"));
    if (a === b) return;

    // Keep leading/trailing whitespace outside the markers.
    while (a < b && /\s/.test(doc[a])) a++;
    while (b > a && /\s/.test(doc[b - 1])) b--;
    if (a >= b) return;

    const guarded = s.guardMarkup ? protectedRegions(doc) : [];

    if (overlapsAny(a, b, guarded)) {
      this.notify("Pen skipped: that selection touches code, math, a link or frontmatter.");
      return;
    }

    if (s.guardMarkup) {
      [a, b] = snapToSpans(a, b, emphasisSpans(doc, guarded));
      if (overlapsAny(a, b, guarded)) {
        this.notify("Pen skipped: that run reaches into code, math or a link.");
        return;
      }
    }

    if (!doc.slice(a, b).trim()) return;

    const tools = this.activeTools();

    // A single style keeps the original path, which also handles markers that
    // sit just outside the selection.
    if (tools.length === 1) {
      const [na, nb] = this.applyOne(editor, tools[0], a, b);
      editor.setCursor(editor.offsetToPos(nb));
      return;
    }

    const core = doc.slice(a, b);
    const sets = mixMarkerSets(tools, s);
    const markers = sets[0];

    // Painting the same mix twice takes it all off. The styles nest, so the
    // outermost has to come off first. Peeling in application order would
    // leave the inner marker looking at the outer one's characters. Both
    // spellings are tried, so text written as markdown still un-styles once the
    // mix has switched to HTML.
    for (const set of sets) {
      const peeled = peelAll(core, set);
      if (peeled !== null && peeled.trim()) {
        editor.replaceRange(peeled, editor.offsetToPos(a), editor.offsetToPos(b));
        editor.setCursor(editor.offsetToPos(a + peeled.length));
        return;
      }
    }

    // Otherwise add whatever is missing, innermost first, leaving alone any
    // style that is already there. Anything written in the other spelling is
    // converted rather than wrapped, so the two never end up nested.
    let text = peelSome(core, sets[1]);
    for (const m of markers) {
      if (m.inOpen.test(text) && m.inClose.test(text)) continue;

      // "**word**" gaining italic must become "***word***", not "*****word*****".
      // Normalise an existing run of the same character before re-wrapping.
      if (m.runChar) {
        const c = escapeRe(m.runChar);
        const run = text.match(new RegExp(`^(${c}{1,3})([\\s\\S]*?)\\1$`));
        if (run && run[2].trim()) text = run[2];
      }

      text = m.open + text + m.close;
    }
    editor.replaceRange(text, editor.offsetToPos(a), editor.offsetToPos(b));
    editor.setCursor(editor.offsetToPos(a + text.length));
  }

  /** One style, one pass. Returns the new [start, end] of the styled run. */
  applyOne(editor, tool, a, b) {
    const m = fillRegexes(markersFor(tool, this.settings));
    const doc = editor.getValue();
    const core = doc.slice(a, b);

    const write = (text, from, to) => {
      editor.replaceRange(text, editor.offsetToPos(from), editor.offsetToPos(to));
    };

    // 1. Markers inside the run → strip them.
    if (m.inOpen.test(core) && m.inClose.test(core)) {
      const stripped = core.replace(m.inOpen, "").replace(m.inClose, "");
      write(stripped, a, b);
      return [a, a + stripped.length];
    }

    // 2. Markers just outside the run → strip those.
    const openMatch = doc.slice(0, a).match(m.outOpen);
    const closeMatch = doc.slice(b).match(m.outClose);
    if (openMatch && closeMatch) {
      write(core, a - openMatch[0].length, b + closeMatch[0].length);
      return [a - openMatch[0].length, b - openMatch[0].length];
    }

    // 3. Otherwise wrap.
    write(m.open + core + m.close, a, b);
    return [a, b + m.open.length + m.close.length];
  }
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

class PenModeSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    const intro = containerEl.createDiv({ cls: "pen-mode-intro" });
    intro.createEl("p", {
      text:
        "Switch the pen ON in the status bar, on the bottom right of the Obsidian window, then select any text in the editor. It gets styled the moment you release the mouse. No menus, no keyboard shortcuts.",
    });
    intro.createEl("p", {
      text:
        "Selecting styled text again with the same pen removes the style, so painting twice undoes it. Click several styles in the toolbar to apply them together.",
    });

    new Setting(containerEl)
      .setName("Pen")
      .setDesc("While the pen is on, anything you select gets styled.")
      .addToggle((t) =>
        t.setValue(s.penOn).onChange((v) => {
          this.plugin.setPen(v);
        })
      );

    new Setting(containerEl)
      .setName("Mix styles")
      .setDesc(
        `Let several styles apply at once. Click a toolbar icon to add or remove it, or ${
          Platform.isMacOS ? "⌘" : "Ctrl"
        }+click to jump back to that style on its own. With this off, clicking a style always replaces the current one.`
      )
      .addToggle((t) =>
        t.setValue(s.allowMixing).onChange(async (v) => {
          s.allowMixing = v;
          if (!v) this.plugin.setTools([this.plugin.primaryTool()]);
          await this.plugin.saveSettings();
          this.plugin.refreshStatusBar();
        })
      );

    new Setting(containerEl)
      .setName("Protect code, math and links")
      .setDesc(
        "Refuse to paint inside code blocks, inline code, math, wiki links, link targets and frontmatter, and grow a partial selection out to the whole formatted run rather than splitting it."
      )
      .addToggle((t) =>
        t.setValue(s.guardMarkup).onChange(async (v) => {
          s.guardMarkup = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Highlight output")
      .setDesc(
        "Markdown keeps notes portable (==text==) but is always the theme's yellow. HTML lets you pick any colour."
      )
      .addDropdown((d) => {
        d.addOption("markdown", "Markdown ==text==");
        d.addOption("mark", "HTML <mark> with colour");
        d.setValue(s.highlightStyle).onChange(async (v) => {
          s.highlightStyle = v;
          await this.plugin.saveSettings();
          this.plugin.refreshStatusBar();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("Italic marker")
      .setDesc("Some themes and linters prefer underscores.")
      .addDropdown((d) => {
        d.addOption("*", "*asterisks*");
        d.addOption("_", "_underscores_");
        d.setValue(s.italicMarker).onChange(async (v) => {
          s.italicMarker = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Single stroke")
      .setDesc("Turn the pen off again after one selection.")
      .addToggle((t) =>
        t.setValue(s.oneShot).onChange(async (v) => {
          s.oneShot = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Keyboard selections")
      .setDesc("Also paint selections made with shift + arrow keys, applied when you release shift.")
      .addToggle((t) =>
        t.setValue(s.keyboardSelection).onChange(async (v) => {
          s.keyboardSelection = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Minimum characters")
      .setDesc("Ignore shorter selections, so a stray click or double-click doesn't paint a word.")
      .addText((t) =>
        t.setValue(String(s.minLength)).onChange(async (v) => {
          const n = parseInt(v, 10);
          s.minLength = isNaN(n) ? 1 : Math.max(1, n);
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Status bar layout")
      .setDesc("How the pen looks in the status bar, on the bottom right of the Obsidian window. Toolbar shows every style. Compact shows only the styles that are on.")
      .addDropdown((d) => {
        d.addOption("toolbar", "Toolbar, every style");
        d.addOption("compact", "Compact, active style only");
        d.setValue(s.statusBarMode).onChange(async (v) => {
          s.statusBarMode = v;
          await this.plugin.saveSettings();
          this.plugin.refreshStatusBar();
        });
      });

    new Setting(containerEl)
      .setName("Status bar control")
      .setDesc("Show the pen in the status bar, on the bottom right of the Obsidian window. Restart Obsidian after changing this.")
      .addToggle((t) =>
        t.setValue(s.showStatusBar).onChange(async (v) => {
          s.showStatusBar = v;
          await this.plugin.saveSettings();
          new Notice("Reload Obsidian to apply.");
        })
      );

    this.renderPalette(
      containerEl,
      "Highlight colours",
      "Used when highlight output is set to HTML.",
      "highlightPalette",
      DEFAULT_HIGHLIGHT_PALETTE,
      (hex) => {
        s.highlightColor = hex;
      }
    );

    this.renderPalette(
      containerEl,
      "Text colours",
      "Used by the text colour pen.",
      "textPalette",
      DEFAULT_TEXT_PALETTE,
      (hex) => {
        s.textColor = hex;
      }
    );
  }

  renderPalette(containerEl, title, desc, key, defaults, onPick) {
    const s = this.plugin.settings;
    const palette = s[key];

    new Setting(containerEl).setName(title).setDesc(desc).setHeading();

    palette.forEach((entry, i) => {
      new Setting(containerEl)
        .addText((t) =>
          t
            .setPlaceholder("Name")
            .setValue(entry.name)
            .onChange(async (v) => {
              entry.name = v;
              await this.plugin.saveSettings();
            })
        )
        .addColorPicker((c) =>
          c.setValue(entry.color).onChange(async (v) => {
            entry.color = safeColor(v, entry.color);
            await this.plugin.saveSettings();
            this.plugin.refreshStatusBar();
          })
        )
        .addExtraButton((b) =>
          b
            .setIcon("check")
            .setTooltip("Use this colour now")
            .onClick(async () => {
              onPick(safeColor(entry.color, entry.color));
              await this.plugin.saveSettings();
              this.plugin.refreshStatusBar();
            })
        )
        .addExtraButton((b) =>
          b
            .setIcon("trash")
            .setTooltip("Remove")
            .onClick(async () => {
              palette.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            })
        );
    });

    new Setting(containerEl)
      .addButton((b) =>
        b.setButtonText("Add colour").onClick(async () => {
          palette.push({ name: "New colour", color: "#cccccc" });
          await this.plugin.saveSettings();
          this.display();
        })
      )
      .addButton((b) =>
        b.setButtonText("Reset to defaults").onClick(async () => {
          s[key] = defaults.map((e) => ({ ...e }));
          await this.plugin.saveSettings();
          this.plugin.refreshStatusBar();
          this.display();
        })
      );
  }
}

module.exports = PenModePlugin;
module.exports.__test = {
  protectedRegions,
  fencedRegions,
  emphasisSpans,
  snapToSpans,
  overlapsAny,
  safeColor,
  mergePalette,
  markersFor,
  fillRegexes,
  mixMarkers,
  mixMarkerSets,
  htmlMarkersFor,
  needsHtml,
  peelAll,
  peelSome,
  MIX_ORDER,
  TOOL_ORDER,
  DEFAULT_HIGHLIGHT_PALETTE,
  DEFAULT_TEXT_PALETTE,
};
