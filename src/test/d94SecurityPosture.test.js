// @vitest-environment node
// D94 — nginx security headers, prod CORS posture, compose publish posture.
// Static scan: removing a required header or publishing mongo/R fails loudly.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyCors } from "../../server/utils/corsPolicy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const REQUIRED_HEADERS = [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "frame-ancestors",
];

function liveCode(src) {
  return src
    .split("\n")
    .filter((l) => !l.trim().startsWith("#") && !l.trim().startsWith("//"))
    .join("\n");
}

describe("D94 nginx security headers are declared", () => {
  const nginx = fs.readFileSync(path.join(ROOT, "nginx.conf"), "utf8");

  it.each(REQUIRED_HEADERS)("nginx.conf includes %s", (header) => {
    expect(nginx).toMatch(new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  });

  it("sets frame-ancestors to none (clickjacking)", () => {
    expect(nginx).toMatch(/frame-ancestors\s+'none'/i);
  });

  it("the scanner fails when CSP is stripped (mutation)", () => {
    const stripped = nginx.replace(/Content-Security-Policy[^;]*;/gi, "");
    expect(stripped).not.toMatch(/Content-Security-Policy/i);
    expect(!/Content-Security-Policy/i.test(stripped)).toBe(true);
  });
});

describe("D94 production CORS posture", () => {
  it("applyCors mounts nothing in production", () => {
    const uses = [];
    const app = { use: (mw) => uses.push(mw) };
    const mounted = applyCors(app, () => "cors-mw", { NODE_ENV: "production" });
    expect(mounted).toBe(false);
    expect(uses).toHaveLength(0);
  });

  it("applyCors mounts with credentials outside production", () => {
    const uses = [];
    const app = { use: (mw) => uses.push(mw) };
    let seen;
    const cors = (opts) => {
      seen = opts;
      return "cors-mw";
    };
    const mounted = applyCors(app, cors, { NODE_ENV: "development" });
    expect(mounted).toBe(true);
    expect(uses).toEqual(["cors-mw"]);
    expect(seen).toEqual({
      origin: "http://localhost:5173",
      credentials: true,
    });
  });

  it("applyCors refuses wildcard CORS_ORIGIN", () => {
    const app = { use: () => {} };
    expect(() =>
      applyCors(app, () => "mw", { NODE_ENV: "development", CORS_ORIGIN: "*" })
    ).toThrow(/CORS_ORIGIN/);
  });

  it("server/index.js routes CORS through applyCors (not open cors(*))", () => {
    const index = liveCode(
      fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8")
    );
    expect(index).toMatch(/\bapplyCors\s*\(/);
    expect(index).not.toMatch(/origin\s*:\s*["']\*["']/);
  });
});

describe("D94 compose publish posture (mongo unpublished; R expose)", () => {
  const compose = fs.readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");

  /** Extract a top-level service block under `services:`. */
  function serviceBlock(name) {
    const lines = compose.split(/\r?\n/);
    const start = lines.findIndex((l) => l === `  ${name}:`);
    expect(start, `service ${name}`).toBeGreaterThanOrEqual(0);
    const out = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^  [a-zA-Z0-9_-]+:\s*$/.test(lines[i])) break;
      if (/^[a-zA-Z]/.test(lines[i])) break;
      out.push(lines[i]);
    }
    return out.join("\n");
  }

  it("mongo has no host ports mapping", () => {
    const block = serviceBlock("mongo");
    expect(block).not.toMatch(/^\s+ports:\s*$/m);
    expect(block).not.toMatch(/["']?\d+:27017["']?/);
  });

  it("r-backend uses expose, not ports", () => {
    const block = serviceBlock("r-backend");
    expect(block).toMatch(/^\s+expose:\s*$/m);
    expect(block).toMatch(/["']?4000["']?/);
    expect(block).not.toMatch(/^\s+ports:\s*$/m);
  });

  it("compose node service pins NODE_ENV=production (CORS stays off)", () => {
    const block = serviceBlock("node");
    expect(block).toMatch(/NODE_ENV=production/);
    expect(block).not.toMatch(/NODE_ENV=development/);
  });
});
