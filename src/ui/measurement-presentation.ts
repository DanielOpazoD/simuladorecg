/** Shared reading vocabulary; this module never calculates or approves a measurement. */
export const MEASUREMENT_STATE = { review: 'Revisar', unavailable: 'No estimable' } as const;
export const intervalValue = (ms:number, review:boolean) => `${Math.round(ms)} ms${review?'*':''}`;
export function intervalDescription(key:string, ms:number, review:boolean, reason='') {
  return `${key.toUpperCase()} ${Math.round(ms)} ms. Estimación del latido marcado, con límites multiderivación. ${review?MEASUREMENT_STATE.review+'. ':''}${reason}`.trim();
}
