import assert from "node:assert/strict";
import { test } from "node:test";
import { loadApp, loadFixture } from "../helpers/load-app.js";

function app() {
  return loadApp();
}

function type(ctx, value) {
  const packIn = ctx.document.getElementById("pack-in");
  packIn.value = value;
  packIn.dispatchEvent(new ctx.window.Event("input", { bubbles: true }));
  return packIn;
}

function installClipboard(ctx, writeText) {
  Object.defineProperty(ctx.window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(ctx.window.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("the check control stays disabled until the box has text", () => {
  const ctx = app();
  const button = ctx.document.getElementById("check-btn");
  const result = ctx.document.getElementById("screen-result");
  assert.equal(button.disabled, true);
  assert.equal(result.classList.contains("hidden"), true);

  type(ctx, "   ");
  assert.equal(button.disabled, true);

  type(ctx, "short");
  assert.equal(button.disabled, false);
});

test("packs under 50 characters are refused and further typing clears the message", () => {
  const ctx = app();
  type(ctx, "x".repeat(49));
  ctx.document.getElementById("check-btn").click();
  const message = ctx.document.getElementById("input-msg");
  assert.equal(message.textContent, "Paste a bit more \u2014 that's too short to check.");
  assert.equal(ctx.document.getElementById("screen-result").classList.contains("hidden"), true);

  type(ctx, "x".repeat(49));
  assert.equal(message.textContent, "");
});

test("a 50 character pack renders a report and a second run keeps the heading focusable", () => {
  const ctx = app();
  type(ctx, "x".repeat(50));
  ctx.document.getElementById("check-btn").click();

  const result = ctx.document.getElementById("screen-result");
  const input = ctx.document.getElementById("screen-input");
  assert.equal(result.classList.contains("hidden"), false);
  assert.equal(input.classList.contains("hidden"), true);
  assert.equal(ctx.document.getElementById("score-line").textContent, "0/7 sections + 2 red flags");
  assert.equal(
    ctx.document.getElementById("verdict-line").textContent,
    "Red flags \u2014 fix these before sharing."
  );
  assert.equal(result.querySelector("h1").getAttribute("tabindex"), "-1");

  type(ctx, "y".repeat(50));
  ctx.document.getElementById("check-btn").click();
  assert.equal(result.querySelector("h1").getAttribute("tabindex"), "-1");
});

test("load sample, check, and start over walk the page through both screens", () => {
  const ctx = app();
  ctx.document.getElementById("sample-btn").click();
  const packIn = ctx.document.getElementById("pack-in");
  assert.equal(packIn.value, ctx.api.sample);
  assert.equal(ctx.document.getElementById("check-btn").disabled, false);
  assert.equal(
    ctx.document.getElementById("input-msg").textContent,
    "Sample loaded. Hit \u201cCheck my pack\u201d to see a passing report."
  );

  ctx.document.getElementById("check-btn").click();
  assert.equal(ctx.document.getElementById("score-line").textContent, "7/7 sections");
  assert.equal(ctx.document.getElementById("verdict-line").textContent, "Solid pack \u2014 ship it.");
  assert.match(ctx.document.getElementById("checks-out").innerHTML, /class="tag pass"/);
  assert.match(
    ctx.document.getElementById("flags-out").textContent,
    /No red flags/
  );

  ctx.document.getElementById("restart-btn").click();
  assert.equal(packIn.value, "");
  assert.equal(ctx.document.getElementById("check-btn").disabled, true);
  assert.equal(ctx.document.getElementById("input-msg").textContent, "");
  assert.equal(ctx.document.getElementById("screen-input").classList.contains("hidden"), false);
  assert.equal(ctx.document.getElementById("screen-result").classList.contains("hidden"), true);
});

test("mixed packs render pass, weak, and missing tags, and one red flag stays singular", () => {
  const ctx = app();
  type(ctx, loadFixture("close-pack.md"));
  ctx.document.getElementById("check-btn").click();
  const html = ctx.document.getElementById("checks-out").innerHTML;
  assert.match(html, /class="tag pass"/);
  assert.match(html, /class="tag weak"/);
  assert.match(html, /class="tag missing"/);
  assert.match(ctx.document.getElementById("flags-out").textContent, /No red flags/);

  type(ctx, loadFixture("theater-guarantees.md"));
  ctx.document.getElementById("check-btn").click();
  assert.equal(
    ctx.document.getElementById("score-line").textContent,
    "7/7 sections + 1 red flag"
  );
  assert.match(ctx.document.getElementById("flags-out").innerHTML, /<blockquote>/);
  assert.match(ctx.document.getElementById("flags-out").textContent, /Win-rate theater/);
});

test("flag quotes are escaped before they are written into the page", () => {
  const ctx = app();
  type(ctx, `<b>&"' 90% win rate and enough trailing text to clear the length check`);
  ctx.document.getElementById("check-btn").click();
  const quote = ctx.document.querySelector("#flags-out blockquote");
  assert.match(quote.textContent, /<b>&"'/);
  assert.equal(quote.querySelector("b"), null);
  assert.match(quote.innerHTML, /&lt;b&gt;/);
  assert.match(quote.innerHTML, /&amp;/);
  assert.doesNotMatch(quote.innerHTML, /<b>/);
});

test("copy report and copy template use the clipboard, including singular and plural flags", async () => {
  const ctx = app();
  let copied = "";
  installClipboard(ctx, (text) => {
    copied = text;
    return Promise.resolve();
  });

  type(ctx, loadFixture("theater-guarantees.md"));
  ctx.document.getElementById("check-btn").click();
  ctx.document.getElementById("copy-report-btn").click();
  await flush();
  assert.equal(ctx.document.getElementById("copy-msg").textContent, "Report copied.");
  assert.match(copied, /^# Pack Check report/);
  assert.match(copied, /Score: 7\/7 sections, 1 red flag/);
  assert.match(copied, /Verdict: Red flags/);
  assert.match(copied, /- \[x\] Title /);
  assert.match(copied, /Win-rate theater \/ profit guarantees: "/);

  type(ctx, loadFixture("no-disclosure-no-stops.md"));
  ctx.document.getElementById("check-btn").click();
  ctx.document.getElementById("copy-report-btn").click();
  await flush();
  assert.match(copied, /Score: 5\/7 sections, 2 red flags/);
  assert.match(copied, /- \[x\] Title /);
  assert.match(copied, /- \[ \] Disclosure /);
  assert.match(copied, /- \[ \] Risk rules /);
  assert.match(copied, /No disclosure at all \(Nowhere in the text/);
  assert.match(copied, /No stop-loss language at all \(No stops, caps, or take-profits/);

  ctx.document.getElementById("copy-template-btn").click();
  await flush();
  assert.equal(copied, ctx.api.template);
  assert.equal(
    ctx.document.getElementById("copy-msg").textContent,
    "Blank template copied. Fill in each section."
  );
});

test("a rejected clipboard falls back to execCommand, and a failed fallback says so", async () => {
  const ctx = app();
  type(ctx, ctx.api.sample);
  ctx.document.getElementById("check-btn").click();

  installClipboard(ctx, () => Promise.reject(new Error("denied")));
  ctx.document.execCommand = () => true;
  ctx.document.getElementById("copy-template-btn").click();
  await flush();
  assert.equal(
    ctx.document.getElementById("copy-msg").textContent,
    "Blank template copied. Fill in each section."
  );

  Object.defineProperty(ctx.window.navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  ctx.document.execCommand = () => {
    throw new Error("unavailable");
  };
  ctx.document.getElementById("copy-report-btn").click();
  assert.equal(
    ctx.document.getElementById("copy-msg").textContent,
    "Couldn't copy. Select the text by hand and copy it."
  );
});

test("a clean sample report marks every section done and lists no red flags", async () => {
  const ctx = app();
  let copied = "";
  installClipboard(ctx, (text) => {
    copied = text;
    return Promise.resolve();
  });
  type(ctx, ctx.api.sample);
  ctx.document.getElementById("check-btn").click();
  ctx.document.getElementById("copy-report-btn").click();
  await flush();
  assert.match(copied, /Score: 7\/7 sections\n/);
  assert.match(copied, /## Red flags\n\nNone\./);
  assert.equal(copied.match(/- \[x\] /g).length, 7);
});
