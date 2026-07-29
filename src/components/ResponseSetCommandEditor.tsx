import { Plus, Trash2 } from "lucide-react";
import { Input } from "./ui/Input.tsx";
import { t } from "../i18n";
import type { Lang } from "../i18n";
import type { ResponseSetCommand } from "../hooks/useResponseSet";

type ResponseSetCommandEditorProps = {
  lang: Lang;
  commands: ResponseSetCommand[];
  onChange: (commands: ResponseSetCommand[]) => void;
};

export function ResponseSetCommandEditor({ lang, commands, onChange }: ResponseSetCommandEditorProps) {
  function updateCommand(index: number, command: string) {
    const next = [...commands];
    next[index] = { ...next[index], command };
    onChange(next);
  }

  function updateCommandRegex(index: number, commandRegex: boolean) {
    const next = [...commands];
    next[index] = { ...next[index], commandRegex };
    onChange(next);
  }

  function updateMatchMode(index: number, matchMode: "all" | "any") {
    const next = [...commands];
    next[index] = { ...next[index], matchMode };
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
    const cmd = next[cmdIndex];
    const responses = [...cmd.expectedResponses];
    responses[respIndex] = text;
    next[cmdIndex] = { ...cmd, expectedResponses: responses };
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

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          {lang === "zh" ? `指令 (${commands.length})` : `Commands (${commands.length})`}
        </span>
        <button
          type="button"
          onClick={addCommand}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80"
        >
          <Plus size={11} />
          {lang === "zh" ? "添加指令" : "Add Command"}
        </button>
      </div>

      <div className="space-y-3">
        {commands.map((cmd, i) => (
          <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-3 space-y-2">
            {/* Command header */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-muted)] font-mono w-5">#{i + 1}</span>
              <Input
                type="text"
                value={cmd.command}
                onChange={(e) => updateCommand(i, e.target.value)}
                placeholder={cmd.commandRegex ? (lang === "zh" ? "正则模式，如 AT\\+CSQ" : "Regex pattern, e.g. AT\\\\+CSQ") : (lang === "zh" ? "AT指令" : "AT Command")}
                className="flex-1 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => updateCommandRegex(i, !cmd.commandRegex)}
                className={`shrink-0 px-1.5 py-0.5 text-[9px] font-mono rounded border transition-colors ${
                  cmd.commandRegex
                    ? "bg-amber-100 border-amber-300 text-amber-700"
                    : "bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)]"
                }`}
                title={cmd.commandRegex
                  ? (lang === "zh" ? "正则模式，点击切换为文本" : "Regex mode, click for text")
                  : (lang === "zh" ? "文本模式，点击切换为正则" : "Text mode, click for regex")
                }
              >
                {cmd.commandRegex ? ".*" : "Abc"}
              </button>
              {/* Match mode toggle */}
              <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => updateMatchMode(i, "all")}
                  className={`px-2 py-1 text-[10px] transition-colors ${
                    cmd.matchMode === "all"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  }`}
                  title={lang === "zh" ? "全部匹配（顺序）" : "Match all (sequential)"}
                >
                  {t("response_set_match_all", lang)}
                </button>
                <button
                  type="button"
                  onClick={() => updateMatchMode(i, "any")}
                  className={`px-2 py-1 text-[10px] transition-colors ${
                    cmd.matchMode === "any"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  }`}
                  title={lang === "zh" ? "任意匹配" : "Match any"}
                >
                  {t("response_set_match_any", lang)}
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeCommand(i)}
                className="text-rose-500 hover:text-rose-600 p-1"
                title={lang === "zh" ? "删除指令" : "Delete command"}
              >
                <Trash2 size={12} />
              </button>
            </div>

            {/* Expected responses */}
            <div className="space-y-1.5 pl-7">
              <div className="text-[10px] text-[var(--text-muted)]">
                {cmd.matchMode === "all"
                  ? (lang === "zh" ? "期望响应（按顺序全部匹配）：" : "Expected responses (match all in order):")
                  : (lang === "zh" ? "期望响应（匹配任意一个即可）：" : "Expected responses (match any one):")
                }
              </div>
              {cmd.expectedResponses.map((resp, j) => {
                const isRegex = cmd.expectedResponseRegex?.[j] ?? false;
                return (
                  <div key={j} className="flex items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleExpectedResponseRegex(i, j)}
                      className={`shrink-0 mt-1 px-1.5 py-0.5 text-[9px] font-mono rounded border transition-colors ${
                        isRegex
                          ? "bg-amber-100 border-amber-300 text-amber-700"
                          : "bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)]"
                      }`}
                      title={isRegex
                        ? (lang === "zh" ? "当前为正则模式，点击切换为文本" : "Regex mode, click for text")
                        : (lang === "zh" ? "当前为文本模式，点击切换为正则" : "Text mode, click for regex")
                      }
                    >
                      {isRegex ? ".*" : "Abc"}
                    </button>
                    <textarea
                      value={resp}
                      onChange={(e) => updateExpectedResponse(i, j, e.target.value)}
                      placeholder={isRegex
                        ? (lang === "zh" ? "正则表达式，如 \\\\+CSQ:\\\\s+\\\\d+" : "Regex pattern, e.g. \\\\+CSQ:\\\\s+\\\\d+")
                        : (lang === "zh" ? "输入期望响应内容..." : "Enter expected response text...")
                      }
                      className="flex-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)] font-mono min-h-[28px]"
                      rows={Math.max(1, (resp.match(/\n/g)?.length || 0) + 1)}
                    />
                    <button
                      type="button"
                      onClick={() => removeExpectedResponse(i, j)}
                      className="text-rose-400 hover:text-rose-600 p-1 mt-1"
                      title={lang === "zh" ? "删除" : "Remove"}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => addExpectedResponse(i)}
                className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] px-1 py-0.5"
              >
                <Plus size={10} />
                {t("response_set_add_expected", lang)}
              </button>
            </div>
          </div>
        ))}
        {commands.length === 0 && (
          <div className="text-xs text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-lg">
            {lang === "zh" ? "点击「添加指令」添加AT指令及期望响应" : 'Click "Add Command" to add AT commands and expected responses'}
          </div>
        )}
      </div>
    </div>
  );
}
