import { synthesize } from "./signal";
import { measure } from "./measure";
import type { SignalRequest, SignalResponse } from "./protocol";
self.onmessage = (event: MessageEvent<SignalRequest>) => {
  const { id, ecg, duration } = event.data;
  try {
    const signal = synthesize(ecg, duration),
      measurement = measure(signal);
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
