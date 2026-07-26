import { useEffect, useState } from "react";
import { FileText, FolderOpen, Plus, Save, Trash2, List } from "lucide-react";
import { Button } from "./ui/Button.tsx";
import { Input } from "./ui/Input.tsx";
import { t } from "../i18n";
import type { Lang } from "../i18n";
import { useResponseSet, type ResponseSet } from "../hooks/useResponseSet";
import { ResponseSetCommandEditor } from "./ResponseSetCommandEditor.tsx";

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

  function updateCommands(commands: ResponseSet["commands"]) {
    if (!currentSet) return;
    setCurrentSet({ ...currentSet, commands });
    setDirty(true);
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 shrink-0">
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
            className="ml-auto flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80 disabled:opacity-40"
          >
            <List size={12} />
            {t("response_set_apply", lang)}
          </Button>
        )}
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-64 shrink-0 border-r border-[var(--border)] p-3 flex flex-col">
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
                <ResponseSetCommandEditor lang={lang} commands={currentSet.commands} onChange={updateCommands} />
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