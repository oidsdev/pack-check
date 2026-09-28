/* Pack Check - all logic runs in this page. No network calls, no storage, no tracking. */
(function () {
  "use strict";

  // ---------- The 7 checks (each returns {status, note}) ----------
  // status: "pass" | "weak" | "missing"
  function checkTitle(t) {
    if (/^#\s*prompt pack:/im.test(t)) return { status: "pass", note: "Titles itself as a prompt pack." };
    if (/^#\s*\S+/m.test(t)) return { status: "weak", note: "Has a title, but it doesn't say it's a prompt pack." };
    return { status: "missing", note: "No title. Start with \"# Prompt Pack: <name>\"." };
  }
  function checkAudience(t) {
    if (/who(?:'s)? it(?:'s)? for/i.test(t)) return { status: "pass", note: "Names its audience in plain words." };
    return { status: "missing", note: "Doesn't say who the pack is for. Add a \"Who it's for\" line." };
  }
  function checkProvenance(t) {
    var hasLabel = /provenance/i.test(t);
    var evidence = /live\s*~?\s*\$?\d|real fills|real money|real account|real trades|live account|live trading/i.test(t);
    if (hasLabel && evidence) return { status: "pass", note: "Names a live book or account with real fills behind it." };
    if (hasLabel) return { status: "weak", note: "Claims provenance but names no live book, account, or real fills." };
    if (evidence) return { status: "weak", note: "Names a live account but doesn't label it as provenance." };
    return { status: "missing", note: "No provenance. Say which live book this came from \u2014 not a backtest." };
  }
  function checkDisclosure(t) {
    var nfa = /not financial advice|educational purposes|not investment advice/i.test(t);
    var bankroll = /afford to lose|los(e|able)[\s\S]{0,25}bankroll|only (risk|trade|use) what you can|money you can[\s\S]{0,15}lose/i.test(t);
    if (nfa && bankroll) return { status: "pass", note: "Says it's education, not advice, and frames the bankroll as losable." };
    if (nfa) return { status: "weak", note: "Has the advice disclaimer but no losable-bankroll framing." };
    if (bankroll) return { status: "weak", note: "Frames the bankroll as losable but never says it's not financial advice." };
    return { status: "missing", note: "No disclosure. Say it's education, not advice, and that the bankroll can go to zero." };
  }
  function checkPrompt(t) {
    if (/##\s*the prompt/i.test(t)) return { status: "pass", note: "Contains the actual agent instructions \u2014 the part to hand to the agent." };
    // No heading: look for instructional voice (rules-heavy prose aimed at an agent).
    var indicators = t.toLowerCase().match(/\b(never|always|must|rules?|stops?|set)\b/g) || [];
    var unique = {};
    indicators.forEach(function (w) { unique[w] = 1; });
    if (t.length > 800 && Object.keys(unique).length >= 3)
      return { status: "weak", note: "Reads like agent instructions but isn't under a \"The prompt\" heading." };
    return { status: "missing", note: "No \"The prompt\" section \u2014 the instructions the user gives their agent." };
  }
  function checkRisk(t) {
    var stopish = /\bstops?\b|hard cap|exposure cap|take[\s-]?profits?|max (loss|drawdown)|cut (your |the )?losers|risk limit/i.test(t);
    var neverAdd = /never add to losers|don't add to losers|do not add to losers|never average down|no averaging down/i.test(t);
    if (stopish && neverAdd) return { status: "pass", note: "Hard stops (or caps) plus a never-add-to-losers rule. This is the one that matters most." };
    if (stopish) return { status: "weak", note: "Has stops or caps but no explicit never-add-to-losers rule." };
    if (neverAdd) return { status: "weak", note: "Says never add to losers but names no stops, caps, or take-profits." };
    return { status: "missing", note: "No risk rules. Every pack needs hard stops (or caps) and a never-add-to-losers rule." };
  }
  function checkHonesty(t) {
    var why = /##\s*why it works/i.test(t);
    var metrics = /##\s*metrics/i.test(t);
    if (why && metrics) return { status: "pass", note: "Explains the mechanism honestly and lists metrics to track." };
    if (why || metrics) return { status: "weak", note: "Has one of \"Why it works\" / \"Metrics to track\" but not both." };
    return { status: "missing", note: "No honest mechanism and no metrics. Say why it works and what to measure." };
  }

  var CHECKS = [
    { id: "title", name: "Title", run: checkTitle },
    { id: "audience", name: "Who it's for", run: checkAudience },
    { id: "provenance", name: "Provenance", run: checkProvenance },
    { id: "disclosure", name: "Disclosure", run: checkDisclosure },
    { id: "prompt", name: "The prompt", run: checkPrompt },
    { id: "risk", name: "Risk rules", run: checkRisk },
    { id: "honesty", name: "Why it works + metrics", run: checkHonesty }
  ];

  // ---------- Red flags ----------
  var NEG = /\b(never|don't|do not|doesn't|does not|no|not|without|against)\b/;

  function quoteAround(text, idx, len) {
    var s = Math.max(0, idx - 35), e = Math.min(text.length, idx + len + 45);
    var q = text.slice(s, e).replace(/\s+/g, " ").trim();
    return (s > 0 ? "\u2026" : "") + q + (e < text.length ? "\u2026" : "");
  }

  // Find pattern matches, skipping ones that are negated ("never double down" is good, not bad).
  // Overlapping/adjacent matches are merged so one sentence doesn't produce three quotes.
  function findMatches(text, pats) {
    var low = text.toLowerCase(), ranges = [];
    pats.forEach(function (re) {
      var r = new RegExp(re.source, "gi"), m;
      while ((m = r.exec(low)) !== null) {
        if (m[0].length === 0) { r.lastIndex++; continue; }
        var before = low.slice(Math.max(0, m.index - 30), m.index);
        if (NEG.test(before)) continue;
        ranges.push([m.index, m.index + m[0].length]);
      }
    });
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    ranges.forEach(function (rg) {
      var last = merged[merged.length - 1];
      if (last && rg[0] <= last[1] + 20) last[1] = Math.max(last[1], rg[1]);
      else merged.push([rg[0], rg[1]]);
    });
    return merged.map(function (rg) { return quoteAround(text, rg[0], rg[1] - rg[0]); });
  }

  var THEATER_PATS = [
    /\b\d{1,3}\s?%\s*(win(ning)?|profit|return|accuracy|success)\b/i,
    /\bguaranteed\b/i,
    /can'?t lose/i,
    /risk[\s-]?free/i,
    /double your money/i
  ];
  var MARTINGALE_PATS = [
    /\bdouble down\b/i,
    /\baverage down\b/i,
    /\badd to (your |the |a )?(loser|losing)/i
  ];

  function findRedFlags(text, results) {
    var flags = [];
    var byId = {};
    results.forEach(function (r) { byId[r.id] = r.status; });

    var theater = findMatches(text, THEATER_PATS);
    if (theater.length) flags.push({ name: "Win-rate theater / profit guarantees", quotes: theater });

    var mart = findMatches(text, MARTINGALE_PATS);
    if (mart.length) flags.push({ name: "Martingale language", quotes: mart });

    // Track-record smells: hypothetical/simulated results always count;
    // "backtest" only counts when nothing live is claimed anywhere.
    var fab = findMatches(text, [/\bhypothetical (results|returns|profits)\b/i, /\bsimulated (results|returns|profits)\b/i]);
    var back = findMatches(text, [/\bbacktest(ed|ing)?\b/i]);
    if (back.length && !/live/i.test(text)) fab = fab.concat(back);
    if (fab.length) flags.push({ name: "Track record smells like fabrication", quotes: fab });

    if (byId.disclosure === "missing")
      flags.push({ name: "No disclosure at all", quotes: [], note: "Nowhere in the text \u2014 readers can't tell this is education, not advice." });
    if (byId.risk === "missing")
      flags.push({ name: "No stop-loss language at all", quotes: [], note: "No stops, caps, or take-profits found anywhere in the pack." });

    return flags;
  }

  // ---------- Analysis ----------
  function analyze(text) {
    var results = CHECKS.map(function (c) {
      var r = c.run(text);
      return { id: c.id, name: c.name, status: r.status, note: r.note };
    });
    var flags = findRedFlags(text, results);
    var passes = results.filter(function (r) { return r.status === "pass"; }).length;
    var verdict;
    if (flags.length) verdict = "Red flags \u2014 fix these before sharing.";
    else if (passes === 7) verdict = "Solid pack \u2014 ship it.";
    else if (passes >= 5) verdict = "Close \u2014 fill in what's marked red below.";
    else verdict = "Missing the essentials \u2014 add what's marked red below.";
    return { results: results, flags: flags, passes: passes, verdict: verdict };
  }

  // ---------- Sample pack (clean, passing) ----------
  var SAMPLE = [
    "# Prompt Pack: Weekend Momentum (Starter)",
    "",
    "**Who it's for:** a casual user whose AI agent trades stocks with a small, losable bankroll.",
    "**Provenance:** distilled from a live $500 stock account running since August 2026. Real rules, real fills.",
    "**Disclosure:** education, not financial advice. You can lose the entire bankroll. Never trade money you can't afford to lose.",
    "",
    "## The prompt (give this to your agent)",
    "",
    "You are a momentum trader. Bankroll: $500, hard cap \u2014 never risk more than the bankroll.",
    "",
    "### Entry rules",
    "- Buy confirmed breakouts with rising volume only, as maker limit orders.",
    "- Size: 2% of bankroll per trade.",
    "",
    "### Risk rules (non-negotiable)",
    "- Hard stop at -8% on every position. Set it at entry, never move it down.",
    "- Never add to losers. No martingale.",
    "",
    "## Why it works (the honest version)",
    "",
    "Breakouts work when volume confirms them; the stops keep losers small. Expect most trades to be small wins or small losses \u2014 the account grows when a few runners cover the churn.",
    "",
    "## Metrics to track",
    "",
    "Win rate, average winner vs average loser, max drawdown."
  ].join("\n");

  // ---------- Blank template ----------
  var TEMPLATE = [
    "# Prompt Pack: <name> (Starter)",
    "",
    "**Who it's for:** <who should use this, in plain words>",
    "**Provenance:** <which live book or account this came from, with real fills \u2014 not a backtest>",
    "**Disclosure:** education, not financial advice. <losable-bankroll framing, e.g. never trade money you can't afford to lose>",
    "",
    "## The prompt (give this to your agent)",
    "",
    "<the actual instructions, in the agent's voice>",
    "",
    "### Risk rules (non-negotiable)",
    "",
    "- <hard stop or cap, set at entry>",
    "- Never add to losers. No martingale.",
    "",
    "## Why it works (the honest version)",
    "",
    "<the mechanism, without hype>",
    "",
    "## Metrics to track",
    "",
    "<what to measure to know if it's working>"
  ].join("\n");

  // ---------- Rendering ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function show(name) {
    ["input", "result"].forEach(function (s) {
      document.getElementById("screen-" + s).classList.toggle("hidden", s !== name);
    });
    window.scrollTo(0, 0);
    var h = document.querySelector("#screen-" + name + " h1");
    if (h && name !== "input") { if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }

  var lastAnalysis = null, lastText = "";

  function renderResult(text) {
    lastText = text;
    lastAnalysis = analyze(text);
    var a = lastAnalysis;

    var score = a.passes + "/7 sections";
    if (a.flags.length) score += " + " + a.flags.length + " red flag" + (a.flags.length === 1 ? "" : "s");
    document.getElementById("score-line").textContent = score;
    document.getElementById("verdict-line").textContent = a.verdict;

    var tagName = { pass: "Pass", weak: "Weak", missing: "Missing" };
    document.getElementById("checks-out").innerHTML = a.results.map(function (r) {
      return '<li><span class="check-name">' + esc(r.name) +
        ' <span class="tag ' + r.status + '">' + tagName[r.status] + "</span></span>" +
        '<p class="check-note">' + esc(r.note) + "</p></li>";
    }).join("");

    var fo = document.getElementById("flags-out");
    if (!a.flags.length) {
      fo.innerHTML = '<div class="flags-none"><strong>No red flags.</strong> Nothing in the text tripped the theater, martingale, or fabrication checks.</div>';
    } else {
      fo.innerHTML = '<ul class="flags">' + a.flags.map(function (f) {
        var inner = '<span class="flag-name">' + esc(f.name) + "</span>";
        f.quotes.forEach(function (q) { inner += "<blockquote>" + esc(q) + "</blockquote>"; });
        if (f.note) inner += '<p class="flag-note">' + esc(f.note) + "</p>";
        return "<li>" + inner + "</li>";
      }).join("") + "</ul>";
    }

    document.getElementById("copy-msg").textContent = "";
    show("result");
  }

  // ---------- Copy helpers ----------
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    var ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta); return ok;
  }
  function doCopy(text, okMsg) {
    var msg = document.getElementById("copy-msg");
    function done(ok) { msg.textContent = ok ? okMsg : "Couldn't copy. Select the text by hand and copy it."; }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    else done(fallbackCopy(text));
  }

  function buildReport() {
    var a = lastAnalysis;
    var mark = { pass: "x", weak: "~", missing: " " };
    var out = ["# Pack Check report", ""];
    var score = a.passes + "/7 sections";
    if (a.flags.length) score += ", " + a.flags.length + " red flag" + (a.flags.length === 1 ? "" : "s");
    out.push("Score: " + score);
    out.push("Verdict: " + a.verdict);
    out.push("", "## Section checks", "");
    a.results.forEach(function (r) { out.push("- [" + mark[r.status] + "] " + r.name + " \u2014 " + r.note); });
    out.push("", "## Red flags", "");
    if (!a.flags.length) out.push("None.");
    a.flags.forEach(function (f) {
      var line = "- " + f.name;
      if (f.quotes.length) line += ": " + f.quotes.map(function (q) { return '"' + q + '"'; }).join("; ");
      if (f.note) line += " (" + f.note + ")";
      out.push(line);
    });
    return out.join("\n");
  }

  // ---------- Wire up ----------
  var packIn = document.getElementById("pack-in");
  var checkBtn = document.getElementById("check-btn");
  var inputMsg = document.getElementById("input-msg");

  packIn.addEventListener("input", function () {
    checkBtn.disabled = packIn.value.trim().length === 0;
    inputMsg.textContent = "";
  });
  checkBtn.addEventListener("click", function () {
    var text = packIn.value.trim();
    if (text.length < 50) {
      inputMsg.textContent = "Paste a bit more \u2014 that's too short to check.";
      return;
    }
    renderResult(text);
  });
  document.getElementById("sample-btn").addEventListener("click", function () {
    packIn.value = SAMPLE;
    checkBtn.disabled = false;
    inputMsg.textContent = "Sample loaded. Hit \u201cCheck my pack\u201d to see a passing report.";
    packIn.focus();
  });
  document.getElementById("copy-report-btn").addEventListener("click", function () {
    doCopy(buildReport(), "Report copied.");
  });
  document.getElementById("copy-template-btn").addEventListener("click", function () {
    doCopy(TEMPLATE, "Blank template copied. Fill in each section.");
  });
  document.getElementById("restart-btn").addEventListener("click", function () {
    packIn.value = "";
    checkBtn.disabled = true;
    inputMsg.textContent = "";
    lastAnalysis = null; lastText = "";
    show("input");
  });

  // Test hook (read-only): lets automated checks run the analyzer. Does nothing for normal visitors.
  window.__packCheck = { analyze: analyze, checks: CHECKS, sample: SAMPLE, template: TEMPLATE };
})();
