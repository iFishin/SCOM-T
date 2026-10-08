import { describe, it, expect } from "vitest";
import { highlightYaml, formatYaml } from "./yamlHighlighter";

/** Remove highlight spans and undo HTML escaping. */
function strip(html: string): string {
  return html
    .replace(/<span[^>]*>/g, "")
    .replace(/<\/span>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const SAMPLES = [
  "Commands:\n  - command: 'AT+CSQ'\n    hex_mode: false\n    timeout: 0\n",
  "key: value # trailing comment\n",
  "a: <b> & \"c\"\n",
  "nums: [1, -2, 3.5, 1e3]\n",
  "bools: [true, false]\nnulls: [null, ~]\n",
  "weird: 'it''s'\n",
  "no: colon\n",
  "",
  "\n\n",
];

describe("highlightYaml", () => {
  it("returns empty string for empty input", () => {
    expect(highlightYaml("")).toBe("");
  });

  it("never loses or reorders text (strip + unescape reproduces input)", () => {
    for (const text of SAMPLES) {
      expect(strip(highlightYaml(text))).toBe(text);
    }
  });

  it("escapes HTML special characters", () => {
    const html = highlightYaml("a: <b> & c\n");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
    expect(html).toContain("&amp;");
    // No raw tag characters leaked.
    expect(html.replace(/<span[^>]*>|<\/span>/g, "")).not.toMatch(/[<>]/);
  });

  it("tags keys, strings, numbers, bools and comments", () => {
    const html = highlightYaml("key: 'v'\nn: 12\nb: true\n# c\n");
    expect(html).toContain("hl-yaml-key");
    expect(html).toContain("hl-yaml-string");
    expect(html).toContain("hl-yaml-number");
    expect(html).toContain("hl-yaml-bool");
    expect(html).toContain("hl-yaml-comment");
  });

  it("marks the current search hit differently from other hits", () => {
    const text = "abc abc";
    const html = highlightYaml(text, [{ start: 0, end: 3 }, { start: 4, end: 7 }], 1);
    expect(html).toContain("hl-search-current");
    expect(html).toContain("hl-search-match");
    expect(strip(html)).toBe(text);
  });

  it("keeps text intact when a search range overlaps a syntax token", () => {
    const text = "key: value";
    const html = highlightYaml(text, [{ start: 0, end: 3 }], 0);
    expect(strip(html)).toBe(text);
  });
});

describe("formatYaml", () => {
  it("normalises indentation and round-trips content", () => {
    const out = formatYaml("a:\n    b: 1");
    expect(out).toContain("a:");
    expect(out).toContain("b: 1");
  });

  it("returns empty string for empty input", () => {
    expect(formatYaml("   ")).toBe("");
  });

  it("returns empty string for invalid YAML", () => {
    expect(formatYaml("a: [1, 2")).toBe("");
  });
});
