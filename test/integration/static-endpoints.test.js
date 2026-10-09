import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { once } from "node:events";
import { test } from "node:test";
import { repoRoot } from "../helpers/load-app.js";

/**
 * Pack Check is a static page: these are the HTTP endpoints a host actually
 * serves. There is no JSON API.
 */
function startServer(root) {
  const server = http.createServer((req, res) => {
    const raw = req.url.split("?")[0];
    let pathname;
    try {
      pathname = decodeURIComponent(raw);
    } catch {
      res.writeHead(400);
      res.end("bad request");
      return;
    }
    if (pathname.includes("\0") || pathname.split("/").includes("..")) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const abs = path.resolve(root, rel);
    const rootResolved = path.resolve(root);
    if (abs !== rootResolved && !abs.startsWith(`${rootResolved}${path.sep}`)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
    };
    res.writeHead(200, {
      "content-type": types[path.extname(abs)] || "application/octet-stream",
    });
    fs.createReadStream(abs).pipe(res);
  });
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => server);
}

function get(server, urlPath) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: urlPath }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode, type: res.headers["content-type"] || "", body });
      });
    });
    req.on("error", reject);
  });
}

test("static endpoints serve the page, checker, and stylesheet", async () => {
  const server = await startServer(repoRoot());
  try {
    const page = await get(server, "/");
    assert.equal(page.status, 200);
    assert.match(page.type, /text\/html/);
    assert.match(page.body, /id="pack-in"/);
    assert.match(page.body, /Pack Check/);
    assert.match(page.body, /src="app\.js"/);

    const direct = await get(server, "/index.html");
    assert.equal(direct.status, 200);
    assert.match(direct.body, /id="check-btn"/);

    const script = await get(server, "/app.js");
    assert.equal(script.status, 200);
    assert.match(script.type, /javascript/);
    assert.match(script.body, /function checkTitle/);
    assert.match(script.body, /window\.__packCheck/);

    const css = await get(server, "/style.css");
    assert.equal(css.status, 200);
    assert.match(css.type, /text\/css/);
    assert.match(css.body, /\{/);

    const missing = await get(server, "/no-such-file");
    assert.equal(missing.status, 404);

    const traversal = await get(server, "/../package.json");
    assert.equal(traversal.status, 403);
    const encoded = await get(server, "/%2e%2e%2fpackage.json");
    assert.equal(encoded.status, 403);
  } finally {
    server.close();
  }
});
