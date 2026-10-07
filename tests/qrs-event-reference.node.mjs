import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qrsMidpointSeconds} from '../scripts/lib/qrs-event-reference.mjs';
test('240 ms complex starts at1s and has midpoint1.12s, not1.00012s',()=>assert.equal(qrsMidpointSeconds({time:1,qrs:.24}),1.12));
test('uses actual event duration, never a requested-case fallback',()=>assert.equal(qrsMidpointSeconds({time:2,qrs:.16,requestedQrs:240}),2.08));
test('rejects missing durations and milliseconds masquerading as seconds',()=>{for(const qrs of [undefined,NaN,0,-.12,Infinity,240])assert.throws(()=>qrsMidpointSeconds({time:1,qrs}),/seconds/);});
test('preserves cropped arithmetic and permits events before the displayed window',()=>{
 for(const time of [.38608810963584705,1,5,12])for(const qrs of [.08,.16,.24])for(const crop of [0,2,4])assert.equal(qrsMidpointSeconds({time:time-crop,qrs}),time-crop+qrs/2);
 assert.equal(qrsMidpointSeconds({time:-1,qrs:.25}),-.875);
});
test('rejects invalid time coordinates',()=>{assert.throws(()=>qrsMidpointSeconds({time:NaN,qrs:.12}));assert.throws(()=>qrsMidpointSeconds({time:Infinity,qrs:.12}));});

test('is safe as an Array.map callback: the array index is not a crop origin',()=>assert.deepEqual([{time:1,qrs:.2},{time:2,qrs:.2}].map(qrsMidpointSeconds),[1.1,2.1]));
