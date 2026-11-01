import {describe,it,expect} from 'vitest';
import {capturePaperAnchor,restorePaperAnchor} from '../src/render/paper-viewport';
import type {Layout} from '../src/render/ecg';
const sheet:Layout={mode:'paper',widthMm:200,heightMm:300,pxPerMm:4,segments:[
 {lead:'I',x:10,y:10,width:80,height:40,baseline:30,start:0,duration:5,polarity:1},
 {lead:'V5',x:100,y:140,width:80,height:40,baseline:160,start:5,duration:5,polarity:1},
]};
describe('paper reading anchor',()=>{
 it('keeps the viewed lead in place when rows above grow, not the old scroll number',()=>{
  const anchor=capturePaperAnchor(sheet,400,500,200,200)!;
  expect(anchor.lead).toBe('V5');
  expect(restorePaperAnchor(sheet,anchor)).toEqual({left:400,top:500});
  const taller={...sheet,segments:sheet.segments.map(s=>s.lead==='V5'?{...s,y:s.y+20,baseline:s.baseline+20}:s)};
  expect(restorePaperAnchor(taller,anchor)).toEqual({left:400,top:580});
 });
 it('does not restore a missing time segment or apply paper coordinates to rhythm view',()=>{
  const anchor=capturePaperAnchor(sheet,400,500,200,200)!;
  expect(restorePaperAnchor({...sheet,segments:sheet.segments.map(s=>({...s,start:0}))},anchor)).toBeNull();
  expect(restorePaperAnchor({...sheet,mode:'rhythm'},anchor)).toBeNull();
  expect(capturePaperAnchor({...sheet,mode:'rhythm'},0,0,200,200)).toBeNull();
 });
});
