import type { ECGCase, Signal, Measurement } from "../engine/types";
import type { SignalRequest, SignalResponse } from "../engine/protocol";
/** One running request plus one newest pending request. Obsolete slider states are skipped. */
export class SignalController {
  private worker: Worker;
  private busy = false;
  private pending: SignalRequest | null = null;
  private serial = 0;
  constructor(
    onResult: (signal: Signal, measurement: Measurement, requestId: number) => void,
    onError: (message: string, requestId: number) => void,
  ) {
    this.worker = new Worker(new URL("../engine/worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<SignalResponse>) => {
      this.busy = false;
      if (this.pending) {
        const next = this.pending;
        this.pending = null;
        this.send(next);
        return;
      }
      const result = event.data;
      if (result.id !== this.serial) return;
      if ("error" in result) onError(result.error, result.id);
      else onResult(result.signal, result.measurement, result.id);
    };
    this.worker.onerror = () => {
      this.busy = false;
      this.pending = null;
      onError("No fue posible iniciar el motor. Recarga la página.", this.serial);
    };
  }
  request(ecg: ECGCase, duration = 65): number {
    const request = { id: ++this.serial, ecg: structuredClone(ecg), duration };
    if (this.busy) this.pending = request;
    else this.send(request);
    return request.id;
  }
  private send(request: SignalRequest): void {
    this.busy = true;
    this.worker.postMessage(request);
  }
}
