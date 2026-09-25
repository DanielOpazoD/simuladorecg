import { describe, expect, it, vi } from "vitest";
import { TraceSession } from "../src/ui/trace-session";
import { SignalController } from "../src/ui/signal-controller";
import { DEFAULT_CASE, cloneCase, LEADS } from "../src/engine/types";
import { synthesize } from "../src/engine/signal";
import { measure } from "../src/engine/measure";
import type { SignalRequest, SignalResponse } from "../src/engine/protocol";

// Real samples are data here. These tests validate state ownership, NOT delineation.
const signal = synthesize(cloneCase(DEFAULT_CASE), 10);
const measurement = measure(signal);
function ready(mode: "paper" | "rhythm" | "monitor" = "paper") {
  const session = new TraceSession();
  session.expectRequest(1);
  expect(session.accept(1, signal, measurement, mode, 2)).toBe(true);
  return session;
}

describe("Trace session owns data validity independently of DOM", () => {
  it("starts unavailable and does not enable tools or exports without a result", () => {
    const session = new TraceSession();
    session.togglePause("monitor"); session.toggleCaliper("paper"); session.advance(.1, "monitor");
    expect([session.signal, session.measurement]).toEqual([null, null]);
    expect([session.canExport, session.paused, session.caliperOn]).toEqual([false, false, false]);
    expect(session.elapsed).toBe(0); expect(session.status).toBe("empty");
  });
  it("accepts one paired result without copying or altering any of the twelve channels", () => {
    const copies = Object.fromEntries(LEADS.map(lead => [lead, signal.leads[lead].slice()]));
    const session = ready();
    expect(session.signal).toBe(signal); expect(session.measurement).toBe(measurement);
    expect(session.canExport).toBe(true); expect(session.selectedBeat).toBe(2);
    for (const lead of LEADS) expect(session.signal!.leads[lead]).toEqual(copies[lead]);
    expect(session.accept(1, signal, measurement, "paper")).toBe(false); // replay retired
  });
  it("retires replies immediately in the debounce gap, before another request exists", () => {
    const session = new TraceSession(); session.expectRequest(1); session.invalidate();
    expect(session.accept(1, signal, measurement, "paper")).toBe(false);
    expect(session.fail(1)).toBe(false);
    expect(session.status).toBe("pending"); expect(session.canExport).toBe(false);
    expect(session.signal).toBeNull(); expect(session.measurement).toBeNull();
  });
  it("ignores an older success or error while a newer request is pending and after it succeeds", () => {
    const session = new TraceSession(); session.expectRequest(1); session.expectRequest(2);
    expect(session.accept(1, signal, measurement, "paper")).toBe(false);
    expect(session.fail(1)).toBe(false);
    expect(session.accept(2, signal, measurement, "paper")).toBe(true);
    expect(session.fail(1)).toBe(false); expect(session.fail(2)).toBe(false);
    expect(session.signal).toBe(signal); expect(session.canExport).toBe(true);
  });
  it("invalidates paused data, selected beat and tools together when physiology changes", () => {
    const session = ready("monitor"); session.togglePause("monitor");
    expect(session.paused).toBe(true); session.invalidate();
    expect([session.paused, session.caliperOn, session.canExport]).toEqual([false, false, false]);
    expect([session.signal, session.measurement]).toEqual([null, null]);
    expect(session.selectedBeat).toBe(0); expect(session.elapsed).toBe(0);
    session.expectRequest(2); session.accept(2, signal, measurement, "monitor");
    expect(session.paused).toBe(false); expect(session.elapsed).toBe(4);
  });
  it("removes caliper mode along with the previous samples", () => {
    const session = ready(); session.toggleCaliper("paper"); expect(session.caliperOn).toBe(true);
    session.expectRequest(2); expect(session.caliperOn).toBe(false); expect(session.canExport).toBe(false);
  });
  it("keeps a current failure unavailable, then recovers only on a fresh matching result", () => {
    const session = ready(); session.expectRequest(2); expect(session.fail(2)).toBe(true);
    expect(session.status).toBe("error"); expect(session.signal).toBeNull(); expect(session.measurement).toBeNull();
    expect(session.accept(2, signal, measurement, "paper")).toBe(false);
    session.expectRequest(3); expect(session.accept(3, signal, measurement, "paper")).toBe(true);
    expect(session.canExport).toBe(true);
  });
  it("switches presentation mode without invalidating samples and resets incompatible tools", () => {
    const session = ready(); session.toggleCaliper("paper"); session.changeMode("monitor");
    expect(session.caliperOn).toBe(false); expect(session.elapsed).toBe(4);
    session.toggleCaliper("monitor"); expect(session.caliperOn).toBe(false);
    session.togglePause("monitor"); session.changeMode("paper"); expect(session.paused).toBe(false);
    session.togglePause("paper"); expect(session.paused).toBe(false);
    session.advance(.1, "paper"); expect(session.elapsed).toBe(4);
    expect(session.signal).toBe(signal); expect(session.measurement).toBe(measurement);
  });
  it("does not advance a frozen or unavailable monitor and rejects invalid time steps", () => {
    const session = ready("monitor"); session.advance(.1, "monitor"); expect(session.elapsed).toBe(4.1);
    session.togglePause("monitor"); session.advance(.1, "monitor"); expect(session.elapsed).toBe(4.1);
    session.togglePause("monitor"); session.advance(NaN, "monitor"); session.advance(-1, "monitor"); session.advance(Infinity, "monitor");
    expect(session.elapsed).toBe(4.1); session.invalidate(); session.advance(.1, "monitor"); expect(session.elapsed).toBe(0);
  });
  it("bounds selection to the current measurement and rejects invalid request identities", () => {
    const session = ready(); session.selectBeat(-2); expect(session.selectedBeat).toBe(0);
    session.selectBeat(10000); expect(session.selectedBeat).toBe(measurement.beats.length - 1);
    session.selectBeat(NaN); expect(session.selectedBeat).toBe(measurement.beats.length - 1);
    for (const id of [0, -1, NaN, .5]) expect(() => session.expectRequest(id)).toThrow(/request ID/);
  });
  it("integrates the real queue IDs with debounce retirement, newest request and error recovery", () => {
    class FakeWorker {
      static instance: FakeWorker;
      sent: SignalRequest[] = [];
      onmessage: ((e: { data: SignalResponse }) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { FakeWorker.instance = this; }
      postMessage(value: SignalRequest) { this.sent.push(value); }
      finish(id: number, error?: string) { this.onmessage?.({ data: error ? { id, error } : { id, signal, measurement } }); }
    }
    vi.stubGlobal("Worker", FakeWorker);
    try {
      const session = new TraceSession();
      const controller = new SignalController(
        (s, m, id) => { session.accept(id, s, m, "paper"); },
        (_, id) => { session.fail(id); },
      );
      session.expectRequest(controller.request(cloneCase(DEFAULT_CASE)));
      session.invalidate(); FakeWorker.instance.finish(1); expect(session.canExport).toBe(false);
      session.expectRequest(controller.request(cloneCase(DEFAULT_CASE)));
      session.expectRequest(controller.request(cloneCase(DEFAULT_CASE)));
      FakeWorker.instance.finish(2); expect(session.canExport).toBe(false);
      expect(FakeWorker.instance.sent.map(r => r.id)).toEqual([1, 2, 3]);
      FakeWorker.instance.finish(3, "Fuera del alcance del modelo: fixture");
      expect(session.status).toBe("error"); expect(session.canExport).toBe(false);
      session.expectRequest(controller.request(cloneCase(DEFAULT_CASE))); FakeWorker.instance.finish(4);
      expect(session.signal).toBe(signal); expect(session.canExport).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
});
