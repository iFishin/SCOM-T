import { useMemo, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "./ui/Input.tsx";
import { t } from "../i18n";
import type { Lang } from "../i18n";
import type { ResponseSetCommand } from "../hooks/useResponseSet";

type ResponseSetCommandEditorProps = {
  lang: Lang;
  commands: ResponseSetCommand[];
  onChange: (commands: ResponseSetCommand[]) => void;
};

const PLACEHOLDER_RE = /\{(\w+)\}/g;

function extractPlaceholders(command: string): string[] {
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(command)) !== null) names.add(m[1]);
  return [...names];
}

export function ResponseSetCommandEditor({ lang, commands, onChange }: ResponseSetCommandEditorProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function updateCommand(index: number, command: string) {
    const next = [...commands];
    next[index] = { ...next[index], command };
    onChange(next);
  }

  function updateField(index: number, patch: Partial<ResponseSetCommand>) {
    const next = [...commands];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function moveCommand(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= commands.length) return;
    const next = [...commands];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addExpectedResponse(cmdIndex: number) {
    const next = [...commands];
    const cmd = next[cmdIndex];
    const regex = cmd.expectedResponseRegex ? [...cmd.expectedResponseRegex] : [];
    next[cmdIndex] = {
      ...cmd,
      expectedResponses: [...cmd.expectedResponses, ""],
      expectedResponseRegex: [...regex, false],
    };
    onChange(next);
  }

  function updateExpectedResponse(cmdIndex: number, respIndex: number, text: string) {
    const next = [...commands];
    const responses = [...next[cmdIndex].expectedResponses];
    responses[respIndex] = text;
    next[cmdIndex] = { ...next[cmdIndex], expectedResponses: responses };
    onChange(next);
  }

  function toggleExpectedResponseRegex(cmdIndex: number, respIndex: number) {
    const next = [...commands];
    const cmd = next[cmdIndex];
    const regex = cmd.expectedResponseRegex ? [...cmd.expectedResponseRegex] : cmd.expectedResponses.map(() => false);
    regex[respIndex] = !regex[respIndex];
    next[cmdIndex] = { ...cmd, expectedResponseRegex: regex };
    onChange(next);
  }

  function removeExpectedResponse(cmdIndex: number, respIndex: number) {
    const next = [...commands];
    const cmd = next[cmdIndex];
    const regex = cmd.expectedResponseRegex ? [...cmd.expectedResponseRegex] : undefined;
    next[cmdIndex] = {
      ...cmd,
      expectedResponses: cmd.expectedResponses.filter((_, i) => i !== respIndex),
      expectedResponseRegex: regex ? regex.filter((_, i) => i !== respIndex) : undefined,
    };
    onChange(next);
  }

  function addCommand() {
    const newCmd: ResponseSetCommand = { command: "", expectedResponses: [], matchMode: "all" };
    onChange([...commands, newCmd]);
  }

  function removeCommand(index: number) {
    onChange(commands.filter((_, i) => i !== index));
  }

  // ── Unique group names for dropdown ──
  const allGroups = useMemo(() => {
    const set = new Set<string>();
    for (const c of commands) if (c.group) set.add(c.group);
    return [...set].sort();
  }, [commands]);

  // ── Compute group-to-command-index mapping ──
  const groups = useMemo(() => {
    const map = new Map<string, number[]>();
    for (let i = 0; i < commands.length; i++) {
      const g = commands[i].group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(i);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (!a && b) return 1;  // empty group ("未分组") last
      if (a && !b) return -1;
      return (a || "").localeCompare(b || "");
    });
  }, [commands]);

  function toggleGroup(group: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }

  // ── Shared helper: render one command card ──
  function renderCommand(cmd: ResponseSetCommand, i: number) {
    const placeholders = extractPlaceholders(cmd.command);
    return (
      <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-3 space-y-2">
        {/* ── Row 1: command + quick toggles ── */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)] font-mono w-5 shrink-0">#{i + 1}</span>
          <Input
            type="text"
            value={cmd.command}
            onChange={(e) => updateCommand(i, e.target.value)}
            placeholder={cmd.commandRegex
              ? (lang === "zh" ? "正则模式，如 AT\\+CSQ" : "Regex pattern, e.g. AT\\\\+CSQ")
              : (lang === "zh" ? "AT指令" : "AT Command")}
            className="flex-1 min-w-0 text-xs font-mono"
          />
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => updateField(i, { commandRegex: !cmd.commandRegex })}
              className={`px-1.5 py-0.5 text-[9px] font-mono rounded border transition-colors ${cmd.commandRegex ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-muted)]"}`}
              title={cmd.commandRegex ? (lang === "zh" ? "正则模式" : "Regex mode") : (lang === "zh" ? "文本模式" : "Text mode")}>
              {cmd.commandRegex ? ".*" : "Abc"}
            </button>
            <label className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] cursor-pointer select-none">
              <input type="checkbox" checked={cmd.isHex || false} onChange={(e) => updateField(i, { isHex: e.target.checked })} className="w-3 h-3 accent-[var(--accent)]" />
              <span>{t("response_set_is_hex", lang)}</span>
            </label>
            <button type="button" onClick={() => removeCommand(i)} className="text-rose-400 hover:text-rose-600 p-0.5" title={lang === "zh" ? "删除" : "Delete"}><Trash2 size={11} /></button>
          </div>
        </div>

        {/* ── Row 2: group + move + description ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 rounded border border-[var(--border)] px-1 py-0.5 bg-[var(--bg-input)]">
            <input type="text" value={cmd.group || ""} onChange={(e) => updateField(i, { group: e.target.value || undefined })} list="response-set-groups"
              placeholder={t("response_set_group_placeholder", lang)}
              className="w-20 text-[10px] text-[var(--text-primary)] bg-transparent outline-none" />
            <svg className="w-3 h-3 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => moveCommand(i, -1)} disabled={i === 0}
              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 disabled:cursor-not-allowed" title={t("response_set_move_up", lang)}><ArrowUp size={11} /></button>
            <button type="button" onClick={() => moveCommand(i, 1)} disabled={i === commands.length - 1}
              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 disabled:cursor-not-allowed" title={t("response_set_move_down", lang)}><ArrowDown size={11} /></button>
          </div>
          <input type="text" value={cmd.description || ""} onChange={(e) => updateField(i, { description: e.target.value || undefined })}
            placeholder={t("response_set_desc_placeholder", lang)}
            className="flex-1 min-w-[100px] rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] outline-none focus:border-[var(--accent)]" />
        </div>

        {/* ── Placeholder hint ── */}
        {placeholders.length > 0 && (
          <div className="text-[9px] text-amber-600 bg-amber-50 rounded px-2 py-1">{t("response_set_placeholders", lang, placeholders.join(", "))}</div>
        )}

        {/* ── Row 3: match mode + expected responses ── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
            <span>
              {cmd.matchMode === "all"
                ? (lang === "zh" ? "期望响应（按顺序全部匹配）：" : "Expected responses (match all in order):")
                : (lang === "zh" ? "期望响应（匹配任意一个即可）：" : "Expected responses (match any one):")}
            </span>
            <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] overflow-hidden">
              <button type="button" onClick={() => updateField(i, { matchMode: "all" })}
                className={`px-2 py-0.5 text-[9px] transition-colors ${cmd.matchMode === "all" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--bg-input)]"}`}>{t("response_set_match_all", lang)}</button>
              <button type="button" onClick={() => updateField(i, { matchMode: "any" })}
                className={`px-2 py-0.5 text-[9px] transition-colors ${cmd.matchMode === "any" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--bg-input)]"}`}>{t("response_set_match_any", lang)}</button>
            </div>
          </div>
          {cmd.expectedResponses.map((resp, j) => {
            const isRegex = cmd.expectedResponseRegex?.[j] ?? false;
            return (
              <div key={j} className="flex items-start gap-1.5">
                <button type="button" onClick={() => toggleExpectedResponseRegex(i, j)}
                  className={`shrink-0 mt-1 px-1.5 py-0.5 text-[9px] font-mono rounded border transition-colors ${isRegex ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)]"}`}
                  title={isRegex ? (lang === "zh" ? "正则模式" : "Regex mode") : (lang === "zh" ? "文本模式" : "Text mode")}>{isRegex ? ".*" : "Abc"}</button>
                <textarea value={resp} onChange={(e) => updateExpectedResponse(i, j, e.target.value)}
                  placeholder={isRegex ? (lang === "zh" ? "正则表达式，如 \\\\+CSQ:\\\\s+\\\\d+" : "Regex pattern, e.g. \\\\+CSQ:\\\\s+\\\\d+") : (lang === "zh" ? "输入期望响应内容..." : "Enter expected response text...")}
                  className="flex-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 resize-y outline-none focus:ring-1 focus:ring-[var(--accent)] font-mono min-h-[28px]"
                  rows={Math.max(1, (resp.match(/\n/g)?.length || 0) + 1)} />
                <button type="button" onClick={() => removeExpectedResponse(i, j)} className="text-rose-400 hover:text-rose-600 p-1 mt-1" title={lang === "zh" ? "删除" : "Remove"}><Trash2 size={10} /></button>
              </div>
            );
          })}
          <button type="button" onClick={() => addExpectedResponse(i)}
            className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] px-1 py-0.5">
            <Plus size={10} /> {t("response_set_add_expected", lang)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Global groups datalist */}
      <datalist id="response-set-groups">
        {allGroups.map((g) => <option key={g} value={g} />)}
      </datalist>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          {lang === "zh" ? `指令 (${commands.length})` : `Commands (${commands.length})`}
        </span>
        <button type="button" onClick={addCommand}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80">
          <Plus size={11} /> {lang === "zh" ? "添加指令" : "Add Command"}
        </button>
      </div>

      <div className="space-y-3">
        {groups.map(([group, indices]) => {
          const isCollapsed = collapsedGroups.has(group);
          const label = group || (lang === "zh" ? "未分组" : "Ungrouped");
          return (
            <div key={group}>
              {/* Group header */}
              <button type="button" onClick={() => toggleGroup(group)}
                className="flex items-center gap-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-left">
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                {label}
                <span className="ml-auto text-[9px] opacity-50">({indices.length})</span>
              </button>
              {!isCollapsed && (
                <div className="mt-2 space-y-3 pl-2 border-l-2 border-[var(--border)]">
                  {indices.map((i) => renderCommand(commands[i], i))}
                </div>
              )}
            </div>
          );
        })}

        {commands.length === 0 && (
          <div className="text-xs text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-lg">
            {lang === "zh" ? "点击「添加指令」添加AT指令及期望响应" : 'Click "Add Command" to add AT commands and expected responses'}
          </div>
        )}
      </div>
    </div>
  );
}

export default ResponseSetCommandEditor;
