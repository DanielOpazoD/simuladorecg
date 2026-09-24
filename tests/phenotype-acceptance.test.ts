import { describe, it, expect } from "vitest";
import { synthesize } from "../src/engine/signal";
import { fromPreset, PRESETS, presetById } from "../src/presets/catalog";
import {
  cloneCase,
  type Beat,
  type Lead,
  type Signal,
} from "../src/engine/types";

/** Initial generator acceptance, not detector accuracy or clinical validation.
 * Events select an interior waveform; every phenotype assertion reads samples.
 * No kernels, local correction functions, model audit or automatic measurements.
 * Engineering margins and exclusions are documented in docs/aceptacion-fenotipos.md.
 */
const independent = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"] as const;
const load = (id: string) => fromPreset(presetById(id)!);
const mean = (a: readonly number[]) =>
  a.reduce((sum, v) => sum + v, 0) / a.length;
function samples(s: Signal, lead: Lead, from: number, to: number): number[] {
  const values = Array.from(
    s.leads[lead].slice(Math.round(from * s.fs), Math.round(to * s.fs)),
  );
  expect(values.length, `${lead}: empty acceptance window`).toBeGreaterThan(0);
  return values;
}
function segment(s: Signal, lead: Lead, b: Beat, from: number, to: number) {
  // PR baseline for normal AV timing. WPW/ectopia use an explicit other baseline
  // below because their pre-QRS segment may contain P or a preceding T.
  const baseline = mean(samples(s, lead, b.time - 0.035, b.time - 0.02));
  return samples(s, lead, b.time + from, b.time + to).map((v) => v - baseline);
}
function interior(s: Signal, kind?: Beat["kind"]): Beat[] {
  const beats = s.events.beats.filter(
    (b) =>
      b.time > 1 &&
      b.time + (b.qt ?? 1) < s.duration - 1 &&
      (!kind || b.kind === kind),
  );
  expect(
    beats.length,
    "requires multiple interior beats",
  ).toBeGreaterThanOrEqual(2);
  return beats.slice(0, 3);
}

describe("All current presets: eight-channel sample contract", () => {
  it.each(
    PRESETS.filter((p) => p.strategy !== "pending").map(
      (p) => [p.id, p] as const,
    ),
  )(
    "%s is reproducible and presentation cannot alter I/II/V1–V6",
    (_id, preset) => {
      const c = fromPreset(preset),
        a = synthesize(c, 10),
        changed = cloneCase(c);
      Object.assign(changed.view, {
        mode: "rhythm",
        format: "12x1",
        speed: 50,
        gain: 5,
        chestGain: 20,
        cabrera: true,
        palette: "dark",
        fit: false,
        pxPerMm: 6,
      });
      const b = synthesize(changed, 10);
      for (const lead of independent) {
        expect(a.leads[lead].length, lead).toBe(10 * a.fs);
        expect(b.leads[lead].length, lead).toBe(a.leads[lead].length);
        expect(
          a.leads[lead].every(
            (v, i) => Number.isFinite(v) && v === b.leads[lead][i],
          ),
          `${lead}: physical samples must not depend on paper settings`,
        ).toBe(true);
      }
    },
  );
});

describe.each(["off", "diagnostic"] as const)(
  "Sample phenotype acceptance · %s",
  (filter) => {
    const signal = (id: string, duration = 10) => {
      const c = load(id);
      c.variability = 0;
      c.filter = filter;
      return synthesize(c, duration);
    };

    it("sinus preserves P polarity and right-to-left QRS transition", () => {
      const s = signal("sinus");
      for (const b of interior(s)) {
        const p = (lead: Lead) => segment(s, lead, b, -0.145, -0.075);
        expect(mean(p("II"))).toBeGreaterThan(0.04);
        expect(mean(p("aVR"))).toBeLessThan(-0.03);
        const q = (lead: Lead) => segment(s, lead, b, 0.008, 0.082);
        expect(mean(q("I"))).toBeGreaterThan(0.05);
        expect(mean(q("II"))).toBeGreaterThan(0.1);
        for (const lead of ["V1", "V2"] as const)
          expect(Math.abs(Math.min(...q(lead)))).toBeGreaterThan(
            Math.max(...q(lead)),
          );
        const rs = (lead: Lead) =>
          Math.max(...q(lead)) / Math.abs(Math.min(...q(lead)));
        expect(rs("V3")).toBeGreaterThan(rs("V2"));
        for (const lead of ["V4", "V5", "V6"] as const)
          expect(rs(lead)).toBeGreaterThan(2);
      }
    });

    it("RBBB has right terminal activation and opposite terminal forces laterally", () => {
      const s = signal("rbbb");
      for (const b of interior(s)) {
        // Three successive right-precordial phases, not merely a wide QRS value.
        expect(Math.max(...segment(s, "V1", b, 0.003, 0.025))).toBeGreaterThan(
          0.02,
        );
        expect(Math.min(...segment(s, "V1", b, 0.025, 0.085))).toBeLessThan(
          -0.3,
        );
        for (const lead of ["V1", "V2"] as const)
          expect(Math.max(...segment(s, lead, b, 0.09, 0.14))).toBeGreaterThan(
            0.3,
          );
        for (const lead of ["I", "V5", "V6"] as const)
          expect(Math.min(...segment(s, lead, b, 0.09, 0.14))).toBeLessThan(
            -0.2,
          );
        expect(mean(segment(s, "V1", b, 0.23, 0.36))).toBeLessThan(-0.05);
      }
    });

    it("LBBB maintains broad lateral positivity with secondary T discordance", () => {
      const s = signal("lbbb");
      for (const b of interior(s)) {
        expect(mean(segment(s, "V1", b, 0.03, 0.14))).toBeLessThan(-0.3);
        expect(mean(segment(s, "V1", b, 0.23, 0.36))).toBeGreaterThan(0.1);
        for (const lead of ["I", "V5", "V6"] as const) {
          expect(mean(segment(s, lead, b, 0.03, 0.14))).toBeGreaterThan(0.2);
          expect(mean(segment(s, lead, b, 0.23, 0.36))).toBeLessThan(-0.1);
        }
      }
    });

    it("WPW adds an early visible deflection beyond a simply stretched normal QRS", () => {
      const c = load("wpw");
      c.variability = 0;
      c.filter = filter;
      const preexcited = synthesize(c, 10);
      c.conduction = "normal"; // Same short PR and wide duration: isolate preexcitation.
      const control = synthesize(c, 10);
      for (const b of interior(preexcited)) {
        const reference = samples(
          control,
          "II",
          b.time + 0.006,
          b.time + 0.026,
        );
        const difference = samples(
          preexcited,
          "II",
          b.time + 0.006,
          b.time + 0.026,
        ).map((v, i) => v - reference[i]);
        expect(mean(difference)).toBeGreaterThan(0.1);
        const p = samples(preexcited, "II", b.time - 0.08, b.time - 0.025);
        expect(Math.max(...p) - Math.min(...p)).toBeGreaterThan(0.04);
      }
    });

    it("PVC changes ventricular morphology and repolarization in opposite directions", () => {
      const s = signal("pvc", 20);
      for (const b of interior(s, "pvc")) {
        // Interior QRS/T windows compare signs within the same beat, without
        // assuming that a premature complex has an isoelectric PR segment.
        const qrs = (lead: Lead) =>
          mean(samples(s, lead, b.time + 0.025, b.time + 0.13));
        const t = (lead: Lead) =>
          mean(samples(s, lead, b.time + 0.28, b.time + 0.35));
        expect(qrs("V1")).toBeLessThan(-0.2);
        expect(t("V1")).toBeGreaterThan(0.08);
        expect(qrs("V6")).toBeGreaterThan(0.1);
        expect(t("V6")).toBeLessThan(-0.04);
      }
    });

    it("inferior injury retains territorial ST elevation and reciprocal depression", () => {
      const s = signal("inferior");
      for (const b of interior(s)) {
        const st = (lead: Lead) =>
          mean(segment(s, lead, b, b.qrs! + 0.02, b.qrs! + 0.06));
        expect(st("II")).toBeGreaterThan(0.1);
        expect(st("III")).toBeGreaterThan(st("II") + 0.03);
        expect(st("aVF")).toBeGreaterThan(0.1);
        expect(st("I")).toBeLessThan(-0.04);
        expect(st("aVL")).toBeLessThan(-0.08);
      }
    });

    it.each(["wellens_a", "wellens_b"])(
      "%s retains its anterior T phenotype and near-isoelectric ST",
      (id) => {
        const s = signal(id);
        for (const b of interior(s))
          for (const lead of ["V2", "V3"] as const) {
            expect(
              Math.abs(mean(segment(s, lead, b, b.qrs! + 0.02, b.qrs! + 0.06))),
            ).toBeLessThan(0.03);
            const t = segment(s, lead, b, b.qrs! + 0.06, b.qt! - 0.02);
            expect(Math.min(...t)).toBeLessThan(-0.25);
            if (id === "wellens_a") {
              expect(Math.max(...t)).toBeGreaterThan(0.12);
              expect(t.indexOf(Math.max(...t))).toBeLessThan(
                t.indexOf(Math.min(...t)),
              );
            } else {
              expect(Math.max(...t)).toBeLessThan(0.04);
              expect(mean(t)).toBeLessThan(-0.1);
            }
          }
      },
    );

    it("de Winter retains ascending depressed ST followed by prominent anterior T", () => {
      const s = signal("de_winter"),
        normal = signal("sinus");
      const controls = interior(normal);
      for (const [index, b] of interior(s).entries())
        for (const lead of ["V2", "V3", "V4"] as const) {
          const early = mean(
            segment(s, lead, b, b.qrs! + 0.004, b.qrs! + 0.012),
          );
          const late = mean(segment(s, lead, b, b.qrs! + 0.04, b.qrs! + 0.06));
          expect(early).toBeLessThan(-0.08);
          expect(late - early).toBeGreaterThan(0.03);
          const t = Math.max(...segment(s, lead, b, 0.2, b.qt! - 0.02));
          const normalT = Math.max(
            ...segment(
              normal,
              lead,
              controls[index],
              0.2,
              controls[index].qt! - 0.02,
            ),
          );
          expect(t - normalT).toBeGreaterThan(0.25);
        }
    });

    it.each(["aai", "vvi", "ddd"])(
      "%s preserves visible stimulation and its ventricular morphology",
      (id) => {
        const s = signal(id);
        for (const time of s.events.spikes
          .filter((t) => t > 1 && t < 8)
          .slice(0, 4)) {
          const pulse = samples(s, "II", time - 0.004, time + 0.008);
          expect(Math.max(...pulse) - Math.min(...pulse)).toBeGreaterThan(0.7);
        }
        expect(
          s.events.spikes.filter((t) => t > 1 && t < 8).length,
        ).toBeGreaterThan(3);
        for (const b of interior(s)) {
          const v1 = mean(
            samples(
              s,
              "V1",
              b.time + 0.025,
              b.time + (id === "aai" ? 0.075 : 0.14),
            ),
          );
          const v6 = mean(
            samples(
              s,
              "V6",
              b.time + 0.025,
              b.time + (id === "aai" ? 0.075 : 0.14),
            ),
          );
          expect(v1).toBeLessThan(-0.2);
          expect(v6).toBeGreaterThan(0.1);
          if (id !== "aai") {
            expect(
              mean(samples(s, "V1", b.time + 0.28, b.time + 0.37)),
            ).toBeGreaterThan(0.08);
            expect(
              mean(samples(s, "V6", b.time + 0.28, b.time + 0.37)),
            ).toBeLessThan(-0.03);
          }
        }
      },
    );
  },
);
