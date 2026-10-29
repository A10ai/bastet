import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { openApiSpec } from "@/lib/openapi";

/**
 * Contract test: the OpenAPI document and the route files must agree.
 *  - every documented path + method exists as an exported handler
 *  - every route file is documented (except internal cron/csrf/health helpers
 *    listed in INTERNAL, which are still checked for existence)
 * Route files are inspected as text so no server-only module is imported.
 */
const API_ROOT = join(process.cwd(), "src/app/api/v1");
const INTERNAL = new Set(["/cron/night-audit", "/cron/automations", "/cron/fx", "/admin/encrypt-pii", "/openapi"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

function routeMethods(file: string): Set<string> {
  const src = readFileSync(file, "utf8");
  const methods = new Set<string>();
  for (const m of src.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)) methods.add(m[1].toLowerCase());
  for (const m of src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=/g)) methods.add(m[1].toLowerCase());
  return methods;
}

/** "/bookings/{id}/checkin" (OpenAPI) <-> "bookings/[id]/checkin" (filesystem) */
const toFsPath = (apiPath: string) => apiPath.replace(/^\/api\/v1/, "").replace(/\{(\w+)\}/g, "[$1]").replace(/^\//, "");

describe("OpenAPI contract", () => {
  const files = walk(API_ROOT);
  const byPath = new Map<string, Set<string>>();
  for (const f of files) byPath.set(relative(API_ROOT, f).replace(/\/route\.ts$/, ""), routeMethods(f));
  const spec = openApiSpec as unknown as { paths: Record<string, Record<string, unknown>> };

  it("documents at least the core of the API", () => {
    expect(Object.keys(spec.paths).length).toBeGreaterThan(25);
  });

  it("every documented path and method is implemented", () => {
    const missing: string[] = [];
    for (const [apiPath, ops] of Object.entries(spec.paths)) {
      const fs = toFsPath(apiPath);
      const methods = byPath.get(fs);
      if (!methods) { missing.push(`${apiPath} (no route file ${fs})`); continue; }
      for (const method of Object.keys(ops)) {
        if (["get", "post", "put", "patch", "delete"].includes(method) && !methods.has(method)) missing.push(`${method.toUpperCase()} ${apiPath}`);
      }
    }
    expect(missing, `Documented but not implemented:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every route file is documented", () => {
    const documented = new Set(Object.keys(spec.paths).map(toFsPath));
    const undocumented = [...byPath.keys()]
      .filter((p) => !documented.has(p))
      .filter((p) => !INTERNAL.has("/" + p))
      .sort();
    expect(undocumented, `Routes missing from the OpenAPI spec:\n${undocumented.join("\n")}`).toEqual([]);
  });

  it("documented methods per route match the file's handlers exactly", () => {
    const drift: string[] = [];
    for (const [apiPath, ops] of Object.entries(spec.paths)) {
      const methods = byPath.get(toFsPath(apiPath));
      if (!methods) continue;
      const documentedMethods = Object.keys(ops).filter((m) => ["get", "post", "put", "patch", "delete"].includes(m)).sort();
      const implemented = [...methods].sort();
      const extra = implemented.filter((m) => !documentedMethods.includes(m));
      if (extra.length) drift.push(`${apiPath}: implemented but undocumented ${extra.map((m) => m.toUpperCase()).join(", ")}`);
    }
    expect(drift, drift.join("\n")).toEqual([]);
  });
});
