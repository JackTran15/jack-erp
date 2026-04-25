/**
 * Fetches OpenAPI JSON from a running ERP API (GET /docs-json) and regenerates
 * `src/generated/schema.ts`. If the server is unreachable, falls back to
 * `openapi-stub.json` so CI and fresh clones can still build.
 *
 * Env: OPENAPI_URL (default http://127.0.0.1:4000/docs-json)
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");
const outSchema = join(pkgRoot, "src/generated/schema.ts");
const stubPath = join(pkgRoot, "openapi-stub.json");
const snapshotPath = join(pkgRoot, "openapi.snapshot.json");

const url = process.env.OPENAPI_URL ?? "http://127.0.0.1:4000/docs-json";

mkdirSync(dirname(outSchema), { recursive: true });

let inputPath = stubPath;

try {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  writeFileSync(snapshotPath, `${JSON.stringify(json, null, 2)}\n`);
  inputPath = snapshotPath;
  console.log(`[openapi] Wrote ${snapshotPath} from ${url}`);
} catch (e) {
  console.warn(
    `[openapi] Live fetch from ${url} failed (${String(e)}). Using stub ${stubPath}.`,
  );
}

execSync(`pnpm exec openapi-typescript "${inputPath}" -o "${outSchema}"`, {
  stdio: "inherit",
  cwd: pkgRoot,
});
