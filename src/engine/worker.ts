import { synthesize } from "./signal";
import { analyzeSamples } from "./sample-analysis";
import type { SignalRequest, SignalResponse } from "./protocol";
self.onmessage = (event: MessageEvent<SignalRequest>) => {
  const { id, ecg, duration } = event.data;
  try {
    const signal = synthesize(ecg, duration),
      measurement = analyzeSamples({ fs: signal.fs, leads: signal.leads });
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
