import { describe, expect, it, vi } from "vitest";
import { PRESETS, presetById } from "../src/presets/catalog";
import { catalogView, VariantNavigation } from "../src/ui/catalog-view";

describe("catalog presentation", () => {
  it("keeps all collapsed entries and disables only the five pending examples", () => {
    const before = JSON.stringify(PRESETS);
    const view = catalogView(PRESETS);
    expect(view.count).toBe("42 patrones · 63 ejemplos");
    // 47 entries plus three imitators also shown under «Imitadores».
    expect(view.html.match(/data-diagnosis=/g)).toHaveLength(50);
    expect(view.html.match(/<small class="case-variants-count">También en /g)).toHaveLength(3);
    expect(view.html).toContain("En las guías: STEMI");
    expect(view.html.match(/ disabled /g)).toHaveLength(5);
    expect(view.clearFiltersVisible).toBe(false);
    expect(JSON.stringify(PRESETS)).toBe(before);
  });

  it("retains the selected variant when unfiltered", () => {
    const view = catalogView(PRESETS, "", "", "af_slow");
    expect(view.html).toContain('data-preset="af_slow"');
    expect(view.html.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it("shows the exact match and singular counts instead of the active sibling", () => {
    const view = catalogView(PRESETS, "FA lenta", "", "af");
    expect(view.count).toBe("1 patrón · 1 ejemplo");
    expect(view.html).toContain('data-preset="af_slow"');
    expect(view.html).toContain("Coincide: Respuesta lenta");
    expect(view.clearFiltersVisible).toBe(true);
  });

  it("preserves family filtering, empty messaging and the clear action state", () => {
    expect(catalogView(PRESETS, "", "Conducción intraventricular").clearFiltersVisible).toBe(true);
    const empty = catalogView(PRESETS, "no-existe");
    expect(empty.count).toBe("0 patrones · 0 ejemplos");
    expect(empty.html).toContain("No encontramos ese patrón");
    expect(empty.html).not.toContain("data-preset=");
  });

  it("escapes labels, names and identifiers supplied to the renderer", () => {
    const preset = { ...PRESETS[0], id: 'future"<>', name: '<script>"&', short: '<script>"&', group: '<img src=x>' };
    const html = catalogView([preset]).html;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain('data-preset="future&quot;&lt;&gt;"');
    expect(html).toContain('&lt;script&gt;&quot;&amp;');
  });
});

function navigationFixture() {
  let html = "";
  const navigation = {
    hidden: false,
    get innerHTML() { return html; },
    set innerHTML(value: string) { html = value; },
  };
  const setHtml = vi.spyOn(navigation, "innerHTML", "set");
  const attributes: Record<string, string> = {};
  const content = {
    setAttribute: (key: string, value: string) => { attributes[key] = value; },
    removeAttribute: (key: string) => { delete attributes[key]; },
  };
  const view = new VariantNavigation(navigation as unknown as HTMLElement, content as unknown as HTMLElement);
  return { view, navigation, setHtml, attributes };
}

describe("variant navigation", () => {
  it("keeps manual activation and a single selected, focusable tab", () => {
    const { view, navigation, attributes } = navigationFixture();
    view.update(presetById("af_slow"), false, false);
    expect(navigation.hidden).toBe(false);
    expect(navigation.innerHTML.match(/role="tab"/g)).toHaveLength(3);
    expect(navigation.innerHTML.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(navigation.innerHTML.match(/tabindex="0"/g)).toHaveLength(1);
    expect(navigation.innerHTML).toContain('data-activation="manual"');
    expect(attributes).toEqual({ role: "tabpanel", "aria-labelledby": "variant-tab-af_slow" });
  });

  it("does not replace tab nodes when selection is unchanged, preserving focus", () => {
    const { view, setHtml, attributes } = navigationFixture();
    view.update(presetById("af"), false, false);
    view.update(presetById("af"), false, false);
    expect(setHtml).toHaveBeenCalledOnce();
    view.update(presetById("af_slow"), false, false);
    expect(setHtml).toHaveBeenCalledTimes(2);
    expect(attributes["aria-labelledby"]).toBe("variant-tab-af_slow");
  });

  it.each([
    ["concealed", presetById("af"), true, false],
    ["reversed acquisition", presetById("af"), false, true],
    ["single variant", presetById("lbbb"), false, false],
    ["custom case", undefined, false, false],
  ] as const)("removes navigation and panel attributes for %s, then restores them", (_label, preset, concealed, reversed) => {
    const { view, navigation, attributes } = navigationFixture();
    view.update(presetById("af"), false, false);
    view.update(preset, concealed, reversed);
    expect(navigation).toEqual({ hidden: true, innerHTML: "" });
    expect(attributes).toEqual({});
    view.update(presetById("af"), false, false);
    expect(navigation.hidden).toBe(false);
    expect(attributes.role).toBe("tabpanel");
  });
});
