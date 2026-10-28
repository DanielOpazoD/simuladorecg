import { afterEach, describe, expect, it, vi } from "vitest";
import { openDialog, closeDialog, requestDialog } from "../src/ui/dialog";

afterEach(() => vi.unstubAllGlobals());

describe("shared dialog", () => {
  it("sets the existing heading and close action before opening", () => {
    const content = { innerHTML: "" };
    const dialog = {
      addEventListener: vi.fn(),
      showModal: vi.fn(() => {
        expect(content.innerHTML).toContain("<h2>Medidas</h2>");
        expect(content.innerHTML).toContain('data-action="close-dialog"');
        expect(content.innerHTML).toContain("<p>Contenido</p>");
      }),
    };
    vi.stubGlobal("document", {
      querySelector: (selector: string) =>
        selector === "#dialog-content" ? content : dialog,
    });
    openDialog("Medidas", "<p>Contenido</p>");
    expect(dialog.showModal).toHaveBeenCalledOnce();
  });

  it("closes the same native dialog", () => {
    const dialog = { close: vi.fn(), addEventListener: vi.fn() };
    vi.stubGlobal("document", { querySelector: () => dialog });
    closeDialog();
    expect(dialog.close).toHaveBeenCalledOnce();
  });

  it("invalidates deferred work after another request, opening or closing", () => {
    const content = { innerHTML: "" };
    const dialog = Object.assign(new EventTarget(), { open: false, showModal() { this.open = true; }, close() { this.open = false; } });
    vi.stubGlobal("document", { querySelector: (s: string) => s === "#dialog-content" ? content : dialog });
    const first = requestDialog(), second = requestDialog();
    expect(first()).toBe(false); expect(second()).toBe(true);
    openDialog("Medidas", ""); expect(second()).toBe(false);
    const third = requestDialog();
    closeDialog(); expect(third()).toBe(false);
    const fourth = requestDialog();
    dialog.dispatchEvent(new Event("close")); expect(fourth()).toBe(false);
  });
});
