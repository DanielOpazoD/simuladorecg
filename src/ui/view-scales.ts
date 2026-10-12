/** Paper scales offered by the selects and cycled by the V and G shortcuts. */
export const SPEEDS = [12.5, 25, 50] as const;
export const GAINS = [2.5, 5, 10, 20] as const;
const decimal = (v: number) => String(v).replace(".", ",");
export const speedOptions = SPEEDS.map((v) => [v, `${decimal(v)} mm/s`] as [number, string]);
export const gainOptions = GAINS.map((v) => [v, `${decimal(v)} mm/mV`] as [number, string]);
/** The option after `value`, wrapping around; a value not offered goes to the first. */
export const nextInCycle = <T>(cycle: readonly T[], value: T): T => cycle[(cycle.indexOf(value) + 1) % cycle.length];
