/**
 * Node scripts (scripts/fidelity, scripts/*.mjs) bundle the engine with esbuild and
 * run it outside Vite: no import.meta.glob may be evaluated on that path, and the
 * learned models load from disk (F4 regression: the ischemia loader broke ~40 scripts).
 */
import { it, expect } from "vitest";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

it("el motor empaquetado con esbuild sintetiza en Node, incluida la isquemia aprendida", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ecg-bundle-")), out = path.join(dir, "engine.mjs");
  try {
    await build({
      stdin: { contents: `export { synthesize } from "./src/engine/signal.ts"; export { fromPreset, presetById } from "./src/presets/catalog.ts";`, resolveDir: process.cwd(), loader: "ts" },
      bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
    });
    const code = `const m = await import(${JSON.stringify("file://" + out)}); for (const id of ["anterior", "sinus"]) { const s = m.synthesize(m.fromPreset(m.presetById(id)), 4); if (!s.leads.V3.every(Number.isFinite)) throw new Error(id); } console.log("ok");`;
    const res = execFileSync(process.execPath, ["--input-type=module", "-e", code], { cwd: process.cwd(), env: { ...process.env, VITEST: "" }, encoding: "utf8" });
    expect(res.trim()).toBe("ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);
