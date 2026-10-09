import { applyAcquisitionScope } from "./acquisition-measurement";
import { synthesize } from "./signal";
import { ensureCaseModel } from "./realistic/models";
import { analyzeSamples } from "./sample-analysis";
import type { SignalRequest, SignalResponse } from "./protocol";
self.onmessage = async (event: MessageEvent<SignalRequest>) => {
  const { id, ecg, duration } = event.data;
  try {
    // A class model (bundle-branch block, LVH…) is a separate chunk loaded once.
    await ensureCaseModel(ecg);
  } catch {
    // Transport failure, not a domain error: the controller restarts the worker
    // (a fresh module map retries the download) once.
    const response: SignalResponse = { id, error: "No se pudo descargar el modelo aprendido de este caso", infrastructure: true };
    self.postMessage(response);
    return;
  }
  try {
    const signal = synthesize(ecg, duration),
      measurement = applyAcquisitionScope(analyzeSamples({ fs: signal.fs, leads: signal.leads }), ecg.filter);
    const response: SignalResponse = { id, signal, measurement };
    self.postMessage(response, {
      transfer: Object.values(signal.leads).map((lead) => lead.buffer),
    });
  } catch (error) {
    const response: SignalResponse = {
      id,
      error: error instanceof Error ? error.message : "Error al generar señal",
    };
    self.postMessage(response);
  }
};
