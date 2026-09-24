import { it, expect, vi } from "vitest";
import { SignalController } from "../src/ui/signal-controller";
import {
  DEFAULT_CASE,
  cloneCase,
  type Signal,
  type Measurement,
} from "../src/engine/types";
import type { SignalRequest, SignalResponse } from "../src/engine/protocol";

it("coalesces slider changes and ignores stale worker replies", () => {
  class FakeWorker {
    static instance: FakeWorker;
    sent: SignalRequest[] = [];
    onmessage: ((event: { data: SignalResponse }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      FakeWorker.instance = this;
    }
    postMessage(value: SignalRequest) {
      this.sent.push(value);
    }
    finish(id: number) {
      this.onmessage?.({
        data: {
          id,
          signal: { duration: id } as Signal,
          measurement: {} as Measurement,
        },
      });
    }
  }
  vi.stubGlobal("Worker", FakeWorker);
  try {
    const received: number[] = [],
      controller = new SignalController(
        (s) => received.push(s.duration),
        () => {},
      );
    const c = cloneCase(DEFAULT_CASE);
    controller.request(c);
    c.hr = 80;
    controller.request(c);
    c.hr = 90;
    controller.request(c);
    c.hr = 100;
    const worker = FakeWorker.instance;
    expect(worker.sent).toHaveLength(1);
    expect(worker.sent[0].ecg.hr).toBe(72);
    worker.finish(1);
    expect(received).toEqual([]);
    expect(worker.sent).toHaveLength(2);
    expect(worker.sent[1].ecg.hr).toBe(90);
    worker.finish(3);
    expect(received).toEqual([3]);
  } finally {
    vi.unstubAllGlobals();
  }
});
