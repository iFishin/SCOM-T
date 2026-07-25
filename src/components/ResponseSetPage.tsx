import { useEffect, useState } from "react";
import { ArrowLeft, FileText, FolderOpen, Plus, Save, Trash2, List } from "lucide-react";
import { Button } from "./ui/Button.tsx";
import { Input } from "./ui/Input.tsx";
import { t } from "../i18n";
import type { Lang } from "../i18n";
import { useResponseSet, type ResponseSet, type ResponseSetCommand } from "../hooks/useResponseSet";

type ResponseSetPageProps = {
  lang: Lang;
  onClose: () => void;
  onApply?: (responseSetId: string) => void;
};

export function ResponseSetPage({ lang, onClose, onApply }: ResponseSetPageProps) {
  const { listResponseSets, loadResponseSet, saveResponseSet, deleteResponseSet, openResponseSetsDir } = useResponseSet();
  const [setNames, setSetNames] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [currentSet, setCurrentSet] = useState<ResponseSet | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});

  useEffect(() => {
    listResponseSets().then(async (names) => {
      setSetNames(names);
      // Load display names for sidebar
      const namesMap: Record<string, string> = {};
      for (const name of names) {
        const set = await loadResponseSet(name);
        if (set) namesMap[name] = set.name;
      }
      setDisplayNames(namesMap);
      if (names.length > 0) {
        setSelectedName(names[0]);
      }
    });
  }, []);

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

  // Sync display name when currentSet changes
  useEffect(() => {
    if (selectedName && currentSet) {
      setDisplayNames((prev) => ({ ...prev, [selectedName]: currentSet.name }));
    }
  }, [currentSet?.name]);

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
      setDisplayNames((prev) => ({ ...prev, [newName]: baseName }));
      setSelectedName(newName);
    });
  }

  function handleDelete() {
    if (!selectedName || !currentSet) return;
    deleteResponseSet(selectedName).then(() => {
      setSetNames((prev) => prev.filter((n) => n !== selectedName));
      setSelectedName(null);
      setCurrentSet(null);
    });
  }

  async function handleSave() {
    if (!currentSet || !selectedName) return;
    setSaving(true);
    await saveResponseSet(selectedName, currentSet);
    setDirty(false);
    setSaving(false);
  }

  function handleApplyAndClose() {
    if (!currentSet || !selectedName) return;
    handleSave().then(() => {
      onApply?.(selectedName);
      onClose();
    });
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

  function updateMatchMode(index: number, matchMode: "all" | "any") {
    if (!currentSet) return;
    const commands = [...currentSet.commands];
    commands[index] = { ...commands[index], matchMode };
    setCurrentSet({ ...currentSet, commands });
    setDirty(true);
  }

  function addExpectedResponse(cmdIndex: number) {
    if (!currentSet) return;
    const commands = [...currentSet.commands];
    const cmd = commands[cmdIndex];
    const regex = cmd.expectedResponseRegex ? [...cmd.expectedResponseRegex] : [];
    commands[cmdIndex] = {
      ...cmd,
      expectedResponses: [...cmd.expectedResponses, ""],
      expectedResponseRegex: [...regex, false],
    };
    setCurrentSet({ ...currentSet, commands });
    setDirty(true);
  }

  function updateExpectedResponse(cmdIndex: number, respIndex: number, text: string) {
    if (!currentSet) return;
    const commands = [...currentSet.commands];
    const cmd = commands[cmdIndex];
    const responses = [...cmd.expectedResponses];
    responses[respIndex] = text;
    commands[cmdIndex] = { ...cmd, expectedResponses: responses };
    setCurrentSet({ ...currentSet, commands });
    setDirty(true);
  }

  function toggleExpectedResponseRegex(cmdIndex: number, respIndex: number) {
    if (!currentSet) return;
    const commands = [...currentSet.commands];
    const cmd = commands[cmdIndex];
    const regex = cmd.expectedResponseRegex ? [...cmd.expectedResponseRegex] : cmd.expectedResponses.map(() => false);
    regex[respIndex] = !regex[respIndex];
    commands[cmdIndex] = { ...cmd, expectedResponseRegex: regex };
    setCurrentSet({ ...currentSet, commands });
    setDirty(true);
  }

  function removeExpectedResponse(cmdIndex: number, respIndex: number) {
    if (!currentSet) return;
    const commands = [...currentSet.commands];
    const cmd = commands[cmdIndex];
    const regex = cmd.expectedResponseRegex ? [...cmd.expectedResponseRegex] : undefined;
    commands[cmdIndex] = {
      ...cmd,
      expectedResponses: cmd.expectedResponses.filter((_, i) => i !== respIndex),
      expectedResponseRegex: regex ? regex.filter((_, i) => i !== respIndex) : undefined,
    };
    setCurrentSet({ ...currentSet, commands });
    setDirty(true);
  }

  function addCommand() {
    if (!currentSet) return;
    const newCmd: ResponseSetCommand = { command: "", expectedResponses: [], matchMode: "all" };
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
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 shrink-0">
        <Button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)] flex items-center gap-1"
        >
          <ArrowLeft size={14} />
          {lang === "zh" ? "返回" : "Back"}
        </Button>
        <div className="h-4 w-px bg-[var(--border)]" />
        <div>
          <div className="text-sm font-semibold">{t("response_set", lang)}</div>
          <div className="text-xs text-[var(--text-muted)]">{t("response_set_desc", lang)}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            onClick={handleCreateNew}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            <Plus size={12} />
            {lang === "zh" ? "新建" : "New"}
          </Button>
          <Button
            type="button"
            onClick={() => openResponseSetsDir()}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            <FolderOpen size={12} />
            {lang === "zh" ? "文件夹" : "Folder"}
          </Button>
          {currentSet && selectedName && (
            <Button
              type="button"
              onClick={handleApplyAndClose}
              disabled={!currentSet.commands.some((c) => c.command.trim() && c.expectedResponses.some((r) => r.trim()))}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80 disabled:opacity-40"
            >
              <List size={12} />
              {t("response_set_apply", lang)}
            </Button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-52 shrink-0 border-r border-[var(--border)] p-3 flex flex-col">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            {t("response_set_list", lang)}
            <span className="ml-1 font-normal normal-case">({setNames.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {setNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setSelectedName(name)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  selectedName === name
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
                }`}
              >
                <FileText size={13} />
                <span className="truncate">
                  {displayNames[name] || name.replace(/_\d+$/, "")}
                </span>
              </button>
            ))}
            {setNames.length === 0 && (
              <div className="text-[10px] text-[var(--text-muted)] text-center py-8">
                {lang === "zh" ? "暂无响应集\n点击上方「新建」创建" : "No response sets\nClick 'New' to create"}
              </div>
            )}
          </div>
        </div>

        {/* Right editor */}
        <div className="flex-1 flex flex-col min-h-0">
          {currentSet ? (
            <>
              {/* Name and description */}
              <div className="border-b border-[var(--border)] p-3 space-y-2 shrink-0">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={currentSet.name}
                    onChange={(e) => updateSetField("name", e.target.value)}
                    placeholder={lang === "zh" ? "响应集名称" : "Response Set Name"}
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-rose-300 text-rose-500 hover:bg-rose-50"
                  >
                    <Trash2 size={11} />
                    {lang === "zh" ? "删除" : "Delete"}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={!dirty}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80 disabled:opacity-40"
                  >
                    {saving ? (
                      <span className="animate-spin">⟳</span>
                    ) : (
                      <Save size={11} />
                    )}
                    {lang === "zh" ? "保存" : "Save"}
                  </Button>
                </div>
                <Input
                  type="text"
                  value={currentSet.description || ""}
                  onChange={(e) => updateSetField("description", e.target.value)}
                  placeholder={lang === "zh" ? "描述（可选）" : "Description (optional)"}
                  className="w-full text-xs"
                />
              </div>

              {/* Commands */}
              <div className="flex-1 overflow-y-auto p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">
                    {lang === "zh" ? `指令 (${currentSet.commands.length})` : `Commands (${currentSet.commands.length})`}
                  </span>
                  <Button
                    type="button"
                    onClick={addCommand}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80"
                  >
                    <Plus size={11} />
                    {lang === "zh" ? "添加指令" : "Add Command"}
                  </Button>
                </div>

                <div className="space-y-3">
                  {currentSet.commands.map((cmd, i) => (
                    <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-3 space-y-2">
                      {/* Command header */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--text-muted)] font-mono w-5">#{i + 1}</span>
                        <Input
                          type="text"
                          value={cmd.command}
                          onChange={(e) => updateCommand(i, e.target.value)}
                          placeholder={lang === "zh" ? "AT指令" : "AT Command"}
                          className="flex-1 text-xs font-mono"
                        />
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
                        <Button
                          type="button"
                          onClick={() => removeCommand(i)}
                          className="text-rose-500 hover:text-rose-600 p-1"
                          title={lang === "zh" ? "删除指令" : "Delete command"}
                        >
                          <Trash2 size={12} />
                        </Button>
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
                  {currentSet.commands.length === 0 && (
                    <div className="text-xs text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-lg">
                      {lang === "zh" ? "点击「添加指令」添加AT指令及期望响应" : 'Click "Add Command" to add AT commands and expected responses'}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
              {lang === "zh" ? "从左侧选择一个响应集，或点击「新建」创建" : "Select a response set from the left, or create a new one"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}