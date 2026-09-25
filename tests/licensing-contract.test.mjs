import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const read = path => readFileSync(new URL("../" + path, import.meta.url));
const json = path => JSON.parse(read(path).toString());
const state = json("docs/licensing-status.json");
describe("Licensing status is explicit, not an inferred grant", () => {
  it("keeps npm and the root notice consistent with the pending owner decision", () => {
    expect(state.projectCode).toMatchObject({ status: "pending-owner-choice", licenseGrant: false, npmLicense: "UNLICENSED" });
    expect(json("package.json").license).toBe(state.projectCode.npmLicense);
    expect(json("package-lock.json").packages[""].license).toBe(state.projectCode.npmLicense);
    expect(read("LICENSE").toString()).toContain("NO es");
    expect(read("README.md").toString()).toContain("pendiente de elección del titular");
  });
  it("preserves the original LUDB license byte for byte and distinguishes reference rights", () => {
    const ludb = state.references.find(r => r.name === "LUDB");
    expect(createHash("sha256").update(read(ludb.licenseFile)).digest("hex")).toBe(ludb.licenseFileSha256);
    expect(ludb.license).toBe("ODC-By-1.0");
    expect(read(state.thirdPartyNotices).toString()).toContain("Open Data Commons Attribution License v1.0");
  });
  it("does not rewrite the user-provided clinical source to resolve licensing", () => {
    for (const source of state.preservedDocuments)
      expect(createHash("sha256").update(read(source.path)).digest("hex")).toBe(source.sha256);
  });
  it("provides a contributor path that keeps the three acceptance responsibilities separate", () => {
    const guide = read("CONTRIBUTING.md").toString();
    for (const term of ["npm ci", "npm run check", "Generador:", "Analizador:", "Representación:", "tolerancia", "referencia basal", "No regeneres todos los snapshots"])
      expect(guide).toContain(term);
  });
});
