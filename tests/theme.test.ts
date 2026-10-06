import { describe, expect, it } from "vitest";
import { preferredTheme } from "../src/ui/theme";

describe("preferredTheme", () => {
  it("a stored choice wins over the system preference", () => {
    expect(preferredTheme("light", true)).toBe("light");
    expect(preferredTheme("dark", false)).toBe("dark");
  });
  it("falls back to prefers-color-scheme when nothing valid is stored", () => {
    expect(preferredTheme(null, true)).toBe("dark");
    expect(preferredTheme(null, false)).toBe("light");
    expect(preferredTheme("sepia", true)).toBe("dark");
  });
});
