import { useMemo, useState } from "react";
import { Copy, Check, ArrowDownUp, X } from "lucide-react";
import type { Lang } from "../../i18n.ts";

// ── Shared DialogShell (imported locally for simplicity) ──

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex w-[520px] max-w-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ── Encoding modes ──

type CodecMode = "ascii" | "hex" | "base64" | "bin" | "url";

const MODES: { key: CodecMode; labelZh: string; labelEn: string }[] = [
  { key: "ascii", labelZh: "ASCII ↔ 文本", labelEn: "ASCII ↔ Text" },
  { key: "hex", labelZh: "HEX ↔ 文本", labelEn: "Hex ↔ Text" },
  { key: "base64", labelZh: "Base64 ↔ 文本", labelEn: "Base64 ↔ Text" },
  { key: "bin", labelZh: "二进制 ↔ 文本", labelEn: "Binary ↔ Text" },
  { key: "url", labelZh: "URL ↔ 文本", labelEn: "URL ↔ Text" },
];

function encode(mode: CodecMode, input: string, direction: "encode" | "decode"): string {
  if (!input) return "";
  try {
    switch (mode) {
      case "ascii":
        if (direction === "encode") {
          // Text → ASCII codes
          return Array.from(input).map((c) => c.charCodeAt(0).toString()).join(" ");
        } else {
          // ASCII codes → Text
          return input
            .split(/\s+/)
            .map((s) => {
              const n = Number(s);
              if (isNaN(n) || n < 0 || n > 255) return `�`;
              return String.fromCharCode(n);
            })
            .join("");
        }
      case "hex":
        if (direction === "encode") {
          return Array.from(new TextEncoder().encode(input))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
        } else {
          const clean = input.replace(/\s+/g, "");
          if (!/^[0-9a-fA-F]*$/.test(clean)) return "⚠ Invalid hex";
          const bytes = new Uint8Array(
            clean.match(/.{1,2}/g)?.map((s) => parseInt(s, 16)) ?? []
          );
          return new TextDecoder().decode(bytes);
        }
      case "base64":
        if (direction === "encode") {
          return btoa(input);
        } else {
          return atob(input);
        }
      case "bin":
        if (direction === "encode") {
          return Array.from(new TextEncoder().encode(input))
            .map((b) => b.toString(2).padStart(8, "0"))
            .join(" ");
        } else {
          const clean = input.replace(/\s+/g, "");
          if (!/^[01]*$/.test(clean)) return "⚠ Invalid binary";
          const bytes = new Uint8Array(
            clean.match(/.{1,8}/g)?.map((s) => parseInt(s, 2)) ?? []
          );
          return new TextDecoder().decode(bytes);
        }
      case "url":
        if (direction === "encode") {
          return encodeURIComponent(input);
        } else {
          return decodeURIComponent(input);
        }
    }
  } catch {
    return `⚠ Error: invalid ${direction === "encode" ? "input" : "encoded"} data`;
  }
}

// ── Component ──

export function CodecDialog({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const [mode, setMode] = useState<CodecMode>("hex");
  const [input, setInput] = useState("");
  const [direction, setDirection] = useState<"encode" | "decode">("encode");
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => encode(mode, input, direction), [mode, input, direction]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const swapDirection = () => {
    setDirection((d) => (d === "encode" ? "decode" : "encode"));
  };

  return (
    <DialogShell title={lang === "zh" ? "编码转换" : "Codec Tool"} onClose={onClose}>
      <div className="space-y-4">
        {/* ── Mode tabs ── */}
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => { setMode(m.key); setInput(""); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m.key
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              }`}
            >
              {lang === "zh" ? m.labelZh : m.labelEn}
            </button>
          ))}
        </div>

        {/* ── Direction toggle ── */}
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <span className={`font-medium ${direction === "encode" ? "text-[var(--accent)]" : ""}`}>
            {lang === "zh" ? (mode === "ascii" || mode === "hex" || mode === "bin" ? "文本" : mode === "url" ? "普通文本" : "原文") : "Plain"}
          </span>
          <button
            type="button"
            onClick={swapDirection}
            className="rounded-md border border-[var(--border)] p-1 text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            title={lang === "zh" ? "交换方向" : "Swap direction"}
          >
            <ArrowDownUp size={14} />
          </button>
          <span className={`font-medium ${direction === "decode" ? "text-[var(--accent)]" : ""}`}>
            {lang === "zh" ? (mode === "ascii" || mode === "hex" || mode === "bin" ? "编码" : "编码后") : "Encoded"}
          </span>
        </div>

        {/* ── Input ── */}
        <div>
          <div className="mb-1 text-[11px] font-semibold text-[var(--text-muted)]">
            {lang === "zh" ? "输入" : "Input"}
            {mode === "hex" && direction === "decode" && (
              <span className="ml-1.5 font-normal opacity-60">(hex bytes, space separated)</span>
            )}
            {mode === "ascii" && direction === "decode" && (
              <span className="ml-1.5 font-normal opacity-60">(decimal codes, space separated)</span>
            )}
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder={
              mode === "hex" ? "e.g. 48 65 6C 6C 6F" :
              mode === "ascii" ? (direction === "encode" ? "e.g. Hello" : "e.g. 72 101 108 108 111") :
              "Enter text..."
            }
            spellCheck={false}
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)] placeholder:opacity-50"
          />
        </div>

        {/* ── Output ── */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)]">
            <span>{lang === "zh" ? "输出" : "Output"}</span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!output || output.startsWith("⚠")}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                copied
                  ? "text-emerald-500"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
              }`}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? (lang === "zh" ? "已复制" : "Copied") : (lang === "zh" ? "复制" : "Copy")}
            </button>
          </div>
          <div className={`min-h-[52px] rounded-lg border px-3 py-2 text-xs font-mono leading-relaxed break-all whitespace-pre-wrap ${
            output.startsWith("⚠")
              ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400"
              : output
                ? "border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)]"
                : "border-dashed border-[var(--border)] text-[var(--text-muted)] opacity-40"
          }`}>
            {output || (lang === "zh" ? "结果将显示在这里" : "Result will appear here")}
          </div>
        </div>
      </div>
    </DialogShell>
  );
}
