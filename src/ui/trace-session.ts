import type { ECGCase, Measurement, Signal } from "../engine/types";
type TraceMode = ECGCase["view"]["mode"];
type TraceResult = { signal: Signal; measurement: Measurement };

/** UI session only: owns validity and tools, never synthesizes or measures ECG.
 * Worker replies carry monotonically increasing request IDs. Invalidating a case
 * retires that ID immediately, including the gap before the next debounced post.
 * Samples are retained by reference, not copied, normalized or recalculated.
 */
export class TraceSession {
  private result: TraceResult | null = null;
  private activeRequest: number | null = null;
  private phase: "empty" | "pending" | "ready" | "error" = "empty";
  private frozen = false;
  private measuring = false;
  private time = 0;
  private beat = 0;

  get signal() { return this.result?.signal ?? null; }
  get measurement() { return this.result?.measurement ?? null; }
  get status() { return this.phase; }
  get paused() { return this.frozen; }
  get caliperOn() { return this.measuring; }
  get elapsed() { return this.time; }
  get selectedBeat() { return this.beat; }
  get canExport() { return this.phase === "ready" && this.result !== null; }

  invalidate(): void {
    this.result = null;
    this.activeRequest = null;
    this.phase = "pending";
    this.resetTools();
    this.time = 0;
    this.beat = 0;
  }

  expectRequest(id: number): void {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid trace request ID");
    this.invalidate();
    this.activeRequest = id;
  }

  isCurrentRequest(id: number): boolean {
    return this.phase === "pending" && this.activeRequest === id;
  }

  accept(id: number, signal: Signal, measurement: Measurement, mode: TraceMode, selectedBeat = 0): boolean {
    if (!this.isCurrentRequest(id)) return false;
    this.result = { signal, measurement };
    this.activeRequest = null;
    this.phase = "ready";
    this.resetTools();
    this.time = mode === "monitor" ? 4 : 0;
    this.selectBeat(selectedBeat);
    return true;
  }

  fail(id: number): boolean {
    if (!this.isCurrentRequest(id)) return false;
    this.invalidate();
    this.phase = "error";
    return true;
  }

  resetTools(): void {
    this.frozen = false;
    this.measuring = false;
  }

  changeMode(mode: TraceMode): void {
    this.resetTools();
    if (this.canExport && mode === "monitor" && this.time === 0) this.time = 4;
  }

  togglePause(mode: TraceMode): void {
    if (this.canExport && mode === "monitor") this.frozen = !this.frozen;
  }

  toggleCaliper(mode: TraceMode): void {
    if (this.canExport && mode !== "monitor") this.measuring = !this.measuring;
  }

  selectBeat(index: number): void {
    if (!this.result || !Number.isFinite(index)) return;
    this.beat = Math.max(0, Math.min(this.result.measurement.beats.length - 1, Math.trunc(index)));
  }

  advance(seconds: number, mode: TraceMode): void {
    if (mode === "monitor" && this.canExport && !this.frozen && Number.isFinite(seconds) && seconds > 0)
      this.time += seconds;
  }
}
