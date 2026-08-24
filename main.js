"use strict";

const { Plugin, PluginSettingTab, Setting, MarkdownView, Menu, Notice } = require("obsidian");

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

const TOOL_ORDER = ["highlight", "bold", "italic", "underline", "strikethrough", "color"];

const DEFAULT_SETTINGS = {
  penOn: false,
  tool: "highlight",
  highlightColor: "#ffd83d",
  textColor: "#c0392b",
  highlightStyle: "markdown", // "markdown" (==text==) or "mark" (<mark style=...>)
  italicMarker: "*",
  oneShot: false,
  keyboardSelection: true,
  minLength: 2,
  showStatusBar: true,
  highlightPalette: [
    { name: "Yellow", color: "#ffd83d" },
    { name: "Green", color: "#a6e3a1" },
    { name: "Blue", color: "#9ec5fe" },
    { name: "Pink", color: "#f5a9c8" },
    { name: "Orange", color: "#ffb86c" },
  ],
  textPalette: [
    { name: "Red", color: "#c0392b" },
    { name: "Blue", color: "#2e6fdf" },
    { name: "Green", color: "#2e8b57" },
    { name: "Purple", color: "#7d5bbe" },
  ],
};

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns the opening/closing markers for a tool, plus the regexes used to
 * detect that the markers are already there (so painting twice removes them).
 */
function markersFor(tool, s) {
  switch (tool) {
    case "highlight":
      if (s.highlightStyle === "mark") {
        return {
          open: `<mark style="background-color: ${s.highlightColor};">`,
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
      const mk = s.italicMarker;
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
    case "color":
      return {
        open: `<span style="color: ${s.textColor};">`,
        close: "</span>",
        inOpen: /^<span\b[^>]*>/,
        inClose: /<\/span>$/,
        outOpen: /<span\b[^>]*>$/,
        outClose: /^<\/span>/,
      };
    default:
      return { open: "==", close: "==" };
  }
}

/**
 * Where the cursor ends up after writing `text` starting at `start`.
 * Counting characters only works on one line — a multi-line insert has to
 * advance the line number and restart `ch` from the last line.
 */
function endOfInsert(start, text) {
  const lines = text.split("\n");
  if (lines.length === 1) return { line: start.line, ch: start.ch + text.length };
  return { line: start.line + lines.length - 1, ch: lines[lines.length - 1].length };
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
 * Plugin
 * ------------------------------------------------------------------ */

class PenModePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.busy = false;
    this.pending = null;

    this.addSettingTab(new PenModeSettingTab(this.app, this));
    this.buildStatusBar();

    this.ribbonEl = this.addRibbonIcon("highlighter", "Toggle pen mode", () => this.togglePen());
    this.refreshRibbon();

    /* --- commands --- */

    this.addCommand({
      id: "toggle-pen",
      name: "Toggle pen on/off",
      callback: () => this.togglePen(),
    });

    this.addCommand({
      id: "apply-once",
      name: "Apply current style to selection",
      editorCallback: (editor) => this.applyTool(editor),
    });

    this.addCommand({
      id: "cycle-tool",
      name: "Next style",
      callback: () => {
        const i = TOOL_ORDER.indexOf(this.settings.tool);
        this.setTool(TOOL_ORDER[(i + 1) % TOOL_ORDER.length]);
      },
    });

    this.addCommand({
      id: "open-picker",
      name: "Open style picker",
      callback: () => this.openMenu(),
    });

    for (const tool of TOOL_ORDER) {
      this.addCommand({
        id: `set-tool-${tool}`,
        name: `Set style: ${TOOL_LABELS[tool].toLowerCase()}`,
        callback: () => this.setTool(tool),
      });
    }

    /* --- selection listeners --- */

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

    // Mobile / touch selection.
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

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /* ---------------- state ---------------- */

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

  setTool(tool) {
    this.settings.tool = tool;
    this.saveSettings();
    this.refreshStatusBar();
  }

  setColor(hex) {
    if (this.settings.tool === "color") this.settings.textColor = hex;
    else this.settings.highlightColor = hex;
    this.saveSettings();
    this.refreshStatusBar();
  }

  currentColor() {
    return this.settings.tool === "color" ? this.settings.textColor : this.settings.highlightColor;
  }

  usesColor() {
    return (
      this.settings.tool === "color" ||
      (this.settings.tool === "highlight" && this.settings.highlightStyle === "mark")
    );
  }

  /* ---------------- status bar ---------------- */

  buildStatusBar() {
    if (!this.settings.showStatusBar) return;
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("pen-mode-status");
    this.statusEl.addEventListener("click", () => this.togglePen());
    this.statusEl.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.openMenu(evt);
    });
    this.refreshStatusBar();
  }

  refreshStatusBar() {
    if (!this.statusEl) return;
    this.statusEl.empty();
    this.statusEl.toggleClass("is-on", this.settings.penOn);

    const swatch = this.statusEl.createSpan({ cls: "pen-mode-swatch" });
    if (this.usesColor()) swatch.style.backgroundColor = this.currentColor();
    else swatch.addClass("is-plain");

    this.statusEl.createSpan({
      cls: "pen-mode-label",
      text: `${TOOL_LABELS[this.settings.tool]} ${this.settings.penOn ? "on" : "off"}`,
    });

    this.statusEl.setAttribute(
      "aria-label",
      this.settings.penOn
        ? "Pen is on — click to turn off, right-click to change style"
        : "Pen is off — click to turn on, right-click to change style"
    );
  }

  refreshRibbon() {
    if (!this.ribbonEl) return;
    this.ribbonEl.toggleClass("pen-mode-ribbon-on", this.settings.penOn);
  }

  openMenu(evt) {
    const menu = new Menu();

    for (const tool of TOOL_ORDER) {
      menu.addItem((item) =>
        item
          .setTitle(TOOL_LABELS[tool])
          .setIcon(TOOL_ICONS[tool])
          .setChecked(this.settings.tool === tool)
          .onClick(() => this.setTool(tool))
      );
    }

    if (this.usesColor()) {
      const palette =
        this.settings.tool === "color" ? this.settings.textPalette : this.settings.highlightPalette;
      menu.addSeparator();
      for (const entry of palette) {
        menu.addItem((item) =>
          item
            .setTitle(entry.name)
            .setChecked(this.currentColor().toLowerCase() === entry.color.toLowerCase())
            .onClick(() => this.setColor(entry.color))
        );
      }
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(this.settings.penOn ? "Turn pen off" : "Turn pen on")
        .setIcon("power")
        .onClick(() => this.togglePen())
    );

    if (evt) menu.showAtMouseEvent(evt);
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

    // Claim the pen now, not inside the timeout — otherwise two selection
    // events landing within the settle window both get through the guard.
    this.busy = true;

    // Let CodeMirror settle the selection before we rewrite the document.
    this.pending = window.setTimeout(() => {
      this.pending = null;
      try {
        if (!editor.somethingSelected()) return;
        this.applyTool(editor);
        if (this.settings.oneShot) this.setPen(false);
      } finally {
        this.busy = false;
      }
    }, 10);
  }

  applyTool(editor) {
    const m = fillRegexes(markersFor(this.settings.tool, this.settings));

    let from = editor.getCursor("from");
    let to = editor.getCursor("to");
    let text = editor.getRange(from, to);
    if (!text) return;

    // Keep leading/trailing spaces outside the markers.
    const lead = text.match(/^[ \t]*/)[0];
    const trail = text.match(/[ \t]*$/)[0];
    if (lead) from = { line: from.line, ch: from.ch + lead.length };
    if (trail) to = { line: to.line, ch: to.ch - trail.length };

    const core = editor.getRange(from, to);
    if (!core.trim()) return;

    // 1. Markers inside the selection → strip them.
    if (m.inOpen.test(core) && m.inClose.test(core)) {
      const stripped = core.replace(m.inOpen, "").replace(m.inClose, "");
      editor.replaceRange(stripped, from, to);
      editor.setCursor(endOfInsert(from, stripped));
      return;
    }

    // 2. Markers just outside the selection → strip those.
    const before = editor.getLine(from.line).slice(0, from.ch);
    const after = editor.getLine(to.line).slice(to.ch);
    const openMatch = before.match(m.outOpen);
    const closeMatch = after.match(m.outClose);
    if (openMatch && closeMatch) {
      // Trailing first, so the leading offsets stay valid.
      editor.replaceRange("", to, { line: to.line, ch: to.ch + closeMatch[0].length });
      const newFrom = { line: from.line, ch: from.ch - openMatch[0].length };
      editor.replaceRange("", newFrom, from);
      editor.setCursor(endOfInsert(newFrom, core));
      return;
    }

    // 3. Otherwise wrap.
    const wrapped = m.open + core + m.close;
    editor.replaceRange(wrapped, from, to);
    editor.setCursor(endOfInsert(from, wrapped));
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

    new Setting(containerEl)
      .setName("Pen")
      .setDesc("While the pen is on, anything you select gets styled.")
      .addToggle((t) =>
        t.setValue(s.penOn).onChange((v) => {
          this.plugin.setPen(v);
        })
      );

    new Setting(containerEl)
      .setName("Style")
      .setDesc("What the pen writes.")
      .addDropdown((d) => {
        for (const tool of TOOL_ORDER) d.addOption(tool, TOOL_LABELS[tool]);
        d.setValue(s.tool).onChange((v) => {
          this.plugin.setTool(v);
          this.display();
        });
      });

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
      .setName("Status bar control")
      .setDesc("Show the pen in the status bar. Restart Obsidian after changing this.")
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
      s.highlightPalette,
      (hex) => {
        s.highlightColor = hex;
      }
    );

    this.renderPalette(
      containerEl,
      "Text colours",
      "Used by the text colour pen.",
      s.textPalette,
      (hex) => {
        s.textColor = hex;
      }
    );
  }

  renderPalette(containerEl, title, desc, palette, onPick) {
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
            entry.color = v;
            await this.plugin.saveSettings();
            this.plugin.refreshStatusBar();
          })
        )
        .addExtraButton((b) =>
          b
            .setIcon("check")
            .setTooltip("Use this colour now")
            .onClick(async () => {
              onPick(entry.color);
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

    new Setting(containerEl).addButton((b) =>
      b.setButtonText("Add colour").onClick(async () => {
        palette.push({ name: "New colour", color: "#cccccc" });
        await this.plugin.saveSettings();
        this.display();
      })
    );
  }
}

module.exports = PenModePlugin;
