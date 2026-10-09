import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const coveragePath = path.join(root, "coverage/coverage-final.json");
const coverage = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
const key = Object.keys(coverage).find(
  (entry) => entry.endsWith("/app.js") && !entry.includes("node_modules")
);
if (!key) {
  console.error("No app.js coverage found in", coveragePath);
  process.exit(1);
}

const file = coverage[key];
const src = fs.readFileSync(path.join(root, "app.js"), "utf8").split("\n");
const start = src.findIndex((line) => line.includes("function checkTitle(")) + 1;
const end = src.findIndex((line) => line.includes("verdict: verdict")) + 1;
if (start < 1 || end < start) {
  console.error("Could not locate the validation engine in app.js");
  process.exit(1);
}

let covered = 0;
let total = 0;
const uncovered = [];
for (const [id, loc] of Object.entries(file.statementMap)) {
  const line = loc.start.line;
  if (line < start || line > end) continue;
  total += 1;
  if (file.s[id] > 0) covered += 1;
  else uncovered.push(line);
}

let branchHits = 0;
let branchTotal = 0;
for (const [id, counts] of Object.entries(file.b)) {
  const line = file.branchMap[id].loc.start.line;
  if (line < start || line > end) continue;
  for (const count of counts) {
    branchTotal += 1;
    if (count > 0) branchHits += 1;
  }
}

let overallHits = 0;
const overallTotal = Object.keys(file.s).length;
for (const count of Object.values(file.s)) {
  if (count > 0) overallHits += 1;
}

const corePct = total === 0 ? 0 : (covered / total) * 100;
const branchPct = branchTotal === 0 ? 0 : (branchHits / branchTotal) * 100;
const overallPct = overallTotal === 0 ? 0 : (overallHits / overallTotal) * 100;

console.log(
  `Core validation coverage (app.js lines ${start}-${end}): ${corePct.toFixed(2)}% (${covered}/${total} statements)`
);
console.log(
  `Core branch coverage: ${branchPct.toFixed(2)}% (${branchHits}/${branchTotal})`
);
console.log(
  `app.js statement coverage: ${overallPct.toFixed(2)}% (${overallHits}/${overallTotal})`
);
if (uncovered.length) {
  console.log(
    "Uncovered core lines:",
    [...new Set(uncovered)].sort((a, b) => a - b).join(", ")
  );
}

const CORE_MIN = 80;
if (corePct < CORE_MIN) {
  console.error(`Core coverage ${corePct.toFixed(2)}% is below ${CORE_MIN}%`);
  process.exit(1);
}
