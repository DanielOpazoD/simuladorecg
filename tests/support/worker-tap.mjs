/** Observe the signal worker's real replies without touching them.
 * The A/B comparison export used to be the way a script read samples, events and the
 * measurement of a trace; the simplified interface has no such export. The worker still
 * produces exactly those objects, so the page records every reply (and the case that
 * requested it) and the script reads the latest one. Interaction stays on native UI.
 *
 *   await installWorkerTap(page);       // before page.goto
 *   const trace = await settledTrace(page, () => importCase(...));
 */
export async function installWorkerTap(page) {
  await page.addInitScript(() => {
    const Native = window.Worker;
    const tap = window.__ecgTap = { count: 0, requests: new Map(), last: null };
    window.Worker = class extends Native {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          const data = event.data;
          if (!data || data.id === undefined) return;
          const request = tap.requests.get(data.id);
          tap.count++;
          tap.last = { id: data.id, data, ecg: request ? request.ecg : null };
          tap.requests.delete(data.id);
        });
      }
      postMessage(message, ...rest) {
        if (message && message.id !== undefined && message.ecg) {
          tap.requests.set(message.id, { ecg: structuredClone(message.ecg) });
          if (tap.requests.size > 8) tap.requests.delete(tap.requests.keys().next().value);
        }
        return super.postMessage(message, ...rest);
      }
    };
  });
}

export const workerReplies = page => page.evaluate(() => window.__ecgTap.count);

/** Wait until a reply newer than `since` exists and the visible loading state is gone. */
export async function waitForReply(page, since) {
  await page.waitForFunction(n => window.__ecgTap.count > n &&
    document.querySelector('#signal-loading').hidden, since, { timeout: 30_000 });
}

/** Run `action`, wait for the worker reply it caused and return the trace the page now shows.
 * First `seconds` of every lead as plain arrays, the generator events, the sample-only
 * measurement and the case the worker was asked to render. Exact doubles; no rounding. */
export async function settledTrace(page, action = async () => {}, { seconds = 10 } = {}) {
  const since = await workerReplies(page);
  await action();
  await waitForReply(page, since);
  return readTrace(page, { seconds });
}

export async function readTrace(page, { seconds = 10 } = {}) {
  const trace = await page.evaluate(seconds => {
    const { last } = window.__ecgTap;
    if (!last) return null;
    if ('error' in last.data) return { error: last.data.error };
    const { signal, measurement } = last.data, n = Math.round(seconds * signal.fs);
    return {
      case: last.ecg, fs: signal.fs, duration: signal.duration,
      leads: Object.fromEntries(Object.entries(signal.leads).map(([lead, values]) => [lead, Array.from(values.subarray(0, n))])),
      events: signal.events, warnings: signal.warnings, truth: signal.truth, measurement,
    };
  }, seconds);
  if (!trace) throw new Error('The signal worker has not replied yet');
  if (trace.error) throw new Error('The signal worker reported: ' + trace.error);
  return trace;
}
