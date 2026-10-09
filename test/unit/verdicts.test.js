import assert from "node:assert/strict";
import { test } from "node:test";
import { loadApp } from "../helpers/load-app.js";

const { api } = loadApp();

const SOLID = "Solid pack \u2014 ship it.";
const CLOSE = "Close \u2014 fill in what's marked red below.";
const MISSING = "Missing the essentials \u2014 add what's marked red below.";
const RED = "Red flags \u2014 fix these before sharing.";

function pack(lines) {
  return api.analyze(lines.join("\n"));
}

const base = [
  "# Prompt Pack: Four",
  "Who it's for: readers",
  "Provenance: live $10 account with real fills",
  "## The prompt",
  "Buy breakouts.",
];

test("verdicts follow passes, and any red flag overrides a high score", () => {
  const four = pack([...base, "not financial advice", "hard stop"]);
  assert.equal(four.passes, 4);
  assert.equal(four.flags.length, 0);
  assert.equal(four.verdict, MISSING);

  const five = pack([...base, "not financial advice", "hard stop", "## Why it works", "## Metrics"]);
  assert.equal(five.passes, 5);
  assert.equal(five.verdict, CLOSE);

  const six = pack([
    ...base,
    "not financial advice",
    "afford to lose",
    "hard stop",
    "## Why it works",
    "## Metrics",
  ]);
  assert.equal(six.passes, 6);
  assert.equal(six.verdict, CLOSE);

  const seven = pack([
    ...base,
    "not financial advice",
    "afford to lose",
    "hard stop",
    "never add to losers",
    "## Why it works",
    "## Metrics",
  ]);
  assert.equal(seven.passes, 7);
  assert.equal(seven.flags.length, 0);
  assert.equal(seven.verdict, SOLID);

  const flagged = pack([
    ...base,
    "not financial advice",
    "afford to lose",
    "hard stop",
    "never add to losers",
    "## Why it works",
    "## Metrics",
    "Brochure: 90% win rate.",
  ]);
  assert.equal(flagged.passes, 7);
  assert.equal(flagged.flags.length, 1);
  assert.equal(flagged.verdict, RED);
});

test("an empty pack is all missing and verdict is red flags, not merely incomplete", () => {
  const report = api.analyze("");
  assert.equal(report.passes, 0);
  assert.equal(report.results.length, 7);
  assert.ok(report.results.every((result) => result.status === "missing"));
  assert.equal(report.verdict, RED);
});

test("analyze is deterministic and returns the public report shape", () => {
  const text = `${api.sample}\nextra line`;
  const first = api.analyze(text);
  const second = api.analyze(text);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const report = api.analyze(api.sample);
  assert.deepEqual(
    [...report.results].map((result) => result.id),
    ["title", "audience", "provenance", "disclosure", "prompt", "risk", "honesty"]
  );
  for (const result of report.results) {
    assert.equal(typeof result.name, "string");
    assert.equal(typeof result.note, "string");
    assert.ok(result.note.length > 0);
    assert.ok(["pass", "weak", "missing"].includes(result.status));
  }
  assert.equal(typeof report.passes, "number");
  assert.ok(Array.isArray(report.flags));
});

test("the shipped sample and blank template both score as solid packs", () => {
  for (const text of [api.sample, api.template]) {
    const report = api.analyze(text);
    assert.equal(report.passes, 7);
    assert.deepEqual([...report.flags], []);
    assert.equal(report.verdict, SOLID);
    assert.match(text, /^# Prompt Pack:/);
  }
});

test("a large pack does not throw", () => {
  const text = `# Prompt Pack: Bulk\n${"sentence ".repeat(5000)}`;
  const report = api.analyze(text);
  assert.equal(report.results.length, 7);
});
