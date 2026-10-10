/* Format a pack-check analysis object as one HTML file. */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STATUS_LABEL = {
  pass: "Pass",
  weak: "Weak",
  missing: "Missing",
};

// Repeated on each element. The report file has no stylesheet and no framework.
const S = {
  html: "color-scheme:light dark",
  body: "margin:0;background:Canvas;color:CanvasText;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5",
  main: "max-width:44rem;margin:0 auto;padding:2rem 1.25rem 3rem",
  brand: "margin:0;font-weight:800;letter-spacing:-.01em",
  h1: "margin:.35rem 0 .75rem;font-size:1.75rem;line-height:1.2;letter-spacing:-.02em",
  score: "margin:0;font-size:1.35rem;font-weight:800;letter-spacing:-.01em",
  verdict: "margin:.35rem 0 0;font-size:1.05rem;font-weight:700",
  h2: "margin:2rem 0 .75rem;font-size:1.15rem;line-height:1.3",
  counts: "display:grid;grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr));gap:.75rem;margin:0",
  count: "margin:0;border:1px solid CanvasText;padding:.55rem .75rem",
  dt: "margin:0;font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase",
  dd: "margin:.2rem 0 0;font-size:1.5rem;font-weight:800;letter-spacing:-.02em",
  scroll: "overflow-x:auto",
  table: "width:100%;border-collapse:collapse",
  th: "text-align:left;vertical-align:bottom;border-bottom:2px solid CanvasText;padding:.35rem .6rem .45rem 0;font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase",
  row: "text-align:left;vertical-align:top;border-bottom:1px solid CanvasText;padding:.75rem .6rem .75rem 0;font-weight:700",
  td: "text-align:left;vertical-align:top;border-bottom:1px solid CanvasText;padding:.75rem .6rem .75rem 0",
  summary: "cursor:pointer;font-weight:600",
  note: "margin:.55rem 0 0;white-space:pre-wrap;overflow-wrap:anywhere",
  quote: "margin:.55rem 0 0;padding:.15rem 0 .15rem .75rem;border-left:3px solid CanvasText;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9rem;white-space:pre-wrap;overflow-wrap:anywhere",
  flag: "border-bottom:1px solid CanvasText;padding:.7rem 0",
  none: "margin:0",
  foot: "margin:2.25rem 0 0;font-size:.85rem;max-width:38rem",
};

const TAG = {
  pass: "display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:1.5px solid CanvasText;border-radius:4px;padding:0 .35rem;vertical-align:2px;background:CanvasText;color:Canvas",
  weak: "display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:1.5px dashed CanvasText;border-radius:4px;padding:0 .35rem;vertical-align:2px",
  missing: "display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:3px double CanvasText;border-radius:4px;padding:0 .35rem;vertical-align:2px",
  unknown: "display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:1.5px solid CanvasText;border-radius:4px;padding:0 .35rem;vertical-align:2px",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function text(value) {
  if (value == null) return "";
  return String(value);
}

function checkName(result) {
  const name = text(result.name).trim();
  if (name) return name;
  const id = text(result.id).trim();
  if (id) return id;
  return "Check";
}

function statusKind(status) {
  if (status === "pass" || status === "weak" || status === "missing") return status;
  return "unknown";
}

function statusLabel(status) {
  const kind = statusKind(status);
  if (kind !== "unknown") return STATUS_LABEL[kind];
  const raw = text(status).trim();
  return raw || "Unknown";
}

function tally(results) {
  const counts = { pass: 0, weak: 0, missing: 0 };
  for (const result of results) {
    const kind = statusKind(result.status);
    if (kind !== "unknown") counts[kind] += 1;
  }
  return counts;
}

function scoreText(passCount, total, flagCount) {
  let line = `${passCount}/${total} sections`;
  if (flagCount > 0) {
    line += `, ${flagCount} red flag${flagCount === 1 ? "" : "s"}`;
  }
  return line;
}

function renderRow(result) {
  const kind = statusKind(result.status);
  const note = text(result.note);
  const body = note
    ? `<p style="${S.note}">${escapeHtml(note)}</p>`
    : `<p style="${S.note}">No note.</p>`;
  return `        <tr>
          <th scope="row" style="${S.row}">${escapeHtml(checkName(result))}</th>
          <td style="${S.td}" data-status="${kind}"><span style="${TAG[kind]}">${escapeHtml(statusLabel(result.status))}</span></td>
          <td style="${S.td}">
            <details>
              <summary style="${S.summary}">Note</summary>
              ${body}
            </details>
          </td>
        </tr>`;
}

function renderFlag(flag) {
  const name = text(flag.name).trim() || "Red flag";
  const quotes = Array.isArray(flag.quotes) ? flag.quotes : [];
  const chunks = [];
  for (const quote of quotes) {
    chunks.push(`    <blockquote style="${S.quote}">${escapeHtml(text(quote))}</blockquote>`);
  }
  if (text(flag.note)) {
    chunks.push(`    <p style="${S.note}">${escapeHtml(text(flag.note))}</p>`);
  }
  if (!chunks.length) {
    chunks.push(`    <p style="${S.note}">No quote captured.</p>`);
  }
  return `  <details style="${S.flag}">
    <summary style="${S.summary}">${escapeHtml(name)}</summary>
${chunks.join("\n")}
  </details>`;
}

function renderDocument(model) {
  const { results, flags, counts, verdict } = model;
  const score = scoreText(counts.pass, results.length, flags.length);
  const countCells = [
    ["Pass", counts.pass],
    ["Weak", counts.weak],
    ["Missing", counts.missing],
    ["Red flags", flags.length],
  ]
    .map(
      ([label, value]) => `    <div style="${S.count}">
      <dt style="${S.dt}">${label}</dt>
      <dd style="${S.dd}">${value}</dd>
    </div>`
    )
    .join("\n");
  const rows = results.map(renderRow).join("\n");
  const flagBlock = flags.length
    ? flags.map(renderFlag).join("\n")
    : `  <p style="${S.none}">No red flags.</p>`;
  const lines = [
    "<!DOCTYPE html>",
    `<html lang="en" style="${S.html}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    "<title>Pack Check report</title>",
    "</head>",
    `<body style="${S.body}">`,
    `<main style="${S.main}">`,
    `  <p style="${S.brand}">Pack Check</p>`,
    `  <h1 style="${S.h1}">Pack report</h1>`,
    `  <p style="${S.score}">${escapeHtml(score)}</p>`,
  ];
  if (verdict) lines.push(`  <p style="${S.verdict}">${escapeHtml(verdict)}</p>`);
  lines.push(
    `  <h2 style="${S.h2}">Summary</h2>`,
    `  <dl style="${S.counts}">`,
    countCells,
    "  </dl>",
    `  <h2 style="${S.h2}">Section checks</h2>`,
    `  <div style="${S.scroll}">`,
    `    <table style="${S.table}">`,
    "      <thead>",
    "        <tr>",
    `          <th scope="col" style="${S.th}">Check</th>`,
    `          <th scope="col" style="${S.th}">Result</th>`,
    `          <th scope="col" style="${S.th}">Detail</th>`,
    "        </tr>",
    "      </thead>",
    "      <tbody>",
    rows,
    "      </tbody>",
    "    </table>",
    "  </div>",
    `  <h2 style="${S.h2}">Red flags</h2>`,
    flagBlock,
    `  <p style="${S.foot}">Pack Check is a checklist, not a guarantee. It reads the words in a pack. It can't verify a track record.</p>`,
    "</main>",
    "</body>",
    "</html>",
    ""
  );
  return lines.join("\n");
}

export function formatHtmlReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new TypeError("formatHtmlReport expects a pack-check report object");
  }
  if (!Array.isArray(report.results)) {
    throw new TypeError("formatHtmlReport expects a report.results array");
  }
  const results = report.results.map((result, index) => {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new TypeError(`report.results[${index}] must be an object`);
    }
    return result;
  });
  const flags = Array.isArray(report.flags)
    ? report.flags.filter((flag) => flag && typeof flag === "object" && !Array.isArray(flag))
    : [];
  return renderDocument({
    results,
    flags,
    counts: tally(results),
    verdict: text(report.verdict).trim(),
  });
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

function readInput(file) {
  if (file) return fs.readFileSync(file, "utf8");
  return fs.readFileSync(0, "utf8");
}

function main() {
  const file = process.argv[2];
  if (!file && process.stdin.isTTY) {
    console.error("Usage: node html-report.js <report.json>");
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(readInput(file));
  } catch {
    console.error("Expected pack-check JSON.");
    process.exit(1);
  }
  try {
    process.stdout.write(formatHtmlReport(parsed));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (isDirectRun()) main();
