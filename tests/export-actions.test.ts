import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CASE, cloneCase } from "../src/engine/types";
import { synthesize } from "../src/engine/signal";
import { handleExportAction, type ExportContext } from "../src/ui/export-actions";
import { download, encodeCase, pngWithDpi, saveCase } from "../src/ui/persistence";
import { renderPaper } from "../src/render/ecg";
import { openDialog } from "../src/ui/dialog";

vi.mock("../src/ui/persistence", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/ui/persistence")>(),
  download: vi.fn(),
  saveCase: vi.fn(),
  pngWithDpi: vi.fn(async (blob: Blob) => blob),
}));
vi.mock("../src/render/ecg", () => ({ renderPaper: vi.fn() }));
vi.mock("../src/ui/dialog", () => ({ openDialog: vi.fn() }));

let context: ExportContext;
let nameInput: { value: string };
let fileInput: { click: ReturnType<typeof vi.fn> };
let canvas: { toBlob: ReturnType<typeof vi.fn> };
let clipboard: { writeText: ReturnType<typeof vi.fn> };
const png = new Blob(["png"], { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveCase).mockReset();
  context = {
    c: cloneCase(DEFAULT_CASE),
    signal: null,
    canExport: false,
    hideName: false,
    toast: vi.fn(),
    refreshDialog: vi.fn(),
  };
  nameInput = { value: "  Mi caso  " };
  fileInput = { click: vi.fn() };
  canvas = { toBlob: vi.fn((callback: BlobCallback) => callback(png)) };
  clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal("document", {
    querySelector: (selector: string) =>
      selector === "#save-name" ? nameInput : fileInput,
    createElement: () => canvas,
  });
  vi.stubGlobal("location", { origin: "https://example.test", pathname: "/ecg/" });
  vi.stubGlobal("navigator", { clipboard });
});
afterEach(() => vi.unstubAllGlobals());

describe("export action dispatch", () => {
  it("ignores actions belonging to other UI features", async () => {
    expect(await handleExportAction("theme", context)).toBe(false);
    expect(download).not.toHaveBeenCalled();
    expect(context.toast).not.toHaveBeenCalled();
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });

  it("exports the complete current case as JSON even without a signal", async () => {
    expect(await handleExportAction("json", context)).toBe(true);
    const [blob, filename] = vi.mocked(download).mock.calls[0];
    expect(filename).toBe("ecg-lab-caso.json");
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text())).toEqual(context.c);
    expect(context.toast).toHaveBeenCalledWith("Caso JSON exportado");
  });

  it("opens the existing file input", async () => {
    expect(await handleExportAction("import", context)).toBe(true);
    expect(fileInput.click).toHaveBeenCalledOnce();
  });

  it("copies a reproducible link", async () => {
    await handleExportAction("share", context);
    expect(clipboard.writeText).toHaveBeenCalledWith(
      "https://example.test/ecg/" + encodeCase(context.c),
    );
    expect(context.toast).toHaveBeenCalledWith("Enlace del caso copiado");
    expect(openDialog).not.toHaveBeenCalled();
  });

  it.each(["rejected", "unavailable"])("offers an escaped link when clipboard is %s", async (state) => {
    if (state === "rejected") clipboard.writeText.mockRejectedValue(new Error("denied"));
    else vi.stubGlobal("navigator", {});
    vi.stubGlobal("location", { origin: "https://example.test", pathname: '/ecg/<"&>/' });
    await handleExportAction("share", context);
    const [title, body] = vi.mocked(openDialog).mock.calls[0];
    expect(title).toBe("Enlace del caso");
    expect(body).toContain('/ecg/&lt;&quot;&amp;&gt;/#case=');
    expect(body).toContain('<textarea readonly rows="5">');
    expect(context.toast).not.toHaveBeenCalled();
  });

  it("saves a renamed clone and refreshes the dialog, not the active case", async () => {
    const original = cloneCase(context.c);
    await handleExportAction("save", context);
    expect(saveCase).toHaveBeenCalledWith({ ...original, name: "Mi caso" });
    const copy = vi.mocked(saveCase).mock.calls[0][0];
    expect(copy).not.toBe(context.c);
    expect(copy.view).not.toBe(context.c.view);
    expect(context.c).toEqual(original);
    expect(context.refreshDialog).toHaveBeenCalledOnce();
    expect(context.toast).toHaveBeenCalledWith("Caso guardado en este navegador");
  });

  it("rejects an empty name without touching storage", async () => {
    nameInput.value = "  ";
    await handleExportAction("save", context);
    expect(saveCase).not.toHaveBeenCalled();
    expect(context.refreshDialog).not.toHaveBeenCalled();
    expect(context.toast).toHaveBeenCalledWith("Escribe un nombre para el caso");
  });

  it("preserves the JSON fallback on storage failure", async () => {
    vi.mocked(saveCase).mockImplementation(() => { throw new Error("quota"); });
    await handleExportAction("save", context);
    expect(context.refreshDialog).not.toHaveBeenCalled();
    expect(context.toast).toHaveBeenCalledWith("No se pudo guardar. Exporta el caso como JSON.");
  });

  it("blocks PNG without a valid exportable signal", async () => {
    await handleExportAction("png", context);
    context.signal = synthesize(context.c);
    await handleExportAction("png", context);
    context.signal = null;
    context.canExport = true;
    await handleExportAction("png", context);
    expect(renderPaper).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(context.toast).toHaveBeenCalledTimes(3);
  });

  it("prints a paper clone at 300 dpi and preserves practice concealment", async () => {
    context.c.view.palette = "dark";
    const original = cloneCase(context.c);
    context.signal = synthesize(context.c);
    context.canExport = true;
    context.hideName = true;
    await handleExportAction("png", context);
    expect(renderPaper).toHaveBeenCalledWith(
      canvas, context.signal, { ...original, view: { ...original.view, palette: "paper" } },
      1000, expect.objectContaining({ pxPerMm: 300 / 25.4, ratio: 1, hideName: true }),
    );
    expect(context.c).toEqual(original);
    expect(pngWithDpi).toHaveBeenCalledWith(png, 300);
    expect(download).toHaveBeenCalledWith(png, "ecg-lab-300dpi.png");
    expect(context.toast).toHaveBeenCalledWith("PNG exportado a 300 dpi");
  });

  it("does not claim a PNG was downloaded if the canvas returned no blob", async () => {
    canvas.toBlob.mockImplementation((callback: BlobCallback) => callback(null));
    context.signal = synthesize(context.c);
    context.canExport = true;
    await handleExportAction("png", context);
    expect(download).not.toHaveBeenCalled();
    expect(context.toast).toHaveBeenCalledWith(expect.stringMatching(/No se pudo exportar/));
  });
});

it('waits for PNG encoding and reports a failed encoder visibly', async () => {
  context.signal=synthesize(context.c,10);context.canExport=true;
  let callback: BlobCallback | undefined;
  canvas.toBlob.mockImplementation((cb:BlobCallback)=>{callback=cb;});
  let finished=false;
  const promise=handleExportAction('png',context).then(()=>{finished=true;});
  await Promise.resolve();
  expect(finished).toBe(false);
  callback!(null);await promise;
  expect(download).not.toHaveBeenCalled();
  expect(context.toast).toHaveBeenCalledWith(expect.stringMatching(/No se pudo/));
});

it('contains DPI metadata failure without an unhandled rejection or success toast', async () => {
  context.signal=synthesize(context.c,10);context.canExport=true;
  vi.mocked(pngWithDpi).mockRejectedValueOnce(new Error('metadata failed'));
  await expect(handleExportAction('png',context)).resolves.toBe(true);
  expect(download).not.toHaveBeenCalled();
  expect(context.toast).toHaveBeenCalledWith(expect.stringMatching(/No se pudo exportar/));
});
it('contains canvas rendering failure without claiming export', async () => {
  context.signal=synthesize(context.c,10);context.canExport=true;
  vi.mocked(renderPaper).mockImplementationOnce(()=>{throw new Error('canvas unavailable');});
  await expect(handleExportAction('png',context)).resolves.toBe(true);
  expect(download).not.toHaveBeenCalled();
  expect(context.toast).toHaveBeenCalledWith(expect.stringMatching(/No se pudo exportar/));
});
