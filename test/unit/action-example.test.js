import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { repoRoot } from "../helpers/load-app.js";

const root = repoRoot();
const script = path.join(root, "docs/github-action/check.mjs");

function run(args, env = {}) {
  const report = path.join(
    os.tmpdir(),
    `pack-check-report-${process.pid}-${Math.random().toString(16).slice(2)}.md`
  );
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, REPORT_PATH: report, ...env },
    encoding: "utf8",
  });
  const body = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : "";
  fs.rmSync(report, { force: true });
  return { status: result.status, stderr: result.stderr, body };
}

test("a solid pack passes and a red-flag pack fails", () => {
  const good = run(["test/fixtures/canonical-starter.md"]);
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.body, /7\/7 sections/);
  assert.match(good.body, /Result: pass/);
  assert.match(good.body, /## Red flags\n\nNone\./);

  const bad = run(["test/fixtures/martingale.md"]);
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.body, /Result: fail/);
  assert.match(bad.body, /Martingale language/);
});

test("a weak section is reported and does not fail the run", () => {
  const file = path.join(os.tmpdir(), `weak-pack-${process.pid}.md`);
  fs.writeFileSync(
    file,
    [
      "# Prompt Pack: Weak Risk (Starter)",
      "",
      "**Who it's for:** a reader with a small account.",
      "**Provenance:** live $100 account with real fills.",
      "**Disclosure:** not financial advice. Only risk what you can afford to lose.",
      "",
      "## The prompt",
      "",
      "Buy breakouts. Size at 1%.",
      "",
      "### Risk rules",
      "",
      "- Hard stop at -5% on every position.",
      "",
      "## Why it works",
      "",
      "Stops cut the losers.",
      "",
      "## Metrics to track",
      "",
      "Max drawdown.",
      "",
    ].join("\n")
  );
  try {
    const result = run([file]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.body, /\[~\] Risk rules/);
    assert.match(result.body, /Result: pass/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("a stub file fails and a missing packs directory does not", () => {
  const stub = path.join(os.tmpdir(), `stub-pack-${process.pid}.md`);
  fs.writeFileSync(stub, "# Prompt Pack: No\n");
  try {
    const short = run([stub]);
    assert.equal(short.status, 1, short.stderr);
    assert.match(short.body, /Too short to check/);
  } finally {
    fs.rmSync(stub, { force: true });
  }

  const missing = run([], { PACK_DIR: path.join(os.tmpdir(), "pack-check-packs-missing") });
  assert.equal(missing.status, 0, missing.stderr);
  assert.match(missing.body, /Directory not found/);
});
