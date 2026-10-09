import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const root = path.resolve(import.meta.dirname, "../..");

export function repoRoot() {
  return root;
}

export function loadFixture(name) {
  return fs.readFileSync(path.join(root, "test/fixtures", name), "utf8");
}

/**
 * Boot the real page and app.js. The checker is an IIFE, so tests reach it
 * through the read-only window.__packCheck hook. app.js itself is not edited.
 */
export function loadApp() {
  const html = fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .replace('<script src="app.js"></script>', "");
  const dom = new JSDOM(html, {
    url: "https://pack-check.test/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  dom.window.scrollTo = () => {};
  const code = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const script = new vm.Script(code, { filename: path.join(root, "app.js") });
  script.runInContext(dom.getInternalVMContext());
  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    api: dom.window.__packCheck,
  };
}

export function checkById(api, id) {
  const check = api.checks.find((item) => item.id === id);
  if (!check) throw new Error(`Unknown check: ${id}`);
  // Copy out of the page realm so assertions compare ordinary objects.
  return (text) => {
    const result = check.run(text);
    return { status: result.status, note: result.note };
  };
}

export function flagNamed(report, name) {
  return report.flags.find((flag) => flag.name === name);
}
