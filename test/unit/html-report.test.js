import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { formatHtmlReport } from "../../html-report.js";
import { loadApp, loadFixture, repoRoot } from "../helpers/load-app.js";

const { api } = loadApp();

function plain(report) {
  return JSON.parse(JSON.stringify(report));
}

function analyzeFixture(name) {
  return plain(api.analyze(loadFixture(name).replace(/\n$/, "")));
}

function runCli(args, input) {
  return spawnSync(process.execPath, [path.join(repoRoot(), "html-report.js"), ...args], {
    encoding: "utf8",
    input,
    cwd: repoRoot(),
  });
}

test("formatHtmlReport rejects a report without results", () => {
  assert.throws(() => formatHtmlReport(null), /report object/);
  assert.throws(() => formatHtmlReport([]), /report object/);
  assert.throws(() => formatHtmlReport({}), /results array/);
  assert.throws(() => formatHtmlReport({ results: [null] }), /results\[0\]/);
});

test("a mixed report renders counts, a check table, and collapsed notes", () => {
  const html = formatHtmlReport({
    passes: 99,
    verdict: "Close \u2014 fill in what's marked red below.",
    results: [
      { id: "title", name: "Title", status: "pass", note: "Titles itself as a prompt pack." },
      { id: "audience", name: "Who it's for", status: "missing", note: "Doesn't say who the pack is for." },
      { id: "risk", name: "Risk rules", status: "weak", note: "Has stops, no never-add rule." },
    ],
    flags: [],
  });

  assert.match(html, /<dt style="[^"]*">Pass<\/dt>\s*<dd style="[^"]*">1<\/dd>/);
  assert.match(html, /<dt style="[^"]*">Weak<\/dt>\s*<dd style="[^"]*">1<\/dd>/);
  assert.match(html, /<dt style="[^"]*">Missing<\/dt>\s*<dd style="[^"]*">1<\/dd>/);
  assert.match(html, /<dt style="[^"]*">Red flags<\/dt>\s*<dd style="[^"]*">0<\/dd>/);
  assert.match(html, /1\/3 sections/);
  assert.doesNotMatch(html, /99/);
  assert.match(html, /Close \u2014 fill in what&#39;s marked red below\./);
  assert.match(html, /<table /);
  assert.match(html, /<th scope="col"[^>]*>Check<\/th>/);
  assert.match(html, /<th scope="col"[^>]*>Result<\/th>/);
  assert.match(html, /data-status="pass"/);
  assert.match(html, /data-status="weak"/);
  assert.match(html, /data-status="missing"/);
  assert.equal(html.match(/<details>/g).length, 3);
  assert.doesNotMatch(html, /<details open/);
  assert.match(html, /<summary[^>]*>Note<\/summary>/);
  assert.match(html, /No red flags\./);
  assert.doesNotMatch(html, /<style[\s>]/i);
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /style="/);
  assert.doesNotMatch(html, /bootstrap|tailwind|unpkg|cdnjs/i);
});

test("notes, quotes, and the verdict are escaped", () => {
  const html = formatHtmlReport({
    verdict: '<i>nope</i> & "sure"',
    results: [
      {
        id: "title",
        name: "<b>Title</b>",
        status: "pass",
        note: `a & b "c" 'd'`,
      },
    ],
    flags: [
      {
        name: "<img alt=x>",
        quotes: ["<script>alert(1)</script>"],
        note: "x<y",
      },
    ],
  });

  assert.match(html, /&lt;b&gt;Title&lt;\/b&gt;/);
  assert.match(html, /a &amp; b &quot;c&quot; &#39;d&#39;/);
  assert.match(html, /&lt;i&gt;nope&lt;\/i&gt; &amp; &quot;sure&quot;/);
  assert.match(html, /&lt;img alt=x&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /x&lt;y/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<b>Title/);
  assert.doesNotMatch(html, /<img alt/);
});

test("flag quotes and notes stay inside collapsed details", () => {
  const html = formatHtmlReport({
    verdict: "Red flags \u2014 fix these before sharing.",
    results: [{ id: "risk", name: "Risk rules", status: "weak", note: "Stops only." }],
    flags: [
      { name: "Martingale language", quotes: ["\u2026double down\u2026", "average down"] },
      { name: "No disclosure at all", quotes: [], note: "Nowhere in the text." },
      { name: "Bare flag" },
    ],
  });

  assert.match(html, /0\/1 sections, 3 red flags/);
  assert.equal(html.match(/<details/g).length, 4);
  assert.match(html, /<summary[^>]*>Martingale language<\/summary>\s*<blockquote[^>]*>\u2026double down\u2026<\/blockquote>\s*<blockquote[^>]*>average down<\/blockquote>/);
  assert.match(html, /<summary[^>]*>No disclosure at all<\/summary>\s*<p[^>]*>Nowhere in the text\.<\/p>/);
  assert.match(html, /<summary[^>]*>Bare flag<\/summary>\s*<p[^>]*>No quote captured\.<\/p>/);
});

test("one red flag stays singular, and a blank note is labeled", () => {
  const html = formatHtmlReport({
    results: [{ name: "", id: "title", status: "odd", note: "" }],
    flags: [{ name: "Win-rate theater / profit guarantees", quotes: ["90% win rate"] }],
  });
  assert.match(html, /0\/1 sections, 1 red flag</);
  assert.doesNotMatch(html, /1 red flags/);
  assert.match(html, /<th scope="row"[^>]*>title<\/th>/);
  assert.match(html, /data-status="unknown"/);
  assert.match(html, />odd</);
  assert.match(html, /No note\./);
  assert.doesNotMatch(html, /<p style="[^"]*">\s*<\/p>/);
});

test("fixture reports keep section order, weak rows, and flag notes", () => {
  const martingale = formatHtmlReport(analyzeFixture("martingale.md"));
  const names = [...martingale.matchAll(/<th scope="row"[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
  assert.deepEqual(names, [
    "Title",
    "Who it&#39;s for",
    "Provenance",
    "Disclosure",
    "The prompt",
    "Risk rules",
    "Why it works + metrics",
  ]);
  assert.match(martingale, /6\/7 sections, 1 red flag/);
  assert.match(martingale, /data-status="weak"/);
  assert.match(martingale, /Martingale language/);
  assert.match(martingale, /double down/);

  const close = formatHtmlReport(analyzeFixture("close-pack.md"));
  assert.match(close, /5\/7 sections</);
  assert.match(close, /No red flags\./);
  assert.match(close, /data-status="missing"/);
  assert.match(close, /data-status="weak"/);

  const bare = formatHtmlReport(analyzeFixture("no-disclosure-no-stops.md"));
  assert.match(bare, /5\/7 sections, 2 red flags/);
  assert.match(bare, /No disclosure at all/);
  assert.match(bare, /Nowhere in the text/);
  assert.match(bare, /No stop-loss language at all/);
});

test("the checked-in sample is the martingale fixture rendered by this formatter", () => {
  const html = formatHtmlReport(analyzeFixture("martingale.md"));
  const sample = fs.readFileSync(path.join(repoRoot(), "samples/martingale-report.html"), "utf8");
  assert.equal(sample, html);
});

test("the CLI writes the same HTML and rejects bad JSON", () => {
  const report = {
    verdict: "Solid pack \u2014 ship it.",
    results: [{ id: "title", name: "Title", status: "pass", note: "Ok." }],
    flags: [],
  };
  const expected = formatHtmlReport(report);

  const fromStdin = runCli([], JSON.stringify(report));
  assert.equal(fromStdin.status, 0, fromStdin.stderr);
  assert.equal(fromStdin.stdout, expected);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-check-html-"));
  const file = path.join(dir, "report.json");
  fs.writeFileSync(file, JSON.stringify(report));
  const fromFile = runCli([file]);
  assert.equal(fromFile.status, 0, fromFile.stderr);
  assert.equal(fromFile.stdout, expected);

  const bad = runCli([], "{");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Expected pack-check JSON/);
  assert.equal(bad.stdout, "");

  const shapeless = runCli([], "{}");
  assert.equal(shapeless.status, 1);
  assert.match(shapeless.stderr, /results array/);
});
