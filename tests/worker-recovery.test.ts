import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TraceSession } from '../src/ui/trace-session';
import { SignalController } from '../src/ui/signal-controller';
import { DEFAULT_CASE, cloneCase, type Signal, type Measurement } from '../src/engine/types';
import type { SignalRequest, SignalResponse } from '../src/engine/protocol';
import { synthesize } from '../src/engine/signal';
import { analyzeSamples } from '../src/engine/sample-analysis';

class FakeWorker {
  static all: FakeWorker[] = [];
  static constructionFailures = 0;
  static postFailures = 0;
  sent: SignalRequest[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<SignalResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  constructor() {
    if (FakeWorker.constructionFailures-- > 0) throw new Error('injected construction failure');
    FakeWorker.all.push(this);
  }
  postMessage(request: SignalRequest) {
    if (FakeWorker.postFailures-- > 0) throw new Error('injected send failure');
    this.sent.push(request);
  }
  terminate() { this.terminated = true; }
  reply(id: number, error?: string) {
    const data: SignalResponse = error ? { id, error } : { id, signal: { duration: id } as Signal, measurement: {} as Measurement };
    this.onmessage?.({ data } as MessageEvent<SignalResponse>);
  }
  crash() { this.onerror?.({ preventDefault() {} } as ErrorEvent); }
}
const current = () => FakeWorker.all.at(-1)!;
const setup = () => {
  const result = vi.fn(), error = vi.fn();
  const controller = new SignalController(result, error, { timeoutMs: 100 });
  return { controller, result, error };
};
beforeEach(() => { FakeWorker.all=[]; FakeWorker.constructionFailures=0; FakeWorker.postFailures=0; vi.useFakeTimers(); vi.stubGlobal('Worker',FakeWorker); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Bounded worker recovery, latest request wins', () => {
  it('recreates once after an engine crash using the exact request snapshot and ID', () => {
    const {controller,result,error}=setup(), c=cloneCase(DEFAULT_CASE);
    const id=controller.request(c); c.hr=111; const original=current(); original.crash();
    expect(original.terminated).toBe(true); expect(current().sent[0]).toMatchObject({id,ecg:{hr:72}});
    current().reply(id); expect(result).toHaveBeenCalledOnce(); expect(error).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('recovers only the latest pending case after failure, never intermediate slider states', () => {
    const {controller,result}=setup(), c=cloneCase(DEFAULT_CASE);
    controller.request(c); const failed=current(); c.hr=80; controller.request(c); c.hr=90; const latest=controller.request(c);
    failed.crash(); expect(current().sent.map(r=>r.ecg.hr)).toEqual([90]); current().reply(latest);
    expect(result.mock.calls[0][2]).toBe(latest);
  });
  it('ignores a delayed message and error from the terminated worker', () => {
    const {controller,result,error}=setup(); const id=controller.request(cloneCase(DEFAULT_CASE));
    const failed=current(), lateMessage=failed.onmessage!, lateError=failed.onerror!; failed.crash();
    lateMessage({data:{id,signal:{duration:999} as Signal,measurement:{} as Measurement}} as MessageEvent<SignalResponse>);
    lateError({preventDefault(){}} as ErrorEvent);
    expect(result).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); expect(FakeWorker.all).toHaveLength(2);
    current().reply(id); expect(result.mock.calls[0][0].duration).toBe(id);
  });
  it('does not let a duplicate old reply unlock an active newer request', () => {
    const {controller,result}=setup(); const first=controller.request(cloneCase(DEFAULT_CASE));
    const second=controller.request(cloneCase(DEFAULT_CASE)); current().reply(first); current().reply(first);
    expect(result).not.toHaveBeenCalled(); expect(current().sent).toHaveLength(2);
    current().reply(second); expect(result).toHaveBeenCalledOnce();
  });
  it('bounds a hung worker to one retry and one final error', () => {
    const {controller,result,error}=setup(); const id=controller.request(cloneCase(DEFAULT_CASE));
    vi.advanceTimersByTime(100); expect(FakeWorker.all).toHaveLength(2); expect(error).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100); expect(error).toHaveBeenCalledOnce(); expect(error.mock.calls[0][1]).toBe(id);
    vi.advanceTimersByTime(10000); expect(FakeWorker.all).toHaveLength(2); expect(result).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('allows a new user request after retry exhaustion', () => {
    const {controller,result,error}=setup(); controller.request(cloneCase(DEFAULT_CASE)); current().crash(); current().crash();
    expect(error).toHaveBeenCalledOnce(); const next=controller.request(cloneCase(DEFAULT_CASE)); current().reply(next);
    expect(result).toHaveBeenCalledOnce(); expect(FakeWorker.all).toHaveLength(3);
  });
  it('does not retry a physiological-domain error reported normally by the worker', () => {
    const {controller,result,error}=setup(); const id=controller.request(cloneCase(DEFAULT_CASE));
    current().reply(id,'Fuera del alcance del modelo'); expect(error).toHaveBeenCalledWith('Fuera del alcance del modelo',id);
    expect(FakeWorker.all).toHaveLength(1); const next=controller.request(cloneCase(DEFAULT_CASE)); current().reply(next);
    expect(result).toHaveBeenCalledOnce();
  });
  it('recovers a message deserialization failure', () => {
    const {controller,result}=setup(); const id=controller.request(cloneCase(DEFAULT_CASE));
    current().onmessageerror?.({} as MessageEvent); expect(FakeWorker.all).toHaveLength(2);
    current().reply(id); expect(result).toHaveBeenCalledOnce();
  });
  it('handles synchronous postMessage failure without leaving busy state stuck', () => {
    FakeWorker.postFailures=1; const {controller,result,error}=setup(); const id=controller.request(cloneCase(DEFAULT_CASE));
    expect(FakeWorker.all).toHaveLength(2); current().reply(id); expect(result).toHaveBeenCalledOnce(); expect(error).not.toHaveBeenCalled();
  });
  it('bounds construction failures too', async () => {
    FakeWorker.constructionFailures=2; const {controller,error}=setup();
    const id=controller.request(cloneCase(DEFAULT_CASE)); await Promise.resolve(); expect(error).toHaveBeenCalledOnce(); expect(error.mock.calls[0][1]).toBe(id);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('disposes workers, listeners and timers without publishing a late result', () => {
    const {controller,result}=setup(); controller.request(cloneCase(DEFAULT_CASE)); const worker=current(); controller.dispose();
    expect(worker.terminated).toBe(true); expect(worker.onmessage).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    worker.reply(1); expect(result).not.toHaveBeenCalled(); expect(()=>controller.request(cloneCase(DEFAULT_CASE))).toThrow(/disposed/i);
  });
  it('passes real twelve-lead samples and analysis through without any numeric change', () => {
    const {controller,result}=setup(),signal=synthesize(cloneCase(DEFAULT_CASE),10),measurement=analyzeSamples(signal);
    const original=structuredClone({signal,measurement}),id=controller.request(cloneCase(DEFAULT_CASE)); current().crash();
    current().onmessage?.({data:{id,signal,measurement}} as MessageEvent<SignalResponse>);
    expect(result.mock.calls[0][0]).toBe(signal); expect(result.mock.calls[0][1]).toBe(measurement);
    expect({signal,measurement}).toEqual(original);
  });
  it('reports a synchronous terminal failure after the trace session registers the ID', async () => {
    FakeWorker.postFailures=2; const session=new TraceSession();
    const controller=new SignalController(()=>{},(_,id)=>session.fail(id),{timeoutMs:100});
    const id=controller.request(cloneCase(DEFAULT_CASE)); session.expectRequest(id);
    expect(session.status).toBe('pending'); await Promise.resolve();
    expect(session.status).toBe('error'); expect(session.canExport).toBe(false);
  });
  it('does not publish a deferred terminal error after a newer user request', async () => {
    FakeWorker.postFailures=2; const {controller,result,error}=setup(); controller.request(cloneCase(DEFAULT_CASE));
    const latest=controller.request(cloneCase(DEFAULT_CASE)); await Promise.resolve();
    expect(error).not.toHaveBeenCalled(); current().reply(latest); expect(result).toHaveBeenCalledOnce();
  });
  it('an idle worker crash does not invalidate a previously delivered signal', () => {
    const {controller,result,error}=setup(); const id=controller.request(cloneCase(DEFAULT_CASE)); current().reply(id);
    current().crash(); expect(result).toHaveBeenCalledOnce(); expect(error).not.toHaveBeenCalled();
    expect(FakeWorker.all).toHaveLength(1); const next=controller.request(cloneCase(DEFAULT_CASE)); current().reply(next);
    expect(result).toHaveBeenCalledTimes(2);
  });
  it('rejects an invalid watchdog configuration rather than an unbounded timer', () => {
    for (const timeoutMs of [0,-1,NaN,Infinity]) expect(()=>new SignalController(()=>{},()=>{},{timeoutMs})).toThrow(/timeout/i);
  });

});
