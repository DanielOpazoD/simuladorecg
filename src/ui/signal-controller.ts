import type { ECGCase, Signal, Measurement } from "../engine/types";
import type { SignalRequest, SignalResponse } from "../engine/protocol";

/** One running request and the newest pending snapshot. Infrastructure failures
 * get at most ONE retry per request; physiological-domain errors are not retried.
 * This transport never modifies samples, measurements or model parameters.
 */
export class SignalController {
  private worker: Worker | null = null;
  private active: SignalRequest | null = null;
  private pending: SignalRequest | null = null;
  private serial = 0;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly timeoutMs: number;

  constructor(
    private readonly onResult: (signal: Signal, measurement: Measurement, requestId: number) => void,
    private readonly onError: (message: string, requestId: number) => void,
    options: { timeoutMs?: number } = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0)
      throw new Error("Invalid worker timeout");
  }

  request(ecg: ECGCase, duration = 65): number {
    if (this.disposed) throw new Error("Signal controller disposed");
    const request = { id: ++this.serial, ecg: structuredClone(ecg), duration };
    if (this.active) this.pending = request;
    else this.send(request, 0);
    return request.id;
  }

  dispose(): void {
    this.disposed = true;
    this.pending = null;
    this.active = null;
    this.stopWorker();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private stopWorker(): void {
    this.clearTimer();
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }

  private send(request: SignalRequest, retries: number): void {
    this.active = request;
    this.retries = retries;
    try {
      if (!this.worker) {
        const worker = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" });
        this.worker = worker;
        worker.onmessage = (event: MessageEvent<SignalResponse>) => {
          if (this.disposed || worker !== this.worker || event.data.id !== this.active?.id) return;
          this.clearTimer();
          this.active = null;
          if (this.pending) {
            const next = this.pending;
            this.pending = null;
            this.send(next, 0);
            return;
          }
          const result = event.data;
          if (result.id !== this.serial) return;
          if ("error" in result) this.onError(result.error, result.id);
          else this.onResult(result.signal, result.measurement, result.id);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          this.fail(worker, "El motor se interrumpió");
        };
        worker.onmessageerror = () => this.fail(worker, "No se pudo recibir la respuesta del motor");
      }
      const worker = this.worker;
      this.clearTimer();
      this.timer = setTimeout(() => {
        if (this.active?.id === request.id)
          this.fail(worker, "El motor no respondió dentro del plazo de ejecución");
      }, this.timeoutMs);
      worker.postMessage(request);
    } catch {
      // Construction/postMessage can fail before request() returns its ID to the
      // UI session. A final callback must wait until that ID has been registered.
      this.fail(this.worker, "No se pudo iniciar la petición al motor", true);
    }
  }

  private fail(worker: Worker | null, reason: string, synchronous = false): void {
    if (this.disposed || worker !== this.worker) return;
    const request = this.pending ?? this.active;
    const retries = this.pending ? 0 : this.retries + 1;
    this.pending = null;
    this.active = null;
    this.stopWorker();
    if (!request) return;
    if (retries <= 1) { this.send(request, retries); return; }
    const notify = () => {
      if (!this.disposed && request.id === this.serial && this.active === null)
        this.onError(`${reason}. Se agotó el único reintento; selecciona de nuevo el caso o recarga la página.`, request.id);
    };
    if (synchronous) queueMicrotask(notify);
    else notify();
  }
}
