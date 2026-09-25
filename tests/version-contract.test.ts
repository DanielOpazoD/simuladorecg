import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import pkg from "../package.json";
import lock from "../package-lock.json";
import { APP_VERSION } from "../src/ui/version";

it("uses the product version in UI and lockfile, not case schema", () => {
  expect(APP_VERSION).toBe(pkg.version);
  expect(lock.version).toBe(pkg.version);
  expect(lock.packages[""].version).toBe(pkg.version);
  const main = readFileSync("src/main.ts", "utf8");
  expect(main).toContain('data-product-version="${APP_VERSION}"');
  expect(main).not.toMatch(/Modelo educativo · v\d/);
});
it("documents the current version without declaring a deployment", () => {
  const readme = readFileSync("README.md", "utf8");
  expect(readme).toContain(`# ECG Lab — v${APP_VERSION}`);
  expect(readme).toContain("no acredita el despliegue");
  expect(readme).not.toContain("Es un candidato en PR");
});
