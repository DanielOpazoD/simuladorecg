import { describe, expect, it, vi } from "vitest";
import { WorkspaceNavigation } from "../src/ui/workspace-navigation";

function fixture() {
  const catalog = {
    classList: { toggle: vi.fn(), remove: vi.fn() } as unknown as DOMTokenList,
  };
  const inspector = { scrollIntoView: vi.fn(), focus: vi.fn() };
  const actions = {
    about: vi.fn(),
    measurements: vi.fn(),
    export: vi.fn(),
    "close-dialog": vi.fn(),
  };
  return { catalog, inspector, actions, navigation: new WorkspaceNavigation(catalog, inspector, actions) };
}

describe("workspace navigation", () => {
  it("scrolls to parameters before moving focus without scrolling again", () => {
    const { inspector, navigation } = fixture();
    expect(navigation.handle("parameters", false)).toBe(true);
    expect(inspector.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start" });
    expect(inspector.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(inspector.scrollIntoView.mock.invocationCallOrder[0]).toBeLessThan(inspector.focus.mock.invocationCallOrder[0]);
  });

  it("blocks parameters while practice conceals the case", () => {
    const action = "parameters";
    const { inspector, actions, navigation } = fixture();
    expect(navigation.handle(action, true)).toBe(true);
    expect(inspector.scrollIntoView).not.toHaveBeenCalled();
    expect(inspector.focus).not.toHaveBeenCalled();
    for (const callback of Object.values(actions)) expect(callback).not.toHaveBeenCalled();
    expect(navigation.handle(action, false)).toBe(true);
    expect(inspector.focus).toHaveBeenCalledOnce();
  });

  it("withholds the measurements dialog until the practice answer", () => {
    const { actions, navigation } = fixture();
    expect(navigation.handle("measurements", true)).toBe(true);
    expect(actions.measurements).not.toHaveBeenCalled();
    expect(navigation.handle("measurements", false)).toBe(true);
    expect(actions.measurements).toHaveBeenCalledOnce();
  });

  it.each(["about", "export", "close-dialog"] as const)("keeps %s available during practice", action => {
    const { actions, navigation } = fixture();
    expect(navigation.handle(action, true)).toBe(true);
    for (const [name, callback] of Object.entries(actions))
      expect(callback).toHaveBeenCalledTimes(name === action ? 1 : 0);
  });

  it.each([true, false])("keeps catalog toggle and close available (concealed: %s)", concealed => {
    const { catalog, actions, navigation } = fixture();
    expect(navigation.handle("catalog", concealed)).toBe(true);
    expect(catalog.classList.toggle).toHaveBeenCalledExactlyOnceWith("open");
    expect(navigation.handle("close-catalog", concealed)).toBe(true);
    expect(catalog.classList.remove).toHaveBeenCalledExactlyOnceWith("open");
    for (const callback of Object.values(actions)) expect(callback).not.toHaveBeenCalled();
  });

  it.each(["activation", "compare", "external", "focus", "theme", "quiz", "end-quiz", "json", "png", "import", "share", "save", "unknown", "toString"])("leaves %s to its existing controller", action => {
    const { catalog, inspector, actions, navigation } = fixture();
    for (const concealed of [false, true]) expect(navigation.handle(action, concealed)).toBe(false);
    expect(catalog.classList.toggle).not.toHaveBeenCalled();
    expect(catalog.classList.remove).not.toHaveBeenCalled();
    expect(inspector.scrollIntoView).not.toHaveBeenCalled();
    expect(inspector.focus).not.toHaveBeenCalled();
    for (const callback of Object.values(actions)) expect(callback).not.toHaveBeenCalled();
  });
});
