/// <reference types="vite/client" />
/**
 * On-demand loading of the per-diagnosis shape models (each a separate chunk), so
 * a normal ECG never downloads them. The signal worker awaits the case's model
 * before synthesizing; the activation lab loads all of them when it opens.
 */
import type { ECGCase } from "../types";
import { hasShapeModel, registerShapeModel, type ModelCode, type RawShapeModel } from "./shape-model";
import { realisticModelFor } from "./scope";

const LOADERS = import.meta.glob<RawShapeModel>("./models/*.json", { import: "default" });

export async function ensureShapeModel(code: ModelCode): Promise<void> {
  if (hasShapeModel(code)) return;
  const load = LOADERS[`./models/${code}.json`];
  if (!load) throw new Error(`No existe el modelo aprendido ${code}.`);
  registerShapeModel(code, await load());
}
/** Loads the learned model the case needs, if any. */
export async function ensureCaseModel(c: ECGCase): Promise<void> {
  const code = realisticModelFor(c);
  if (code) await ensureShapeModel(code);
}
export const CLASS_MODELS = Object.keys(LOADERS).map((k) => k.slice(9, -5) as ModelCode);
export const ensureAllShapeModels = () => Promise.all(CLASS_MODELS.map(ensureShapeModel)).then(() => undefined);
