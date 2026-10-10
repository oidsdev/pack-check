/* Print an HTML report for a fixture. Defaults to the martingale pack. */
import { formatHtmlReport } from "../html-report.js";
import { loadApp, loadFixture } from "../test/helpers/load-app.js";

const fixture = process.argv[2] || "martingale.md";
const { api } = loadApp();
const text = loadFixture(fixture).replace(/\n$/, "");
const report = JSON.parse(JSON.stringify(api.analyze(text)));
process.stdout.write(formatHtmlReport(report));
