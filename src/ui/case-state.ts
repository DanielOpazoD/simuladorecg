import {
  cloneCase,
  normalizeCase,
  DEFAULT_CASE,
  type ECGCase,
} from "../engine/types";
import { presetById } from "../presets/catalog";
export type CaseControlKey =
  | Exclude<keyof ECGCase, "artifacts" | "view">
  | `artifacts.${keyof ECGCase["artifacts"]}`
  | `view.${keyof ECGCase["view"]}`;
export function isCaseControlKey(key: string): key is CaseControlKey {
  const parts = key.split(".");
  if (parts.length === 1)
    return (
      Object.hasOwn(DEFAULT_CASE, key) && key !== "view" && key !== "artifacts"
    );
  return (
    parts.length === 2 &&
    (parts[0] === "view" || parts[0] === "artifacts") &&
    Object.hasOwn(DEFAULT_CASE[parts[0]], parts[1])
  );
}
export function controlValue(
  c: ECGCase,
  key: CaseControlKey,
  raw: string | boolean,
): unknown {
  const [group, item] = key.split(".");
  const current = item
    ? (c[group as "view"] as unknown as Record<string, unknown>)[item]
    : c[group as keyof ECGCase];
  return typeof current === "number" ? Number(raw) : raw;
}
/** Pure transitions: physiology defaults are independent from DOM event plumbing. */
export function changeCase(
  previous: ECGCase,
  key: CaseControlKey,
  value: unknown,
): ECGCase {
  const c = cloneCase(previous),
    parts = key.split(".");
  if (parts.length === 2)
    (c[parts[0] as "view"] as unknown as Record<string, unknown>)[parts[1]] =
      value;
  else (c as unknown as Record<string, unknown>)[key] = value;
  if (key === "view.gain") c.view.chestGain = c.view.gain;
  if (key === "rhythm") {
    c.av = "normal";
    c.ectopy = "none";
    if (c.rhythm === "af") c.hr = 95;
    if (c.rhythm === "flutter") {
      c.hr = 150;
      c.atrialRate = 300;
    }
    if (["vt", "torsades"].includes(c.rhythm)) {
      c.hr = 170;
      c.qrs = 165;
    }
    if (c.rhythm === "idioventricular") {
      c.hr = 32;
      c.qrs = 165;
    }
  }
  if (key === "av") {
    c.ectopy = "none";
    if (c.av === "first") c.pr = 260;
    if (c.av === "complete") {
      c.hr = c.escape === "ventricular" ? 30 : 45;
      c.atrialRate = 80;
    }
    if (["mobitz1", "mobitz2", "two_one", "high"].includes(c.av)) {
      c.hr = 75;
      c.pr = 160;
      c.variability = 0;
    }
  }
  if (key === "conduction") {
    const defaults: Record<ECGCase["conduction"], [number, number]> = {
      normal: [90, 55],
      rbbb: [150, 35],
      irbbb: [115, 35],
      lbbb: [160, -15],
      lafb: [100, -60],
      lpfb: [100, 120],
      rbbb_lafb: [150, -60],
      rbbb_lpfb: [150, 120],
      wpw: [135, 55],
    };
    [c.qrs, c.axis] = defaults[c.conduction];
    if (c.conduction === "wpw") c.pr = 100;
  }
  if (key === "ischemia" && c.ischemia === "sgarbossa")
    Object.assign(c, presetById("sgarbossa")!.patch);
  if (key === "escape" && c.av === "complete") {
    c.hr = c.escape === "ventricular" ? 30 : 45;
    c.qrs = c.escape === "ventricular" ? 165 : 90;
  }
  if (!key.startsWith("view.")) {
    c.name = "Caso personalizado";
    c.presetId = "custom";
  }
  return normalizeCase(c);
}
