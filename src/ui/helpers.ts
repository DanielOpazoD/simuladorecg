export const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const paths: Record<string, string> = {
  pulse: "M2 12h4l3-8 5 16 3-8h5",
  grid: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
  monitor: "M3 4h18v13H3zM8 21h8M12 17v4",
  strip: "M3 7h18v10H3zM6 12h2l1-3 3 6 2-3h4",
  pause: "M8 5v14M16 5v14",
  play: "m8 4 12 8-12 8z",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  ruler: "m3 17 14-14 4 4L7 21zM7 13l3 3m1-7 3 3m1-7 3 3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6",
  book: "M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2v16",
  quiz: "M8 8a4 4 0 1 1 6 3.5c-2 1-2 2-2 3M12 18v1",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6",
  volume: "M3 9h4l5-5v16l-5-5H3zM16 8s4 4 0 8M19 5s7 7 0 14",
  check: "m5 12 4 4L19 6",
  reset: "M3 10a9 9 0 1 1 2 8M3 4v6h6",
  share: "M12 16V3m-5 5 5-5 5 5M5 12H3v9h18v-9h-2",
  save: "M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7",
  menu: "M3 6h18M3 12h18M3 18h18",
};
export const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.pulse}"/></svg>`;
export const btn = (action: string, label: string, ic?: string, cls = "") =>
  `<button type="button" data-action="${action}" class="btn ${cls}" aria-label="${esc(label)}">${ic ? icon(ic) : ""}<span>${label}</span></button>`;
export const options = (
  items: (string | [string | number, string])[],
  value: unknown,
) =>
  items
    .map((item) => {
      const [v, text] = Array.isArray(item) ? item : [item, item];
      return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(text)}</option>`;
    })
    .join("");
export const select = (
  key: string,
  label: string,
  items: (string | [string | number, string])[],
  value: unknown,
  disabled = false,
) =>
  `<label class="field"><span>${label}</span><select data-key="${key}" ${disabled ? "disabled" : ""}>${options(items, value)}</select></label>`;
export const range = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  unit: string,
  disabled = false,
) =>
  `<label class="range-field"><span>${label}<output data-output="${key}" aria-label="${esc(label)}">${value} <small>${unit}</small></output></span><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}" ${disabled ? "disabled" : ""}/></label>`;
export const toggle = (key: string, label: string, value: boolean) =>
  `<label class="toggle"><input type="checkbox" data-key="${key}" ${value ? "checked" : ""}/><span>${label}</span></label>`;
