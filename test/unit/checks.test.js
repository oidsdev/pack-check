import assert from "node:assert/strict";
import { test } from "node:test";
import { checkById, loadApp } from "../helpers/load-app.js";

const { api } = loadApp();
const title = checkById(api, "title");
const audience = checkById(api, "audience");
const provenance = checkById(api, "provenance");
const disclosure = checkById(api, "disclosure");
const prompt = checkById(api, "prompt");
const risk = checkById(api, "risk");
const honesty = checkById(api, "honesty");

test("exposes the seven checks in pack order", () => {
  assert.deepEqual(
    [...api.checks].map((check) => [check.id, check.name]),
    [
      ["title", "Title"],
      ["audience", "Who it's for"],
      ["provenance", "Provenance"],
      ["disclosure", "Disclosure"],
      ["prompt", "The prompt"],
      ["risk", "Risk rules"],
      ["honesty", "Why it works + metrics"],
    ]
  );
});

test("title: prompt-pack heading passes, other headings are weak, none is missing", () => {
  assert.deepEqual(title("# Prompt Pack: Weekend Momentum"), {
    status: "pass",
    note: "Titles itself as a prompt pack.",
  });
  assert.equal(title("# prompt pack: lower case").status, "pass");
  assert.equal(title("#    Prompt Pack: spaced").status, "pass");
  assert.equal(title("#Prompt Pack: tight").status, "pass");
  assert.equal(title("Intro paragraph\n# Prompt Pack: Later").status, "pass");
  assert.equal(title("# Prompt Pack: Name\r\nnext").status, "pass");

  assert.deepEqual(title("# Weekend System"), {
    status: "weak",
    note: "Has a title, but it doesn't say it's a prompt pack.",
  });
  assert.equal(title("## Prompt Pack: Nested").status, "weak");

  assert.deepEqual(title("Prompt Pack: no hash"), {
    status: "missing",
    note: 'No title. Start with "# Prompt Pack: <name>".',
  });
  assert.equal(title("").status, "missing");
  assert.equal(title("   ").status, "missing");
});

test("audience: accepts the plain-language phrasings and rejects nearby wording", () => {
  for (const phrase of ["Who it's for", "WHO IT'S FOR", "who's it for", "who it for", "Who's it's for"]) {
    assert.equal(audience(`Intro. ${phrase}: new traders.`).status, "pass", phrase);
  }
  assert.equal(audience("who its for: missing apostrophe").status, "missing");
  assert.deepEqual(audience("Who it is for: day traders"), {
    status: "missing",
    note: 'Doesn\'t say who the pack is for. Add a "Who it\'s for" line.',
  });
  assert.equal(audience("Audience: anyone with a pulse").status, "missing");
});

test("provenance: needs the label and a live-book or real-fills phrase", () => {
  assert.deepEqual(provenance("Provenance: live $500 account with real fills."), {
    status: "pass",
    note: "Names a live book or account with real fills behind it.",
  });
  assert.deepEqual(provenance("Provenance: distilled from my notes."), {
    status: "weak",
    note: "Claims provenance but names no live book, account, or real fills.",
  });
  assert.equal(provenance("Provenance: this came from a live book.").status, "weak");
  assert.deepEqual(provenance("Ran it in a live account."), {
    status: "weak",
    note: "Names a live account but doesn't label it as provenance.",
  });
  assert.deepEqual(provenance("A strategy I like."), {
    status: "missing",
    note: "No provenance. Say which live book this came from \u2014 not a backtest.",
  });

  for (const evidence of [
    "live $5",
    "live~$9",
    "live ~ $12",
    "live 3",
    "real fills",
    "real money",
    "real account",
    "real trades",
    "live account",
    "live trading",
  ]) {
    assert.equal(provenance(`Provenance: ${evidence}.`).status, "pass", evidence);
    assert.equal(provenance(`Unlabeled ${evidence}.`).status, "weak", evidence);
  }
});

test("disclosure: needs advice language and losable-bankroll framing", () => {
  assert.deepEqual(disclosure("Not financial advice. Only risk what you can afford to lose."), {
    status: "pass",
    note: "Says it's education, not advice, and frames the bankroll as losable.",
  });
  assert.equal(disclosure("Educational purposes. Money you can lose.").status, "pass");
  assert.equal(disclosure("Not investment advice. Afford to lose the stake.").status, "pass");
  assert.equal(disclosure("Losable bankroll, and it is not investment advice.").status, "pass");
  assert.equal(disclosure("Only trade what you can. Educational purposes.").status, "pass");
  assert.equal(disclosure("Only use what you can. Not financial advice.").status, "pass");

  assert.deepEqual(disclosure("Not financial advice."), {
    status: "weak",
    note: "Has the advice disclaimer but no losable-bankroll framing.",
  });
  assert.deepEqual(disclosure("Never trade money you can't afford to lose."), {
    status: "weak",
    note: "Frames the bankroll as losable but never says it's not financial advice.",
  });
  assert.deepEqual(disclosure("Trade carefully."), {
    status: "missing",
    note: "No disclosure. Say it's education, not advice, and that the bankroll can go to zero.",
  });
});

test("disclosure: bankroll phrases respect the gap limits", () => {
  const withinLose = `lose${"x".repeat(25)}bankroll`;
  const beyondLose = `lose${"x".repeat(26)}bankroll`;
  assert.equal(disclosure(`Not financial advice. ${withinLose}`).status, "pass");
  assert.equal(disclosure(`Not financial advice. ${beyondLose}`).status, "weak");

  const withinMoney = `money you can${"y".repeat(15)}lose`;
  const beyondMoney = `money you can${"y".repeat(16)}lose`;
  assert.equal(disclosure(`Educational purposes. ${withinMoney}`).status, "pass");
  assert.equal(disclosure(`Educational purposes. ${beyondMoney}`).status, "weak");

  assert.equal(disclosure("Not financial advice. lose the entire bankroll").status, "pass");
});

test("prompt: heading passes, long instructional voice is weak, otherwise missing", () => {
  assert.deepEqual(prompt("## The prompt\nDo the thing."), {
    status: "pass",
    note: "Contains the actual agent instructions \u2014 the part to hand to the agent.",
  });
  assert.equal(prompt("##  the prompt (give this to your agent)").status, "pass");
  assert.equal(prompt("## THE PROMPT").status, "pass");

  const tail = " never always must";
  const atLimit = `${"x".repeat(800 - tail.length)}${tail}`;
  assert.equal(atLimit.length, 800);
  assert.equal(prompt(atLimit).status, "missing");
  assert.deepEqual(prompt(`x${atLimit}`), {
    status: "weak",
    note: 'Reads like agent instructions but isn\'t under a "The prompt" heading.',
  });

  const twoWords = `${"y".repeat(900)} never always`;
  assert.equal(prompt(twoWords).status, "missing");
  const noWords = "z".repeat(900);
  assert.deepEqual(prompt(noWords), {
    status: "missing",
    note: 'No "The prompt" section \u2014 the instructions the user gives their agent.',
  });
  assert.equal(prompt("never always must stop rule set").status, "missing");
});

test("risk: stops plus a never-add rule passes; either half is weak", () => {
  assert.deepEqual(risk("Hard stop at -8%. Never add to losers."), {
    status: "pass",
    note: "Hard stops (or caps) plus a never-add-to-losers rule. This is the one that matters most.",
  });
  assert.equal(risk("HARD CAP. DON'T ADD TO LOSERS.").status, "pass");

  const stops = [
    "stop",
    "stops",
    "hard cap",
    "exposure cap",
    "take-profit",
    "take profit",
    "take-profits",
    "max loss",
    "max drawdown",
    "cut losers",
    "cut your losers",
    "cut the losers",
    "risk limit",
  ];
  const neverAdds = [
    "never add to losers",
    "don't add to losers",
    "do not add to losers",
    "never average down",
    "no averaging down",
  ];
  for (const phrase of stops) {
    assert.equal(risk(phrase).status, "weak", phrase);
    assert.equal(risk(`${phrase}. ${neverAdds[0]}`).status, "pass", phrase);
  }
  for (const phrase of neverAdds) {
    assert.equal(risk(phrase).status, "weak", phrase);
    assert.deepEqual(risk(phrase), {
      status: "weak",
      note: "Says never add to losers but names no stops, caps, or take-profits.",
    });
  }
  assert.deepEqual(risk("Size small and hope."), {
    status: "missing",
    note: "No risk rules. Every pack needs hard stops (or caps) and a never-add-to-losers rule.",
  });
  assert.equal(risk("Hard stop only.").status, "weak");
  assert.match(risk("Hard stop only.").note, /no explicit never-add-to-losers rule/);
});

test("honesty: needs both sections", () => {
  assert.deepEqual(honesty("## Why it works\nBecause.\n## Metrics to track\nDrawdown."), {
    status: "pass",
    note: "Explains the mechanism honestly and lists metrics to track.",
  });
  assert.equal(honesty("## WHY IT WORKS\n## METRICS").status, "pass");
  assert.deepEqual(honesty("## Why it works\nBecause."), {
    status: "weak",
    note: 'Has one of "Why it works" / "Metrics to track" but not both.',
  });
  assert.equal(honesty("## Metrics\nWin rate.").status, "weak");
  assert.deepEqual(honesty("It works because I said so."), {
    status: "missing",
    note: "No honest mechanism and no metrics. Say why it works and what to measure.",
  });
});
