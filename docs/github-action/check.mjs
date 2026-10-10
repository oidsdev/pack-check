/**
 * Check prompt-pack markdown with the in-page analyzer.
 *
 * app.js is an IIFE that needs the page DOM, same as test/helpers/load-app.js.
 * This runner reads window.__packCheck and does not modify app.js.
 *
 * Exit 0: no critical findings (weak sections are allowed).
 * Exit 1: a missing section, a red flag, a stub under 50 characters,
 *         or the checker failed to load.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const MIN_CHARS = 50;
const SKIP_DIRS = new Set(["node_modules", ".git", "coverage"]);

const packRoot = path.resolve(import.meta.dirname, "../..");

function loadApi() {
  const html = fs
    .readFileSync(path.join(packRoot, "index.html"), "utf8")
    .replace('<script src="app.js"></script>', "");
  const dom = new JSDOM(html, {
    url: "https://pack-check.test/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  dom.window.scrollTo = () => {};
  const code = fs.readFileSync(path.join(packRoot, "app.js"), "utf8");
  const script = new vm.Script(code, { filename: path.join(packRoot, "app.js") });
  script.runInContext(dom.getInternalVMContext());
  const api = dom.window.__packCheck;
  if (!api || typeof api.analyze !== "function") {
    throw new Error("window.__packCheck.analyze is missing");
  }
  return api;
}

function plainReport(report) {
  return {
    passes: report.passes,
    verdict: String(report.verdict),
    results: [...report.results].map((result) => ({
      name: String(result.name),
      status: String(result.status),
      note: String(result.note),
    })),
    flags: [...report.flags].map((flag) => ({
      name: String(flag.name),
      quotes: [...flag.quotes].map((quote) => String(quote)),
      note: flag.note ? String(flag.note) : "",
    })),
  };
}

function scoreLine(report) {
  let score = `${report.passes}/7 sections`;
  if (report.flags.length) {
    score += `, ${report.flags.length} red flag${report.flags.length === 1 ? "" : "s"}`;
  }
  return score;
}

function isCritical(report) {
  if (report.flags.length > 0) return true;
  return report.results.some((result) => result.status === "missing");
}

function displayPath(file) {
  const base = process.env.GITHUB_WORKSPACE || process.cwd();
  const relative = path.relative(base, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return file.split(path.sep).join("/");
  }
  return relative.split(path.sep).join("/");
}

function cell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function annotate(level, file, message) {
  if (!process.env.GITHUB_ACTIONS) return;
  const text = String(message).replace(/\r?\n/g, " ");
  const loc = file ? ` file=${file}` : "";
  console.log(`::${level}${loc}::${text}`);
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.join(dir, entry.name));
    }
  }
}

function collectTargets() {
  const args = process.argv.slice(2);
  if (args.length > 0) return { targets: args, missingIsCritical: true };
  if (process.env.PACK_DIR && process.env.PACK_DIR.trim()) {
    return { targets: [process.env.PACK_DIR.trim()], missingIsCritical: false };
  }
  return { targets: ["packs"], missingIsCritical: false };
}

function collect(targets) {
  const files = [];
  const absent = [];
  for (const target of targets) {
    const abs = path.resolve(process.cwd(), target);
    if (!fs.existsSync(abs)) {
      absent.push(abs);
      continue;
    }
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) walk(abs, files);
    else if (stat.isFile()) files.push(abs);
  }
  files.sort((a, b) => a.localeCompare(b));
  return { files, absent };
}

function formatFile(file) {
  const mark = { pass: "x", weak: "~", missing: " " };
  const lines = [`## ${file.label}`, ""];
  if (file.error) {
    lines.push(`Result: fail`, "", file.error, "");
    return lines.join("\n");
  }
  const report = file.report;
  lines.push(`Score: ${scoreLine(report)}`);
  lines.push(`Verdict: ${report.verdict}`);
  lines.push(`Result: ${file.critical ? "fail" : "pass"}`);
  lines.push("", "## Section checks", "");
  for (const result of report.results) {
    lines.push(`- [${mark[result.status] || " "}] ${result.name} \u2014 ${result.note}`);
  }
  lines.push("", "## Red flags", "");
  if (!report.flags.length) lines.push("None.");
  for (const flag of report.flags) {
    let line = `- ${flag.name}`;
    if (flag.quotes.length) {
      line += `: ${flag.quotes.map((quote) => `"${quote}"`).join("; ")}`;
    }
    if (flag.note) line += ` (${flag.note})`;
    lines.push(line);
  }
  lines.push("");
  return lines.join("\n");
}

function buildMarkdown({ looked, absent, missingIsCritical, checked }) {
  const failed = checked.filter((file) => file.critical).length;
  const lines = ["# Pack Check report", ""];

  if (!checked.length && !absent.length) {
    lines.push(`No markdown files under \`${looked}\`.`);
    lines.push("");
    return lines.join("\n");
  }

  if (!checked.length && absent.length && !missingIsCritical) {
    lines.push(`No markdown files under \`${looked}\`.`);
    if (absent.length) lines.push("", "Directory not found. Nothing to check.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(
    `${checked.length} file${checked.length === 1 ? "" : "s"} checked. ${failed} failed.`
  );
  lines.push("");
  lines.push("| File | Score | Result |");
  lines.push("| --- | --- | --- |");
  for (const file of checked) {
    const score = file.report ? scoreLine(file.report) : "n/a";
    lines.push(`| ${cell(file.label)} | ${cell(score)} | ${file.critical ? "fail" : "pass"} |`);
  }
  lines.push("");
  for (const file of checked) lines.push(formatFile(file));
  return lines.join("\n");
}

function writeReport(markdown) {
  const reportPath = process.env.REPORT_PATH
    ? path.resolve(process.cwd(), process.env.REPORT_PATH)
    : path.resolve(process.cwd(), "pack-check-report.md");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, markdown);
  return reportPath;
}

function checkFile(api, file) {
  const label = displayPath(file);
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    annotate("error", label, err.message);
    return { label, critical: true, error: `Could not read file: ${err.message}` };
  }
  if (text.trim().length < MIN_CHARS) {
    const error = `Too short to check (under ${MIN_CHARS} characters).`;
    annotate("error", label, error);
    return { label, critical: true, error };
  }
  const report = plainReport(api.analyze(text));
  const critical = isCritical(report);
  for (const result of report.results) {
    if (result.status === "missing") annotate("error", label, `${result.name}: ${result.note}`);
    if (result.status === "weak") annotate("warning", label, `${result.name}: ${result.note}`);
  }
  for (const flag of report.flags) annotate("error", label, flag.name);
  return { label, critical, report };
}

function main() {
  const { targets, missingIsCritical } = collectTargets();
  const looked = targets.join(", ");
  let api;
  try {
    api = loadApi();
  } catch (err) {
    const markdown = `# Pack Check report\n\nCould not load the checker: ${err.message}\n`;
    writeReport(markdown);
    console.error(err);
    process.exit(1);
  }

  const { files, absent } = collect(targets);
  const checked = [];
  for (const abs of absent) {
    if (!missingIsCritical) continue;
    const label = displayPath(abs);
    const error = "Path not found.";
    annotate("error", label, error);
    checked.push({ label, critical: true, error });
  }
  for (const file of files) checked.push(checkFile(api, file));

  const markdown = buildMarkdown({ looked, absent, missingIsCritical, checked });
  const reportPath = writeReport(markdown);
  const failed = checked.filter((file) => file.critical).length;
  console.log(`${checked.length} checked, ${failed} failed. Report: ${reportPath}`);
  if (failed > 0) process.exit(1);
}

main();
