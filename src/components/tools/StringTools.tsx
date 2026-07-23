import { useCallback, useState } from "react";
import { Copy, Check, ClipboardPaste, RefreshCw, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { Lang } from "../../i18n.ts";

// ── Shared modal wrapper ──

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex w-[480px] max-w-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
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

// ── String Generator ──

type CharSet = {
  upper: boolean;
  lower: boolean;
  digits: boolean;
  special: boolean;
  space: boolean;
};

const SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?";

// ── String Generator ──

export function StringGeneratorDialog({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const [charSet, setCharSet] = useState<CharSet>({ upper: true, lower: true, digits: true, special: false, space: false });
  const [length, setLength] = useState(16);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);

  const activeCount = Object.values(charSet).filter(Boolean).length;

  const toggle = (key: keyof CharSet) => setCharSet((c) => ({ ...c, [key]: !c[key] }));

  const buildPool = useCallback(() => {
    let pool = "";
    if (charSet.upper) pool += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (charSet.lower) pool += "abcdefghijklmnopqrstuvwxyz";
    if (charSet.digits) pool += "0123456789";
    if (charSet.special) pool += SPECIAL_CHARS;
    if (charSet.space) pool += " ";
    return pool;
  }, [charSet]);

  const pool = buildPool();

  const generate = useCallback(() => {
    if (!pool) return;
    let s = "";
    for (let i = 0; i < length; i++) {
      s += pool[Math.floor(Math.random() * pool.length)];
    }
    setResult(s);
    setCopied(false);
  }, [pool, length]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, [result]);

  const preset = useCallback((chars: Partial<CharSet>, len: number) => {
    setCharSet((c) => ({ ...c, ...chars }));
    setLength(len);
    setResult("");
  }, []);

  const btnClass = (active: boolean) =>
    `rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
      active
        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] shadow-sm"
        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/5"
    }`;

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${
      active
        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
    }`;

  return (
    <DialogShell title={lang === "zh" ? "字符串生成器" : "String Generator"} onClose={onClose}>
      <div className="space-y-5">
        {/* ── Quick presets ── */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {lang === "zh" ? "快速预设" : "Quick Presets"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => preset({ upper: true, lower: true, digits: true, special: false, space: false }, 16)} className={chipClass(false)}>
              {lang === "zh" ? "密码" : "Password"}
            </button>
            <button type="button" onClick={() => preset({ upper: false, lower: true, digits: true, special: false, space: false }, 6)} className={chipClass(false)}>
              {lang === "zh" ? "验证码" : "SMS Code"}
            </button>
            <button type="button" onClick={() => preset({ upper: false, lower: false, digits: true, special: false, space: false }, 4)} className={chipClass(false)}>
              PIN
            </button>
            <button type="button" onClick={() => preset({ upper: false, lower: false, digits: true, special: false, space: false }, 8)} className={chipClass(false)}>
              {lang === "zh" ? "数字串" : "Numeric"}
            </button>
            <button type="button" onClick={() => preset({ upper: true, lower: true, digits: true, special: true, space: true }, 24)} className={chipClass(false)}>
              {lang === "zh" ? "强密码" : "Strong"}
            </button>
            <button type="button" onClick={() => preset({ upper: true, lower: false, digits: false, special: false, space: false }, 1)} className={chipClass(false)}>
              {lang === "zh" ? "大写字母" : "Uppercase"}
            </button>
          </div>
        </div>

        {/* ── Character sets ── */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {lang === "zh" ? "字符池" : "Character Pool"} <span className="font-normal lowercase text-[var(--text-muted)]/60">({pool.length || 0} {lang === "zh" ? "个字符" : "chars"})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => toggle("upper")} className={btnClass(charSet.upper)}>
              <span className="text-sm">A-Z</span>
              <span className="ml-1.5 text-[10px] opacity-70">{lang === "zh" ? "大写" : "Upper"}</span>
            </button>
            <button type="button" onClick={() => toggle("lower")} className={btnClass(charSet.lower)}>
              <span className="text-sm">a-z</span>
              <span className="ml-1.5 text-[10px] opacity-70">{lang === "zh" ? "小写" : "Lower"}</span>
            </button>
            <button type="button" onClick={() => toggle("digits")} className={btnClass(charSet.digits)}>
              <span className="text-sm">0-9</span>
              <span className="ml-1.5 text-[10px] opacity-70">{lang === "zh" ? "数字" : "Digits"}</span>
            </button>
            <button type="button" onClick={() => toggle("special")} className={btnClass(charSet.special)}>
              <span className="text-sm">!@#$%</span>
              <span className="ml-1.5 text-[10px] opacity-70">{lang === "zh" ? "特殊" : "Special"}</span>
            </button>
            <button type="button" onClick={() => toggle("space")} className={btnClass(charSet.space)}>
              <span className="text-sm">␣</span>
              <span className="ml-1.5 text-[10px] opacity-70">{lang === "zh" ? "空格" : "Space"}</span>
            </button>
          </div>
          {!activeCount && (
            <p className="mt-1.5 text-[10px] text-rose-500">{lang === "zh" ? "请至少选择一种字符类型" : "Select at least one character type"}</p>
          )}
        </div>

        {/* ── Length ── */}
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <span>{lang === "zh" ? "长度" : "Length"}</span>
            <span className="font-mono text-[var(--text-primary)]">{length}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={256}
              value={length}
              onChange={(e) => { setLength(Number(e.currentTarget.value)); setResult(""); }}
              className="flex-1 h-1.5 rounded-full appearance-none bg-[var(--border)] accent-[var(--accent)] cursor-pointer"
              style={{ accentColor: "var(--accent)" }}
            />
            <Input
              type="number"
              min={1}
              max={9999}
              value={String(length)}
              onChange={(e) => { setLength(Math.max(1, Math.min(9999, Number(e.currentTarget.value) || 1))); setResult(""); }}
              className="w-16 text-center text-xs"
            />
          </div>
        </div>

        {/* ── Generate button ── */}
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={generate}
          disabled={!activeCount}
          className="w-full justify-center py-2 text-sm font-semibold"
        >
          <span className="flex items-center justify-center gap-1.5"><RefreshCw size={15} /> {lang === "zh" ? "生 成" : "Generate"}</span>
        </Button>

        {/* ── Result ── */}
        {result && (
          <div className="rounded-xl border-2 border-[var(--accent)]/20 bg-[var(--bg-input)] p-4">
            <div className="mb-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span>{result.length} {lang === "zh" ? "个字符" : "chars"}</span>
              <span>{new TextEncoder().encode(result).length} {lang === "zh" ? "字节" : "bytes"}</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="flex-1 max-h-32 overflow-y-auto rounded-lg bg-[var(--bg-surface)] px-3 py-2 border border-[var(--border)]"><code className="break-all whitespace-pre-wrap text-sm font-mono text-[var(--text-primary)] leading-relaxed select-all">
                {result}
              </code></div>
              <button
                type="button"
                onClick={handleCopy}
                className={`shrink-0 rounded-lg border p-2.5 transition-all ${
                  copied
                    ? "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-700 dark:bg-emerald-950"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/5"
                }`}
                title={lang === "zh" ? "复制" : "Copy"}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </DialogShell>
  );
}

// ── String Checker ──

export function StringCheckerDialog({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const [text, setText] = useState("");
  const stats = {
    chars: text.length,
    bytes: new TextEncoder().encode(text).length,
    lines: text ? text.split("\n").length : 0,
    words: text ? text.trim().split(/\s+/).filter(Boolean).length : 0,
    spaces: (text.match(/ /g) || []).length,
  };

  const handlePaste = useCallback(async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
    } catch { /* ignore */ }
  }, []);

  return (
    <DialogShell title={lang === "zh" ? "字符串检查" : "String Checker"} onClose={onClose}>
      <div className="space-y-3">
        {/* Input */}
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            placeholder={lang === "zh" ? "在此输入或粘贴文本…" : "Type or paste text here…"}
            spellCheck={false}
            rows={4}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)] placeholder:opacity-60"
          />
          <button
            type="button"
            onClick={handlePaste}
            className="absolute right-2 top-2 rounded p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
            title={lang === "zh" ? "从剪贴板粘贴" : "Paste from clipboard"}
          >
            <ClipboardPaste size={14} />
          </button>
        </div>

        {/* Stats */}
        {text && (
          <div className="grid grid-cols-2 gap-2">
            <Stat label={lang === "zh" ? "字符数" : "Characters"} value={stats.chars} />
            <Stat label={lang === "zh" ? "字节数" : "Bytes"} value={stats.bytes} />
            <Stat label={lang === "zh" ? "行数" : "Lines"} value={stats.lines} />
            <Stat label={lang === "zh" ? "单词数" : "Words"} value={stats.words} />
            <Stat label={lang === "zh" ? "空格数" : "Spaces"} value={stats.spaces} />
          </div>
        )}
        {!text && (
          <div className="py-6 text-center text-xs text-[var(--text-muted)] opacity-60">
            {lang === "zh" ? "输入文本后将自动显示统计信息" : "Statistics will appear once you enter text"}
          </div>
        )}
      </div>
    </DialogShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-lg font-bold font-mono text-[var(--text-primary)]">{value.toLocaleString()}</div>
    </div>
  );
}
