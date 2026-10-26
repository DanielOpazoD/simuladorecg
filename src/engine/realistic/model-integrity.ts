/** Structural integrity of the shipped coefficient formats, not clinical validation.
 * All checks happen before a decoder publishes a model or clears its caches. */
export const SHAPE_PHASE_LAYOUT = [
  ["pre", 24], ["p", 40], ["pq", 20], ["qrs", 56], ["st", 80], ["t", 48], ["post", 48],
] as const;
export const VENTRICULAR_PHASE_LAYOUT = SHAPE_PHASE_LAYOUT.slice(3);

export class ModelIntegrity {
  constructor(private readonly name: string) {}
  fail(field: string): never { throw new Error(`Modelo aprendido ${this.name} inconsistente: ${field}.`); }
  check(ok: boolean, field: string): void { if (!ok) this.fail(field); }
  object(value: unknown, field: string): void {
    this.check(value !== null && typeof value === "object" && !Array.isArray(value), field);
  }
  number(value: unknown, field: string, minimum = -Infinity): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) this.fail(field);
    return value;
  }
  integer(value: unknown, field: string, minimum = 1): number {
    const n = this.number(value, field, minimum);
    this.check(Number.isSafeInteger(n), field);
    return n;
  }
  numbers(value: unknown, count: number, field: string, minimum = -Infinity): number[] {
    if (!Array.isArray(value) || value.length !== count) this.fail(field);
    return Array.from(value, n => this.number(n, field, minimum));
  }
  names(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.length === 0 || !Array.from(value).every(n => typeof n === "string" && n.length > 0)) this.fail(field);
    this.check(new Set(value).size === value.length, field);
    return value.slice() as string[];
  }
  ordered(value: unknown, expected: readonly string[], field: string): void {
    const names = this.names(value, field);
    this.check(names.length === expected.length && names.every((n, i) => n === expected[i]), field);
  }
  phases(value: unknown, layout: readonly (readonly [string, number])[]): void {
    if (!Array.isArray(value) || value.length !== layout.length) this.fail("phases");
    for (let i = 0; i < layout.length; i++) {
      this.object(value[i], `phases[${i}]`);
      this.check(value[i].name === layout[i][0] && value[i].points === layout[i][1], `phases[${i}]`);
    }
  }
  private bytes(value: unknown, count: number, size: number, field: string): Uint8Array {
    this.integer(count, field, 0);
    if (typeof value !== "string" || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) this.fail(field);
    let decoded: string;
    try { decoded = atob(value); } catch { this.fail(field); }
    this.check(decoded.length === count * size, field);
    return Uint8Array.from(decoded, ch => ch.charCodeAt(0));
  }
  float32(value: unknown, count: number, field: string, minimum = -Infinity): Float64Array {
    const bytes = this.bytes(value, count, 4, field);
    const out = Float64Array.from(new Float32Array(bytes.buffer));
    this.check(out.every(n => Number.isFinite(n) && n >= minimum), field);
    return out;
  }
  int16(value: unknown, count: number, field: string): Int16Array {
    return new Int16Array(this.bytes(value, count, 2, field).buffer);
  }
  cholesky(values: ArrayLike<number>, size: number, components: number, field: string): void {
    const triangle = size * (size + 1) / 2;
    this.check(values.length === triangle * components, field);
    for (let c = 0; c < components; c++)
      for (let i = 0; i < size; i++) this.check(values[c * triangle + i * (i + 1) / 2 + i] >= 0, field);
  }
}
