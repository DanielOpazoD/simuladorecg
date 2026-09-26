import {it,expect} from 'vitest';
import {reviewMonitorRevision} from '../scripts/lib/monitor-revision.mjs';
const failure=(domain,id)=>({domain,id:JSON.stringify(id)});
it.each([
 ['morphology',['post-acquisition','sinus','ma',0,'diagnostic','normal','II','jMv']],
 ['morphology',['native','sinus',null,null,'aggressive','normal','II','jMv']],
 ['quality',['sinus','bw',0,'off']],
 ['rmse',['sinus','em',6,'diagnostic']],
 ['detection',['sinus','em',6,'off']],
])('never grants a monitor exemption to %s outside its scope', (domain,id)=>{
 expect(()=>reviewMonitorRevision({}, {}, {failures:[failure(domain,id)]},{mode:'monitor'})).toThrow('outside monitor');
});
it('does not accept a broad all-filter migration',()=>expect(()=>reviewMonitorRevision({}, {}, {failures:[]},{mode:'all'})).toThrow());
it('does not accept a missing report as success',()=>expect(()=>reviewMonitorRevision({}, {}, {failures:[]},{mode:'monitor'})).toThrow());
