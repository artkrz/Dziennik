import { describe, it, expect } from "vitest";
import { isTheme, readStoredTheme, resolveTheme, THEMES } from "./theme";

describe("isTheme", () => {
  for (const theme of THEMES) {
    it(`accepts "${theme}"`, () => {
      expect(isTheme(theme)).toBe(true);
    });
  }

  it('rejects "blue"', () => {
    expect(isTheme("blue")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isTheme("")).toBe(false);
  });

  it("rejects null", () => {
    expect(isTheme(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isTheme(undefined)).toBe(false);
  });

  it("rejects a number", () => {
    expect(isTheme(1)).toBe(false);
  });
});

describe("readStoredTheme", () => {
  it("returns the stored value when it is a valid theme", () => {
    const storage = { getItem: () => "dark" };
    expect(readStoredTheme(storage)).toBe("dark");
  });

  it('returns "system" for an unknown string', () => {
    const storage = { getItem: () => "blue" };
    expect(readStoredTheme(storage)).toBe("system");
  });

  it('returns "system" when nothing is stored (null)', () => {
    const storage = { getItem: () => null };
    expect(readStoredTheme(storage)).toBe("system");
  });

  it('returns "system" when no storage is passed', () => {
    expect(readStoredTheme()).toBe("system");
  });

  it('returns "system" when getItem throws (private browsing)', () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredTheme(storage)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it('"light" ignores prefersDark = true', () => {
    expect(resolveTheme("light", true)).toBe("light");
  });

  it('"light" ignores prefersDark = false', () => {
    expect(resolveTheme("light", false)).toBe("light");
  });

  it('"dark" ignores prefersDark = true', () => {
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it('"dark" ignores prefersDark = false', () => {
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it('"system" follows prefersDark = true', () => {
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it('"system" follows prefersDark = false', () => {
    expect(resolveTheme("system", false)).toBe("light");
  });
});
