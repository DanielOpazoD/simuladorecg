import { describe, expect, it } from "vitest";
import { DEFAULT_CASE, cloneCase } from "../src/engine/types";
import { exportDialogHtml } from "../src/ui/export-dialog";

describe("export dialog content", () => {
  it("only disables PNG while the trace is unavailable", () => {
    const html = exportDialogHtml(DEFAULT_CASE, false, []);
    expect(html).toContain('data-action="png" disabled');
    for (const action of ["json", "import", "share"])
      expect(html).toContain(`data-action="${action}">`);
    expect(exportDialogHtml(DEFAULT_CASE, true, [])).toContain('data-action="png" >');
  });

  it("escapes current and saved case names without losing their indices", () => {
    const c = cloneCase(DEFAULT_CASE);
    c.name = 'Caso "<script>"';
    const saved = [cloneCase(c), cloneCase(c)];
    const html = exportDialogHtml(c, true, saved);
    expect(html).toContain('value="Caso &quot;&lt;script&gt;&quot;"');
    expect(html).not.toContain("<script>");
    for (const index of [0, 1])
      expect(html).toContain(`data-saved="${index}">Caso &quot;&lt;script&gt;&quot;`);
  });

  it("omits the saved section when storage is empty", () => {
    expect(exportDialogHtml(DEFAULT_CASE, true, [])).not.toContain("Mis casos");
  });
});
it('shows an escaped storage warning next to the save workflow',()=>{
  const html=exportDialogHtml(DEFAULT_CASE,true,[],'Error <unsafe>');
  expect(html).toContain('role="status">Error &lt;unsafe&gt;');expect(html).toContain('Hasta 30 casos');
});
