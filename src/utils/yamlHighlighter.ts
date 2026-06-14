import yaml from "js-yaml";
import type { MatchRange } from "../hooks/useSearch.ts";

/* ── Regex token patterns ── */
const KEY_PATTERN = /^(\s*[\w._-]+(?=\s*:))/gm;
const COMMENT_PATTERN = /(#.*)$/gm;
const QUOTED_STRING_PATTERN = /'[^']*'|"(?:[^"\\]|\\.)*"/g;
const BOOL_PATTERN = /\b(true|false)\b/g;
const NULL_PATTERN = /\b(null|~)\b/g;
const NUMBER_PATTERN = /\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g;

type Token = { start: number; end: number; cls: string };

/** Escape HTML special characters */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Collect all YAML syntax tokens from text */
function syntaxTokens(text: string): Token[] {
  const tokens: Token[] = [];
  const patterns: [RegExp, string][] = [
    [COMMENT_PATTERN, "hl-yaml-comment"],
    [KEY_PATTERN, "hl-yaml-key"],
    [QUOTED_STRING_PATTERN, "hl-yaml-string"],
    [BOOL_PATTERN, "hl-yaml-bool"],
    [NULL_PATTERN, "hl-yaml-null"],
    [NUMBER_PATTERN, "hl-yaml-number"],
  ];

  for (const [re, cls] of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, cls });
    }
  }

  // Sort by start position, then by end position (longer wins for overlaps within same category)
  tokens.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  return tokens;
}

/**
 * Produce highlighted HTML from YAML text.
 * Optional search match ranges are rendered with higher priority than syntax tokens.
 */
export function highlightYaml(
  text: string,
  searchMatches?: MatchRange[],
  searchCurrentIndex?: number,
): string {
  if (!text) return "";

  const syntax = syntaxTokens(text);
  const search: Token[] = (searchMatches ?? []).map((m, i) => ({
    start: m.start,
    end: m.end,
    cls: i === searchCurrentIndex ? "hl-search-current" : "hl-search-match",
  }));

  // Merge tokens: search wins over syntax on overlap
  const all = [...search, ...syntax].sort((a, b) => {
    const byStart = a.start - b.start;
    if (byStart !== 0) return byStart;
    // When starts tie: search tokens first, then longer syntax tokens
    const aPrio = a.cls.startsWith("hl-search") ? 0 : 1;
    const bPrio = b.cls.startsWith("hl-search") ? 0 : 1;
    return aPrio - bPrio || (b.end - b.start) - (a.end - a.start);
  });

  // Remove tokens fully occluded by a higher-priority token at the same position
  const cleaned: Token[] = [];
  for (const t of all) {
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      if (t.start < prev.end) {
        // Overlap: keep only if this token has higher priority (search) or extends beyond
        if (t.cls.startsWith("hl-search") && !prev.cls.startsWith("hl-search")) {
          cleaned[cleaned.length - 1] = t; // replace
        }
        continue;
      }
    }
    cleaned.push(t);
  }

  // Build HTML
  const parts: string[] = [];
  let cursor = 0;

  for (const t of cleaned) {
    if (t.start > cursor) {
      parts.push(escHtml(text.slice(cursor, t.start)));
    }
    parts.push(`<span class="${t.cls}">${escHtml(text.slice(t.start, t.end))}</span>`);
    cursor = t.end;
  }

  if (cursor < text.length) {
    parts.push(escHtml(text.slice(cursor)));
  }

  return parts.join("");
}

/**
 * Format YAML text by re-parsing and re-dumping through js-yaml.
 * Returns empty string on parse error (caller handles error display).
 */
export function formatYaml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  try {
    const parsed = yaml.load(trimmed);
    if (parsed === undefined || parsed === null) return "";
    return yaml.dump(parsed, { indent: 2, lineWidth: -1, noRefs: true, quotingType: "'" });
  } catch {
    return "";
  }
}
