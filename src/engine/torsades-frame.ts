import type { Vec } from './leads';
/** Historical illustrative projection, not a rigid anatomical rotation or
 * reentry solver. Share its frame between QRS and coupled secondary T. */
export function torsadesFrame(v: Vec, time: number, hr: number): Vec {
  const phase = (2 * Math.PI * time) / ((60 / hr) * 12),
    x = v[0], z = v[2],
    envelope = 0.55 + (0.65 * (1 + Math.sin(phase))) / 2;
  return [
    (x * Math.cos(phase) - z * Math.sin(phase)) * envelope,
    v[1] * Math.cos(phase),
    x * Math.sin(phase) + z * Math.cos(phase),
  ];
}
