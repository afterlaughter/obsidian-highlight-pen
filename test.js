// Harness: drive PenModePlugin.applyTool against a fake CodeMirror editor.
// Run: node test.js
const Module = require("module");
const path = require("path");

const stub = {
  Plugin: class {},
  PluginSettingTab: class { constructor(app, plugin) { this.app = app; this.plugin = plugin; } },
  Setting: class {},
  MarkdownView: class {},
  Menu: class {},
  Notice: class {},
  setIcon: () => {},
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "obsidian") return "obsidian";
  return origResolve.call(this, request, ...rest);
};
require.cache["obsidian"] = { id: "obsidian", filename: "obsidian", loaded: true, exports: stub };

const PenModePlugin = require(path.resolve(__dirname, "./main.js"));
const T = PenModePlugin.__test;

class FakeEditor {
  constructor(text, from, to) {
    this.doc = text;
    this.from = from;
    this.to = to;
    this.cursor = null;
  }
  getValue() { return this.doc; }
  get lines() { return this.doc.split("\n"); }
  getCursor(which) { return which === "from" ? { ...this.from } : { ...this.to }; }
  getLine(n) { return this.lines[n]; }
  somethingSelected() { return true; }
  setCursor(pos) { this.cursor = pos; }
  posToOffset(p) {
    const lines = this.lines;
    let i = 0;
    for (let l = 0; l < p.line; l++) i += lines[l].length + 1;
    return i + p.ch;
  }
  offsetToPos(off) {
    const lines = this.lines;
    let rest = off;
    for (let l = 0; l < lines.length; l++) {
      if (rest <= lines[l].length) return { line: l, ch: rest };
      rest -= lines[l].length + 1;
    }
    return { line: lines.length - 1, ch: lines[lines.length - 1].length };
  }
  getRange(a, b) { return this.doc.slice(this.posToOffset(a), this.posToOffset(b)); }
  replaceRange(text, a, b) {
    this.doc = this.doc.slice(0, this.posToOffset(a)) + text + this.doc.slice(this.posToOffset(b));
  }
  text() { return this.doc; }
  cursorValid() {
    const c = this.cursor;
    if (!c) return false;
    const lines = this.lines;
    return c.line >= 0 && c.line < lines.length && c.ch >= 0 && c.ch <= lines[c.line].length;
  }
}

let pass = 0, fail = 0;
const failures = [];

function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  if (!ok) failures.push({ label, got, want });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`);
}

/** Select the first occurrence of `needle` in `text` and paint. */
function paint(settings, text, needle, occurrence = 1) {
  let idx = -1;
  for (let n = 0; n < occurrence; n++) idx = text.indexOf(needle, idx + 1);
  if (idx === -1) throw new Error(`fixture error: ${JSON.stringify(needle)} not in text`);

  const p = Object.create(PenModePlugin.prototype);
  const { tool, tools, ...rest } = settings;
  p.settings = Object.assign(
    {
      italicMarker: "*",
      highlightStyle: "markdown",
      highlightColor: "#ffe814",
      textColor: "#e01b24",
      guardMarkup: true,
      allowMixing: true,
      tools: tools || [tool || "highlight"],
    },
    rest
  );
  p.lastNotice = 0;
  p.notify = function () { this.notified = true; };

  const ed = new FakeEditor(text, null, null);
  ed.from = ed.offsetToPos(idx);
  ed.to = ed.offsetToPos(idx + needle.length);
  p.applyTools(ed);
  ed.notified = !!p.notified;
  return ed;
}

const section = (t) => console.log(`\n--- ${t} ---`);

/* ================================================================== */
section("partial selections over existing formatting (the reported bug)");

// Selection catches the closing "**" but not the opening one.
check(
  "partial: grabbing `bold** b` snaps out to the whole run",
  paint({ tool: "highlight" }, "a **bold** b", "bold** b").text(),
  "a ==**bold** b=="
);

check(
  "partial: grabbing `a **bo` snaps out to the whole run",
  paint({ tool: "highlight" }, "a **bold** b", "a **bo").text(),
  "==a **bold**== b"
);

check(
  "partial: highlight run caught halfway",
  paint({ tool: "bold" }, "a ==high== b", "high== b").text(),
  "a **==high== b**"
);

check(
  "partial: single-asterisk italic caught halfway",
  paint({ tool: "highlight" }, "a *soft* b", "soft* b").text(),
  "a ==*soft* b=="
);

check(
  "partial: triple marker caught halfway",
  paint({ tool: "highlight" }, "a ***both*** b", "both*** b").text(),
  "a ==***both*** b=="
);

/* ================================================================== */
section("whole-run selections still behave as before");

check(
  "italic over the whole **bold** run nests rather than splitting",
  paint({ tool: "italic" }, "a **bold** b", "**bold**").text(),
  "a ***bold*** b"
);

check(
  "italic over just the word inside **bold**",
  paint({ tool: "italic" }, "a **bold** b", "bold").text(),
  "a ***bold*** b"
);

check(
  "bold still strips **bold** from inside",
  paint({ tool: "bold" }, "a **bold** b", "**bold**").text(),
  "a bold b"
);

check(
  "italic strips *soft* from outside",
  paint({ tool: "italic" }, "a *soft* b", "soft").text(),
  "a soft b"
);

check(
  "underscore italic does not eat __bold__",
  paint({ tool: "italic", italicMarker: "_" }, "a __bold__ b", "bold").text(),
  "a ___bold___ b"
);

/* ================================================================== */
section("protected regions, the pen must refuse");

const fence = "text before\n\n```js\nconst marker = \"==not a highlight==\";\n```\n\ntext after";
const fenceRes = paint({ tool: "highlight" }, fence, "const marker");
check("fenced code is untouched", fenceRes.text(), fence);
check("fenced code raises a notice", fenceRes.notified, true);

const inline = "use the `const x = 1` form";
check("inline code is untouched", paint({ tool: "bold" }, inline, "const x").text(), inline);

const link = "see [the link text](https://example.com/a?b=1) here";
check("link target is untouched", paint({ tool: "bold" }, link, "example.com").text(), link);
check(
  "link *text* is still paintable",
  paint({ tool: "bold" }, link, "the link text").text(),
  "see [**the link text**](https://example.com/a?b=1) here"
);

const wiki = "see [[Some Note|the alias]] here";
check("wikilink is untouched", paint({ tool: "bold" }, wiki, "the alias").text(), wiki);

const mathBlock = "before\n\n$$\n\\sum x_i\n$$\n\nafter";
check("display math is untouched", paint({ tool: "highlight" }, mathBlock, "\\sum x_i").text(), mathBlock);

const mathInline = "inline $E = mc^2$ here";
check("inline math is untouched", paint({ tool: "highlight" }, mathInline, "mc^2").text(), mathInline);

const fm = "---\ntitle: My Note\ntags: [a, b]\n---\n\nbody text here";
check("frontmatter is untouched", paint({ tool: "bold" }, fm, "My Note").text(), fm);
check(
  "body after frontmatter is still paintable",
  paint({ tool: "bold" }, fm, "body text").text(),
  "---\ntitle: My Note\ntags: [a, b]\n---\n\n**body text** here"
);

/* ================================================================== */
section("guard can be turned off");

check(
  "guardMarkup:false restores blind behaviour",
  paint({ tool: "highlight", guardMarkup: false }, "a **bold** b", "bold** b").text(),
  "a **==bold** b=="
);

/* ================================================================== */
section("multi-line and cursor");

const ml = "one two three\nfour five six\nseven eight nine";
const mlRes = paint({ tool: "highlight" }, ml, "two three\nfour five six\nseven");
check("multi-line wrap text", mlRes.text(), "one ==two three\nfour five six\nseven== eight nine");
check("multi-line cursor is a real position", mlRes.cursorValid(), true);
check("multi-line cursor lands on the last line", mlRes.cursor.line, 2);

const single = paint({ tool: "bold" }, "one two three", "two");
check("single-line cursor is a real position", single.cursorValid(), true);

/* ================================================================== */
section("every style round-trips");

for (const [tool, opts, plain, styled] of [
  ["highlight", {}, "a word b", "a ==word== b"],
  ["bold", {}, "a word b", "a **word** b"],
  ["strikethrough", {}, "a word b", "a ~~word~~ b"],
  ["underline", {}, "a word b", "a <u>word</u> b"],
  ["color", {}, "a word b", 'a <span style="color: #e01b24;">word</span> b'],
  ["highlight", { highlightStyle: "mark" }, "a word b", 'a <mark style="background-color: #ffe814;">word</mark> b'],
]) {
  const tag = `${tool}${opts.highlightStyle ? " (" + opts.highlightStyle + ")" : ""}`;
  check(`${tag} wrap`, paint({ tool, ...opts }, plain, "word").text(), styled);
  check(`${tag} unwrap`, paint({ tool, ...opts }, styled, "word").text(), plain);
}

/* ================================================================== */
section("colour validation (data.json is a synced plain file)");

check("hex passes", T.safeColor("#a0e7e5", "#fff"), "#a0e7e5");
check("short hex passes", T.safeColor("#abc", "#fff"), "#abc");
check("attribute break-out is rejected", T.safeColor('red;"></mark><img src=x onerror=alert(1)>', "#fff"), "#fff");
check("named colour is rejected", T.safeColor("red", "#fff"), "#fff");
check("undefined is rejected", T.safeColor(undefined, "#fff"), "#fff");

const poisoned = T.markersFor("color", { textColor: 'x;"></span><script>bad()</script>' });
check("poisoned colour never reaches the note", poisoned.open, '<span style="color: #e01b24;">');

/* ================================================================== */
section("edge cases");

check(
  "whitespace stays outside the markers",
  paint({ tool: "bold" }, "a  word  b", " word ").text(),
  "a  **word**  b"
);

check("aqua is in the highlight palette", T.DEFAULT_HIGHLIGHT_PALETTE.some((e) => e.name === "Aqua"), true);
check("aqua is in the text palette", T.DEFAULT_TEXT_PALETTE.some((e) => e.name === "Aqua"), true);
check(
  "every default palette colour is valid hex",
  [...T.DEFAULT_HIGHLIGHT_PALETTE, ...T.DEFAULT_TEXT_PALETTE].every(
    (e) => T.safeColor(e.color, null) === e.color
  ),
  true
);

section("palette migration, saved settings must not hide new colours");

const oldSaved = [
  { name: "Yellow", color: "#ffd83d" },
  { name: "Green", color: "#a6e3a1" },
];
const merged = T.mergePalette(oldSaved, T.DEFAULT_HIGHLIGHT_PALETTE);
check("migration keeps the user's own edits", merged[0].color, "#ffd83d");
check("migration appends Aqua", merged.some((e) => e.name === "Aqua"), true);
check("migration does not duplicate names", new Set(merged.map((e) => e.name)).size, merged.length);
check("migration survives a junk value", T.mergePalette(null, T.DEFAULT_TEXT_PALETTE).length, T.DEFAULT_TEXT_PALETTE.length);

section("mixing styles");

check(
  "bold + underline nests HTML outside markdown",
  paint({ tools: ["bold", "underline"] }, "a word b", "word").text(),
  "a <u>**word**</u> b"
);

check(
  "bold + strike + underline + colour",
  paint({ tools: ["bold", "strikethrough", "underline", "color"] }, "a word b", "word").text(),
  'a <span style="color: #e01b24;"><u>~~**word**~~</u></span> b'
);

check(
  "mix order is canonical regardless of the order they were picked",
  paint({ tools: ["color", "underline", "bold"] }, "a word b", "word").text(),
  paint({ tools: ["bold", "underline", "color"] }, "a word b", "word").text()
);

check(
  "painting the same mix twice removes it",
  paint(
    { tools: ["bold", "underline"] },
    "a <u>**word**</u> b",
    "<u>**word**</u>"
  ).text(),
  "a word b"
);

check(
  "highlight + bold",
  paint({ tools: ["highlight", "bold"] }, "a word b", "word").text(),
  "a ==**word**== b"
);

check(
  "adding a style to text that already has one does not double the markers",
  paint({ tools: ["bold", "underline"] }, "a **word** b", "**word**").text(),
  "a <u>**word**</u> b"
);

check(
  "a partial mix is not treated as an undo",
  T.peelAll("<u>word</u>", ["bold", "underline"], { italicMarker: "*", highlightStyle: "markdown" }),
  null
);

const mixRes = paint({ tools: ["bold", "underline", "color"] }, "a word b", "word");
check("mixed cursor is a real position", mixRes.cursorValid(), true);

/* ================================================================== */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}`);
}
process.exit(fail ? 1 : 0);
