import assert from "node:assert/strict";
import { test } from "node:test";
import { flagNamed, loadApp, loadFixture } from "../helpers/load-app.js";

const { api } = loadApp();

const SOLID = "Solid pack \u2014 ship it.";
const CLOSE = "Close \u2014 fill in what's marked red below.";
const MISSING = "Missing the essentials \u2014 add what's marked red below.";
const RED = "Red flags \u2014 fix these before sharing.";
const THEATER = "Win-rate theater / profit guarantees";
const MARTINGALE = "Martingale language";
const FABRICATION = "Track record smells like fabrication";
const NO_DISCLOSURE = "No disclosure at all";
const NO_STOPS = "No stop-loss language at all";

function statuses(report) {
  return Object.fromEntries([...report.results].map((result) => [result.id, result.status]));
}

function names(report) {
  return [...report.flags].map((flag) => flag.name);
}

const cases = [
  {
    file: "canonical-starter.md",
    passes: 7,
    verdict: SOLID,
    statuses: {
      title: "pass",
      audience: "pass",
      provenance: "pass",
      disclosure: "pass",
      prompt: "pass",
      risk: "pass",
      honesty: "pass",
    },
    flags: [],
  },
  {
    file: "plain-labels.md",
    passes: 7,
    verdict: SOLID,
    statuses: {
      title: "pass",
      audience: "pass",
      provenance: "pass",
      disclosure: "pass",
      prompt: "pass",
      risk: "pass",
      honesty: "pass",
    },
    flags: [],
  },
  {
    file: "blank-template.md",
    passes: 7,
    verdict: SOLID,
    statuses: {
      title: "pass",
      audience: "pass",
      provenance: "pass",
      disclosure: "pass",
      prompt: "pass",
      risk: "pass",
      honesty: "pass",
    },
    flags: [],
  },
  {
    file: "close-pack.md",
    passes: 5,
    verdict: CLOSE,
    statuses: {
      title: "weak",
      audience: "missing",
      provenance: "pass",
      disclosure: "pass",
      prompt: "pass",
      risk: "pass",
      honesty: "pass",
    },
    flags: [],
  },
  {
    file: "instructional-no-heading.md",
    passes: 6,
    verdict: CLOSE,
    statuses: {
      title: "pass",
      audience: "pass",
      provenance: "pass",
      disclosure: "pass",
      prompt: "weak",
      risk: "pass",
      honesty: "pass",
    },
    flags: [],
  },
  {
    file: "missing-essentials.md",
    passes: 0,
    verdict: MISSING,
    statuses: {
      title: "missing",
      audience: "missing",
      provenance: "missing",
      disclosure: "weak",
      prompt: "missing",
      risk: "weak",
      honesty: "missing",
    },
    flags: [],
  },
  {
    file: "theater-guarantees.md",
    passes: 7,
    verdict: RED,
    flags: [THEATER],
  },
  {
    file: "martingale.md",
    passes: 6,
    verdict: RED,
    flags: [MARTINGALE],
  },
  {
    file: "negated-martingale.md",
    passes: 7,
    verdict: SOLID,
    flags: [],
  },
  {
    file: "backtest-only.md",
    passes: 7,
    verdict: RED,
    flags: [FABRICATION],
  },
  {
    file: "live-with-backtest.md",
    passes: 7,
    verdict: SOLID,
    flags: [],
  },
  {
    file: "hypothetical-results.md",
    passes: 7,
    verdict: RED,
    flags: [FABRICATION],
  },
  {
    file: "no-disclosure-no-stops.md",
    passes: 5,
    verdict: RED,
    flags: [NO_DISCLOSURE, NO_STOPS],
  },
  {
    file: "unstructured-memo.md",
    passes: 0,
    verdict: RED,
    flags: [FABRICATION, NO_DISCLOSURE, NO_STOPS],
  },
];

test("analyzer API: every fixture returns a complete report", () => {
  for (const item of cases) {
    const text = loadFixture(item.file).replace(/\n$/, "");
    const report = api.analyze(text);
    assert.equal(report.passes, item.passes, item.file);
    assert.equal(report.verdict, item.verdict, item.file);
    assert.deepEqual(names(report), item.flags, item.file);
    if (item.statuses) assert.deepEqual(statuses(report), item.statuses, item.file);
    assert.equal(report.results.length, 7, item.file);
    assert.equal(
      report.passes,
      report.results.filter((result) => result.status === "pass").length,
      item.file
    );
  }
});

test("blank template fixture matches the template the page copies", () => {
  assert.equal(loadFixture("blank-template.md").replace(/\n$/, ""), api.template);
});

test("negated martingale wording is present and still produces no martingale flag", () => {
  const text = loadFixture("negated-martingale.md");
  assert.match(text, /double down/i);
  assert.match(text, /average down/i);
  const report = api.analyze(text);
  assert.equal(flagNamed(report, MARTINGALE), undefined);
});

test("backtest quotes are dropped when the pack also says live, and kept otherwise", () => {
  const backtest = loadFixture("backtest-only.md");
  assert.doesNotMatch(backtest, /live/i);
  const backtestFlag = flagNamed(api.analyze(backtest), FABRICATION);
  assert.match(backtestFlag.quotes[0], /simulated results/i);
  assert.match(backtestFlag.quotes[1], /backtested/i);

  const live = loadFixture("live-with-backtest.md");
  assert.match(live, /backtest/i);
  assert.match(live, /live/i);
  assert.equal(flagNamed(api.analyze(live), FABRICATION), undefined);

  const hypothetical = loadFixture("hypothetical-results.md");
  assert.match(hypothetical, /live/i);
  assert.match(hypothetical, /hypothetical profits/i);
  const flag = flagNamed(api.analyze(hypothetical), FABRICATION);
  assert.match(flag.quotes[0], /hypothetical profits/i);
  assert.match(flag.quotes[1], /simulated returns/i);
});

test("theater and martingale fixtures quote the offending phrases", () => {
  const theater = flagNamed(api.analyze(loadFixture("theater-guarantees.md")), THEATER);
  const blob = theater.quotes.join(" ");
  for (const phrase of ["90% win", "guaranteed", "can't lose", "risk-free", "double your money"]) {
    assert.match(blob, new RegExp(phrase, "i"));
  }

  const mart = flagNamed(api.analyze(loadFixture("martingale.md")), MARTINGALE);
  assert.match(mart.quotes.join(" "), /double down/);
  assert.match(mart.quotes.join(" "), /average down/);
  assert.match(mart.quotes.join(" "), /add to the losing/);
});
