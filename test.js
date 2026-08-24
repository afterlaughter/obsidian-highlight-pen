// Harness: drive PenModePlugin.applyTool against a fake CodeMirror editor.
const Module = require("module");
const path = require("path");

// Stub the "obsidian" module so main.js can be required outside Obsidian.
const stub = {
  Plugin: class {},
  PluginSettingTab: class { constructor(app, plugin) { this.app = app; this.plugin = plugin; } },
  Setting: class {},
  MarkdownView: class {},
  Menu: class {},
  Notice: class {},
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "obsidian") return "obsidian";
  return origResolve.call(this, request, ...rest);
};
require.cache["obsidian"] = { id: "obsidian", filename: "obsidian", loaded: true, exports: stub };

const PenModePlugin = require(path.resolve(__dirname, "./main.js"));

class FakeEditor {
  constructor(text, from, to) {
    this.lines = text.split("\n");
    this.from = from;
    this.to = to;
    this.cursor = null;
  }
  getCursor(which) { return which === "from" ? { ...this.from } : { ...this.to }; }
  getLine(n) { return this.lines[n]; }
  somethingSelected() { return true; }
  setCursor(pos) { this.cursor = pos; }
  _idx(p) {
    let i = 0;
    for (let l = 0; l < p.line; l++) i += this.lines[l].length + 1;
    return i + p.ch;
  }
  getRange(a, b) { return this.lines.join("\n").slice(this._idx(a), this._idx(b)); }
  replaceRange(text, a, b) {
    const doc = this.lines.join("\n");
    this.lines = (doc.slice(0, this._idx(a)) + text + doc.slice(this._idx(b))).split("\n");
  }
  text() { return this.lines.join("\n"); }
  // Is the recorded cursor a position that actually exists in the document?
  cursorValid() {
    const c = this.cursor;
    if (!c) return false;
    return c.line >= 0 && c.line < this.lines.length && c.ch >= 0 && c.ch <= this.lines[c.line].length;
  }
}

function run(settings, text, from, to) {
  const p = Object.create(PenModePlugin.prototype);
  p.settings = Object.assign(
    { italicMarker: "*", highlightStyle: "markdown", highlightColor: "#ffd83d", textColor: "#c0392b" },
    settings
  );
  const ed = new FakeEditor(text, from, to);
  p.applyTool(ed);
  return ed;
}

let pass = 0, fail = 0;
function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`);
}
function checkCursor(label, ed) {
  const ok = ed.cursorValid();
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        cursor ${JSON.stringify(ed.cursor)} outside doc ${JSON.stringify(ed.lines)}`);
}

console.log("--- BUG 1: italic pen must not eat bold markers ---");

// Select "bold" inside **bold** with the italic pen. Must WRAP, not strip.
check(
  "italic pen on word inside **bold**",
  run({ tool: "italic" }, "a **bold** b", { line: 0, ch: 4 }, { line: 0, ch: 8 }).text(),
  "a ***bold*** b"
);

// Select the whole **bold** run with the italic pen. Must not strip to *bold*.
check(
  "italic pen over the whole **bold** run",
  run({ tool: "italic" }, "a **bold** b", { line: 0, ch: 2 }, { line: 0, ch: 10 }).text(),
  "a ***bold*** b"
);

// Real italic still toggles off.
check(
  "italic pen strips *italic* from outside",
  run({ tool: "italic" }, "a *soft* b", { line: 0, ch: 3 }, { line: 0, ch: 7 }).text(),
  "a soft b"
);
check(
  "italic pen strips *italic* from inside",
  run({ tool: "italic" }, "a *soft* b", { line: 0, ch: 2 }, { line: 0, ch: 8 }).text(),
  "a soft b"
);
check(
  "italic pen wraps plain text",
  run({ tool: "italic" }, "a soft b", { line: 0, ch: 2 }, { line: 0, ch: 6 }).text(),
  "a *soft* b"
);

// Underscore marker, same collision.
check(
  "underscore italic pen on word inside __bold__",
  run({ tool: "italic", italicMarker: "_" }, "a __bold__ b", { line: 0, ch: 4 }, { line: 0, ch: 8 }).text(),
  "a ___bold___ b"
);

// Bold pen unaffected.
check(
  "bold pen still strips **bold**",
  run({ tool: "bold" }, "a **bold** b", { line: 0, ch: 4 }, { line: 0, ch: 8 }).text(),
  "a bold b"
);

console.log("\n--- BUG 2: cursor position after multi-line edits ---");

const ml = "one two\nthree four\nfive six";

checkCursor("wrap across 3 lines", run({ tool: "highlight" }, ml, { line: 0, ch: 4 }, { line: 2, ch: 4 }));
checkCursor(
  "strip markers inside a multi-line selection",
  run({ tool: "highlight" }, "one ==two\nthree four\nfive== six", { line: 0, ch: 4 }, { line: 2, ch: 6 })
);
checkCursor(
  "strip markers outside a multi-line selection",
  run({ tool: "highlight" }, "one ==two\nthree four\nfive== six", { line: 0, ch: 6 }, { line: 2, ch: 4 })
);
checkCursor("wrap on a single line", run({ tool: "bold" }, "one two three", { line: 0, ch: 4 }, { line: 0, ch: 7 }));

// The multi-line wrap must still produce the right text.
check(
  "multi-line wrap text",
  run({ tool: "bold" }, ml, { line: 0, ch: 4 }, { line: 1, ch: 5 }).text(),
  "one **two\nthree** four\nfive six"
);

console.log("\n--- other styles still round-trip ---");
for (const [tool, opts, plain, styled] of [
  ["highlight", {}, "a word b", "a ==word== b"],
  ["bold", {}, "a word b", "a **word** b"],
  ["strikethrough", {}, "a word b", "a ~~word~~ b"],
  ["underline", {}, "a word b", "a <u>word</u> b"],
  ["color", {}, "a word b", 'a <span style="color: #c0392b;">word</span> b'],
  ["highlight", { highlightStyle: "mark" }, "a word b", 'a <mark style="background-color: #ffd83d;">word</mark> b'],
]) {
  const on = run({ tool, ...opts }, plain, { line: 0, ch: 2 }, { line: 0, ch: 6 });
  check(`${tool}${opts.highlightStyle ? " (" + opts.highlightStyle + ")" : ""} wrap`, on.text(), styled);
  const openLen = styled.indexOf("word") - 2;
  const off = run({ tool, ...opts }, styled, { line: 0, ch: 2 + openLen }, { line: 0, ch: 2 + openLen + 4 });
  check(`${tool}${opts.highlightStyle ? " (" + opts.highlightStyle + ")" : ""} unwrap`, off.text(), plain);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
