import { afterEach, describe, expect, it, vi } from "vitest";
import { openDialog, closeDialog } from "../src/ui/dialog";

afterEach(() => vi.unstubAllGlobals());

describe("shared dialog", () => {
  it("sets the existing heading and close action before opening", () => {
    const content = { innerHTML: "" };
    const dialog = {
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
    const dialog = { close: vi.fn() };
    vi.stubGlobal("document", { querySelector: () => dialog });
    closeDialog();
    expect(dialog.close).toHaveBeenCalledOnce();
  });
});
