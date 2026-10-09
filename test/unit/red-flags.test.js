import assert from "node:assert/strict";
import { test } from "node:test";
import { flagNamed, loadApp } from "../helpers/load-app.js";

const { api } = loadApp();

const THEATER = "Win-rate theater / profit guarantees";
const MARTINGALE = "Martingale language";
const FABRICATION = "Track record smells like fabrication";
const NO_DISCLOSURE = "No disclosure at all";
const NO_STOPS = "No stop-loss language at all";

function quotes(text, name) {
  const found = flagNamed(api.analyze(text), name);
  return found ? [...found.quotes] : undefined;
}

test("theater patterns are quoted, and a percent without a claim word is not", () => {
  for (const phrase of [
    "90% win rate",
    "90% winning",
    "12% profit",
    "5% return",
    "80% accuracy",
    "99% success",
    "90%win",
    "100 % win",
    "guaranteed",
    "can't lose",
    "cant lose",
    "risk-free",
    "risk free",
    "double your money",
  ]) {
    const found = quotes(`Claim: ${phrase}.`, THEATER);
    assert.ok(found?.length >= 1, phrase);
    assert.match(found.join(" "), new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.equal(quotes("1000% win stays unmatched", THEATER), undefined);
  assert.equal(quotes("Win rate without a percent.", THEATER), undefined);
});

test("martingale phrases are quoted unless the wording is different", () => {
  for (const phrase of [
    "double down",
    "average down",
    "add to losers",
    "add to your loser",
    "add to the losing",
    "add to a loser",
    "add to losing",
  ]) {
    assert.ok(quotes(`Plan: ${phrase} now.`, MARTINGALE)?.length >= 1, phrase);
  }
  assert.equal(quotes("add to winners", MARTINGALE), undefined);
});

test("negation within 30 characters suppresses a match, including uppercase", () => {
  for (const prefix of ["never ", "NEVER ", "don't ", "do not ", "doesn't ", "does not ", "no ", "not ", "without ", "against "]) {
    assert.equal(quotes(`${prefix}double down`, MARTINGALE), undefined, prefix);
    assert.equal(quotes(`${prefix}90% win rate`, THEATER), undefined, prefix);
  }
  assert.equal(quotes("note double down", MARTINGALE)?.length, 1);
  assert.equal(quotes(`never${" ".repeat(31)}double down`, MARTINGALE)?.length, 1);
  const separated = `never double down.${" ".repeat(40)}average down`;
  assert.equal(quotes(separated, MARTINGALE)?.length, 1);
  assert.match(quotes(separated, MARTINGALE)[0], /average down/);
  assert.doesNotMatch(quotes(separated, MARTINGALE)[0], /double down/);
});

test("nearby theater matches merge; a 21-character gap stays split", () => {
  const merged = quotes(`guaranteed${" ".repeat(20)}risk-free`, THEATER);
  const split = quotes(`guaranteed${" ".repeat(21)}risk-free`, THEATER);
  assert.equal(merged.length, 1);
  assert.match(merged[0], /guaranteed/);
  assert.match(merged[0], /risk-free/);
  assert.equal(split.length, 2);
});

test("quotes collapse whitespace and ellipsize only when context is cut off", () => {
  const pad = "word ".repeat(20);
  const middle = quotes(`${pad}guaranteed ${pad}`, THEATER)[0];
  assert.match(middle, /^\u2026/);
  assert.match(middle, /\u2026$/);
  assert.doesNotMatch(middle, /\s{2}/);
  assert.match(middle, /guaranteed/);

  const start = quotes(`guaranteed ${"word ".repeat(30)}`, THEATER)[0];
  assert.doesNotMatch(start, /^\u2026/);
  assert.match(start, /\u2026$/);

  const end = quotes(`${"word ".repeat(30)}guaranteed`, THEATER)[0];
  assert.match(end, /^\u2026/);
  assert.doesNotMatch(end, /\u2026$/);

  assert.equal(quotes("guaranteed\n\n\nnext", THEATER)[0], "guaranteed next");
});

test("hypothetical and simulated results always count; backtests count only with no live claim", () => {
  const gap = "\n".repeat(90);
  const both = quotes(
    `backtested${gap}hypothetical profits${gap}simulated returns`,
    FABRICATION
  );
  assert.equal(both.length, 3);
  assert.match(both[0], /hypothetical profits/);
  assert.match(both[1], /simulated returns/);
  assert.match(both[2], /backtested/);

  assert.equal(quotes("It was backtested.", FABRICATION)?.length, 1);
  assert.match(quotes("Hypothetical results only.", FABRICATION)[0], /Hypothetical results/);
  assert.match(quotes("Simulated profits in the sheet.", FABRICATION)[0], /Simulated profits/);

  assert.equal(quotes("backtested on a live account", FABRICATION), undefined);
  assert.equal(quotes("not a backtest", FABRICATION), undefined);
  assert.equal(quotes("never backtested", FABRICATION), undefined);
  assert.equal(quotes("This was backtested yesterday.", FABRICATION)?.length, 1);

  const liveHypothetical = flagNamed(
    api.analyze("live $10 account. hypothetical profits in the appendix."),
    FABRICATION
  );
  assert.ok(liveHypothetical);
  assert.match(liveHypothetical.quotes[0], /hypothetical profits/);
  assert.equal(liveHypothetical.quotes.some((quote) => /live/i.test(quote) && /backtest/i.test(quote)), false);
});

test("missing disclosure and missing risk rules become flags with notes and no quotes", () => {
  const report = api.analyze("hello");
  const disclosure = flagNamed(report, NO_DISCLOSURE);
  const stops = flagNamed(report, NO_STOPS);
  assert.deepEqual([...disclosure.quotes], []);
  assert.equal(
    disclosure.note,
    "Nowhere in the text \u2014 readers can't tell this is education, not advice."
  );
  assert.deepEqual([...stops.quotes], []);
  assert.equal(stops.note, "No stops, caps, or take-profits found anywhere in the pack.");
});

test("a weak risk rule does not raise the no-stop flag, and flag order is stable", () => {
  const weakRisk = api.analyze("Never add to losers. Not financial advice.");
  assert.equal(flagNamed(weakRisk, NO_STOPS), undefined);
  assert.equal(flagNamed(weakRisk, MARTINGALE), undefined);
  assert.equal(flagNamed(weakRisk, NO_DISCLOSURE), undefined);

  const report = api.analyze("90% win rate. double down. hypothetical profits. backtested.");
  assert.deepEqual(
    [...report.flags].map((flag) => flag.name),
    [THEATER, MARTINGALE, FABRICATION, NO_DISCLOSURE, NO_STOPS]
  );
  assert.match(report.flags[2].quotes[0], /hypothetical profits/);
  assert.match(report.flags[2].quotes[1], /backtested/);
});
