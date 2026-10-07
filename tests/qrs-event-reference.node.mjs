import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qrsMidpointSeconds} from '../scripts/lib/qrs-event-reference.mjs';
test('240 ms QRS midpoint is 120 ms after onset, not 0.12 ms',()=>assert.equal(qrsMidpointSeconds({time:1,qrs:.24}),1.12));
test('does not replace an event duration by the requested-case duration',()=>assert.equal(qrsMidpointSeconds({time:2,qrs:.16,requestedQrs:240}),2.08));
test('rejects milliseconds masquerading as event seconds',()=>assert.throws(()=>qrsMidpointSeconds({time:1,qrs:240}),/seconds/));
test('rejects missing and invalid source durations rather than guessing',()=>{for(const qrs of [undefined,NaN,0,-.12,Infinity])assert.throws(()=>qrsMidpointSeconds({time:1,qrs}),/seconds/);});
