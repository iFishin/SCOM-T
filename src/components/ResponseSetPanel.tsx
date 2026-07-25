import { useEffect, useState } from "react";
import { ChevronRight, FileText, FolderOpen, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "./ui/Button.tsx";
import { Input } from "./ui/Input.tsx";
import { t } from "../i18n";
import type { Lang } from "../i18n";
import { useResponseSet, type ResponseSet, type ResponseSetCommand } from "../hooks/useResponseSet";

type ResponseSetPanelProps = {
  lang: Lang;
  promptRows: { id: number; command: string }[];
  onApply: (updates: { rowId: number; expectedResponses: string[] }[]) => void;
  onClose: () => void;
};

export function ResponseSetPanel({ lang, promptRows, onApply, onClose }: ResponseSetPanelProps) {
  const { listResponseSets, loadResponseSet, saveResponseSet, deleteResponseSet, applyToGrid } = useResponseSet();
  const [setNames, setSetNames] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [currentSet, setCurrentSet] = useState<ResponseSet | null>(null);
  const [dirty, setDirty] = useState(false);

  // Load list of response sets on mount
  useEffect(() => {
    listResponseSets().then((names) => {
      setSetNames(names);
      if (names.length > 0) {
        setSelectedName(names[0]);
      }
    });
  }, []);

  // Load selected response set
  useEffect(() => {
    if (selectedName) {
      loadResponseSet(selectedName).then((set) => {
        setCurrentSet(set);
        setDirty(false);
      });
    } else {
      setCurrentSet(null);
    }
  }, [selectedName]);

  function handleCreateNew() {
    const baseName = lang === "zh" ? "新响应集" : "New Response Set";
    const newName = `${baseName}_${Date.now()}`;
    const newSet: ResponseSet = {
      id: newName,
      name: baseName,
      commands: [],
    };
    saveResponseSet(newName, newSet).then(() => {
      setSetNames((prev) => [...prev, newName].sort());
      setSelectedName(newName);
    });
  }

  function handleDelete() {
    if (!selectedName) return;
    deleteResponseSet(selectedName).then(() => {
      setSetNames((prev) => prev.filter((n) => n !== selectedName));
      setSelectedName(null);
      setCurrentSet(null);
    });
  }

  function handleSave() {
    if (!currentSet || !selectedName) return;
    saveResponseSet(selectedName, currentSet).then(() => {
      setDirty(false);
    });
  }

  function handleApplyToGrid() {
    if (!currentSet) return;
    const updates = applyToGrid(currentSet, promptRows);
    if (updates.length === 0) {
      // No matches — could show a toast, but we can't here, just close
    }
    onApply(updates);
  }

  function updateSetField(field: "name" | "description", value: string) {
    if (!currentSet) return;
    setCurrentSet({ ...currentSet, [field]: value });
    setDirty(true);
  }

  function updateCommand(index: number, command: string) {
    if (!currentSet) return;
    const commands = [...currentSet.commands];
    commands[index] = { ...commands[index], command };
    setCurrentSet({ ...currentSet, commands });
    setDirty(true);
  }

  function updateExpectedResponses(index: number, text: string) {
    if (!currentSet) return;
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    const commands = [...currentSet.commands];
    commands[index] = { ...commands[index], expectedResponses: lines };
    setCurrentSet({ ...currentSet, commands });
    setDirty(true);
  }

  function addCommand() {
    if (!currentSet) return;
    const newCmd: ResponseSetCommand = { command: "", expectedResponses: [] };
    setCurrentSet({ ...currentSet, commands: [...currentSet.commands, newCmd] });
    setDirty(true);
  }

  function removeCommand(index: number) {
    if (!currentSet) return;
    setCurrentSet({
      ...currentSet,
      commands: currentSet.commands.filter((_, i) => i !== index),
    });
    setDirty(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[80vh] w-[700px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{t("response_set", lang)}</div>
            <div className="text-xs text-[var(--text-muted)]">{t("response_set_desc", lang)}</div>
          </div>
          <Button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            title={lang === "zh" ? "关闭" : "Close"}
          >
            <X size={16} />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left sidebar: response set list */}
          <div className="w-44 shrink-0 border-r border-[var(--border)] p-2 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t("response_set_list", lang)}
              </span>
              <Button
                type="button"
                onClick={handleCreateNew}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--accent)]"
                title={lang === "zh" ? "新建" : "New"}
              >
                <Plus size={14} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {setNames.map((name) => (
                <Button
                  key={name}
                  type="button"
                  onClick={() => setSelectedName(name)}
                  className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                    selectedName === name
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <FileText size={12} />
                  <span className="truncate">{name.replace(/_\d+$/, "")}</span>
                </Button>
              ))}
              {setNames.length === 0 && (
                <div className="text-[10px] text-[var(--text-muted)] text-center py-4">
                  {lang === "zh" ? "暂无响应集" : "No response sets"}
                </div>
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-[var(--border)]">
              <Button
                type="button"
                onClick={() => {
                  const { openResponseSetsDir } = useResponseSet();
                  openResponseSetsDir();
                }}
                className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                <FolderOpen size={11} />
                {lang === "zh" ? "打开文件夹" : "Open Folder"}
              </Button>
            </div>
          </div>

          {/* Right: response set editor */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {currentSet ? (
              <div className="flex flex-1 flex-col min-h-0">
                {/* Name and description */}
                <div className="border-b border-[var(--border)] p-3 space-y-2">
                  <Input
                    type="text"
                    value={currentSet.name}
                    onChange={(e) => updateSetField("name", e.target.value)}
                    placeholder={lang === "zh" ? "响应集名称" : "Response Set Name"}
                    className="w-full text-sm"
                  />
                  <Input
                    type="text"
                    value={currentSet.description || ""}
                    onChange={(e) => updateSetField("description", e.target.value)}
                    placeholder={lang === "zh" ? "描述（可选）" : "Description (optional)"}
                    className="w-full text-xs"
                  />
                </div>

                {/* Commands list */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {lang === "zh" ? `指令 (${currentSet.commands.length})` : `Commands (${currentSet.commands.length})`}
                    </span>
                    <Button
                      type="button"
                      onClick={addCommand}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] bg-[var(--accent)] text-white hover:opacity-80"
                    >
                      <Plus size={10} />
                      {lang === "zh" ? "添加指令" : "Add"}
                    </Button>
                  </div>

                  {currentSet.commands.map((cmd, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-2 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={cmd.command}
                          onChange={(e) => updateCommand(i, e.target.value)}
                          placeholder={lang === "zh" ? "AT指令" : "AT Command"}
                          className="flex-1 text-xs font-mono"
                        />
                        <Button
                          type="button"
                          onClick={() => removeCommand(i)}
                          className="text-rose-500 hover:text-rose-600 p-1"
                          title={lang === "zh" ? "删除" : "Delete"}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                      <textarea
                        value={cmd.expectedResponses.join("\n")}
                        onChange={(e) => updateExpectedResponses(i, e.target.value)}
                        placeholder={lang === "zh" ? "每行一个期望结果（按顺序匹配）" : "One expected response per line (matched in order)"}
                        className="w-full text-[11px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                        rows={2}
                      />
                    </div>
                  ))}
                  {currentSet.commands.length === 0 && (
                    <div className="text-[10px] text-[var(--text-muted)] text-center py-4">
                      {lang === "zh" ? "点击「添加指令」添加AT指令" : 'Click "Add" to add AT commands'}
                    </div>
                  )}
                </div>

                {/* Bottom actions */}
                <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleDelete}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] border border-rose-300 text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 size={10} />
                      {lang === "zh" ? "删除" : "Delete"}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg px-3 py-1 text-xs border border-[var(--border)] text-[var(--text-muted)]"
                    >
                      {lang === "zh" ? "关闭" : "Close"}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSave}
                      disabled={!dirty}
                      className="flex items-center gap-1 rounded-lg px-3 py-1 text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-40"
                    >
                      <Save size={11} />
                      {lang === "zh" ? "保存" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleApplyToGrid}
                      className="flex items-center gap-1 rounded-lg px-3 py-1 text-xs bg-[var(--accent)] text-white hover:opacity-80"
                    >
                      <ChevronRight size={11} />
                      {lang === "zh" ? "应用到指令网格" : "Apply to Grid"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-xs text-[var(--text-muted)]">
                {lang === "zh" ? "请选择或创建一个响应集" : "Select or create a response set"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}