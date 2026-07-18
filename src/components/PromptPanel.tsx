import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { BatchEditor } from "./BatchEditor.tsx";
import { YamlEditor } from "./YamlEditor.tsx";
import { Button } from "./ui/Button.tsx";
import { Checkbox } from "./ui/Checkbox.tsx";
import { Input } from "./ui/Input.tsx";
import { Select } from "./ui/Select.tsx";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import { usePromptConfig } from "../hooks/usePromptConfig.ts";
import { serializeToYaml, parseYamlToRows } from "../utils/yamlConfig.ts";
import type { SendMode } from "../hooks/useSerialPort.ts";

type PromptRow = {
  id: number;
  selected: boolean;
  command: string;
  isHex: boolean;
  ender: "" | "\r\n" | "\r" | "\n";
  interval: string;
  device?: string;
  expectedResponses?: string[];
};

type PromptPanelProps = {
  variant: "grid" | "panel";
  isConnected: boolean;
  sendData: (value: string, sendMode: SendMode, appendNewline: "" | "\r\n" | "\r" | "\n") => Promise<void>;
  lang: Lang;
  promptRowCount: number;
  updatePromptRowCount: (count: number) => void;
  pushToast: (msg: string, type: "success" | "error" | "warn") => void;
};

export function PromptPanel({
  variant,
  isConnected,
  sendData,
  lang,
  promptRowCount,
  updatePromptRowCount,
  pushToast,
}: PromptPanelProps) {
  const promptConfig = usePromptConfig();

  // ── State ──

  const [promptRows, setPromptRows] = useState<PromptRow[]>(() =>
    Array.from({ length: promptRowCount }, (_, i) => ({
      id: i + 1,
      selected: false,
      command: "",
      isHex: false,
      ender: "\r\n" as const,
      interval: "",
    })),
  );
  const commandRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [rowCountInput, setRowCountInput] = useState(String(promptRowCount));
  const [activePromptTab, setActivePromptTab] = useState<"grid" | "config" | "batch">("grid");
  const [yamlText, setYamlText] = useState("");
  const [batchText, setBatchText] = useState("");
  const [yamlError, setYamlError] = useState<string | null>(null);
  const yamlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [configAction, setConfigAction] = useState<null | "save" | "load">(null);
  const [configName, setConfigName] = useState("");
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);

  // ── Auto-save ──

  const promptSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const promptRowsRef = useRef(promptRows);
  promptRowsRef.current = promptRows;

  // ── Load prompts.yaml on startup ──

  useEffect(() => {
    async function load() {
      try {
        const { join, homeDir } = await import("@tauri-apps/api/path");
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await join(await homeDir(), "SCOM-T", "prompts.yaml");
        const text = await readTextFile(path);
        const result = parseYamlToRows(text);
        if (result.valid && result.rows.length > 0) {
          setPromptRows(result.rows);
        }
      } catch { /* file may not exist yet */ }
    }
    load();
  }, []);

  // Keep promptRows length in sync with promptRowCount
  useEffect(() => {
    setPromptRows((current) => {
      const target = promptRowCount;
      if (current.length === target) return current;
      return Array.from({ length: target }, (_, i) => {
        const existing = current[i];
        return existing
          ? { ...existing, id: i + 1 }
          : { id: i + 1, selected: false, command: "", isHex: false, ender: "\r\n" as const, interval: "" };
      });
    });
  }, [promptRowCount]);

  // Auto-save to ~/SCOM-T/prompts.yaml
  useEffect(() => {
    if (promptSaveTimer.current) clearTimeout(promptSaveTimer.current);
    promptSaveTimer.current = setTimeout(async () => {
      try {
        const { join, homeDir } = await import("@tauri-apps/api/path");
        const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
        const dir = await join(await homeDir(), "SCOM-T");
        await mkdir(dir, { recursive: true }).catch(() => {});
        const path = await join(dir, "prompts.yaml");
        await writeTextFile(path, serializeToYaml(promptRows));
      } catch { /* auto-save failure is non-critical */ }
    }, 800);
    return () => { if (promptSaveTimer.current) clearTimeout(promptSaveTimer.current); };
  }, [promptRows]);

  useEffect(() => {
    function flush() { if (promptSaveTimer.current) clearTimeout(promptSaveTimer.current); }
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  useEffect(() => {
    return () => { if (yamlDebounceRef.current) clearTimeout(yamlDebounceRef.current); };
  }, []);

  // ── Handlers ──

  // Sync rowCountInput when promptRowCount changes externally (insertRow/deleteRow)
  useEffect(() => {
    setRowCountInput(String(promptRowCount));
  }, [promptRowCount]);

  function handleRowCountApply(newCount: number) {
    const clamped = Math.max(1, Math.min(500, Math.floor(newCount)));
    if (clamped < promptRowCount) {
      const lostRows = promptRows.slice(clamped).filter((r) => r.command.trim());
      if (lostRows.length > 0) {
        const msg = lang === "zh"
          ? `行数减少到 ${clamped} 后将丢失 ${lostRows.length} 行有内容的指令，确认吗？`
          : `Reduce to ${clamped} rows? ${lostRows.length} non-empty row(s) will be lost.`;
        if (!window.confirm(msg)) {
          setRowCountInput(String(promptRowCount));
          return;
        }
      }
    }
    updatePromptRowCount(clamped);
  }

  function updatePromptRow(id: number, patch: Partial<PromptRow>) {
    setPromptRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function handleSendPromptRow(row: PromptRow) {
    if (!isConnected) { pushToast(t("toast_not_connected", lang), "warn"); return; }
    if (!row.command) { pushToast(`${t("prompt_sender", lang)} ${row.id}: ${t("toast_command_empty", lang)}`, "warn"); return; }
    const mode = row.isHex ? "hex" : "ascii";
    await sendData(row.command, mode as SendMode, row.ender);
  }

  function handleCommandKeyDown(e: React.KeyboardEvent, row: PromptRow) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendPromptRow(row);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(1, row.id - 1);
      commandRefs.current[prev]?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(promptRowCount, row.id + 1);
      commandRefs.current[next]?.focus();
    }
  }

  function handlePromptTabChange(tab: "grid" | "config" | "batch") {
    if (yamlDebounceRef.current) {
      clearTimeout(yamlDebounceRef.current);
      yamlDebounceRef.current = null;
    }
    if (tab === "config") {
      setYamlText(serializeToYaml(promptRows));
      setYamlError(null);
    }
    if (tab === "batch") {
      setBatchText(promptRows.map((r) => r.command).join("\n"));
    }
    setActivePromptTab(tab);
  }

  function handleBatchTextChange(text: string) {
    setBatchText(text);
    const lines = text.split("\n");
    setPromptRows((current) => {
      const count = Math.max(current.length, lines.length);
      return Array.from({ length: count }, (_, i) => {
        const existing = current[i];
        return {
          id: i + 1,
          selected: existing?.selected ?? false,
          command: lines[i] ?? "",
          isHex: existing?.isHex ?? false,
          ender: (existing?.ender ?? "\r\n") as "" | "\r\n" | "\r" | "\n",
          interval: existing?.interval ?? "",
        };
      });
    });
    // Only extend row count if batch text has more lines than current rows
    if (lines.length > promptRowCount) {
      updatePromptRowCount(lines.length);
    }
  }

  function insertRow(index: number) {
    setPromptRows((current) => {
      const copy = [...current];
      copy.splice(index, 0, {
        id: 0,
        selected: false,
        command: "",
        isHex: false,
        ender: "\r\n" as const,
        interval: "",
      });
      return copy.map((row, i) => ({ ...row, id: i + 1 }));
    });
    updatePromptRowCount(promptRowCount + 1);
  }

  function deleteRow(id: number) {
    if (promptRowCount <= 1) {
      pushToast(t("config", lang) === "配置" ? "至少保留一行" : "Keep at least 1 row", "warn");
      return;
    }
    setPromptRows((current) => current.filter((row) => row.id !== id).map((row, i) => ({ ...row, id: i + 1 })));
    updatePromptRowCount(promptRowCount - 1);
  }

  // Auto-sync to batch when on batch tab and promptRows change
  useEffect(() => {
    if (activePromptTab !== "batch") return;
    setBatchText(promptRows.map((r) => r.command).join("\n"));
  }, [promptRows, activePromptTab]);

  function handleYamlChange(newValue: string) {
    setYamlText(newValue);
    if (yamlDebounceRef.current) clearTimeout(yamlDebounceRef.current);
    yamlDebounceRef.current = setTimeout(() => {
      const result = parseYamlToRows(newValue);
      if (result.valid) {
        setYamlError(null);
        setPromptRows(result.rows);
        updatePromptRowCount(result.rows.length);
      } else {
        setYamlError(result.error);
      }
    }, 500);
  }

  async function handleSaveConfig(name: string) {
    try {
      await promptConfig.saveConfig(name, promptRows);
      pushToast(t("config_saved_ok", lang), "success");
      setConfigAction(null);
      setConfigName("");
    } catch (e) {
      pushToast(`${t("config_save_err", lang)}: ${e}`, "error");
    }
  }

  async function handleLoadConfig(name: string) {
    try {
      const rows = await promptConfig.loadConfig(name);
      setPromptRows(rows);
      updatePromptRowCount(rows.length);
      setYamlText(serializeToYaml(rows));
      setYamlError(null);
      pushToast(t("config_loaded_ok", lang), "success");
      setConfigAction(null);
    } catch (e) {
      pushToast(`${t("config_load_err", lang)}: ${e}`, "error");
    }
  }

  async function handleDeleteConfig(name: string) {
    try {
      await promptConfig.deleteConfig(name);
      setSavedConfigs((prev) => prev.filter((c) => c !== name));
      pushToast(t("config_deleted_ok", lang), "success");
    } catch (e) {
      pushToast(`${t("config_delete_err", lang)}: ${e}`, "error");
    }
  }

  async function handleOpenConfigDir() {
    try {
      await promptConfig.openConfigDir();
    } catch (e) {
      pushToast(`${t("config_open_err", lang)}: ${e}`, "error");
    }
  }

  async function handleShowLoadList() {
    const list = await promptConfig.listConfigs();
    setSavedConfigs(list);
    setConfigAction("load");
  }

  // ── Content blocks ──

  const gridContent = (
    <div className="h-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="grid grid-cols-[28px_28px_60px_minmax(100px,1fr)_36px_56px_54px_24px] items-center gap-x-1.5 border-b border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        <div /><div /><div>{t("send", lang)}</div><div>{t("command_placeholder", lang)}</div><div>HEX</div><div>{t("ender", lang)}</div><div>{t("interval_placeholder", lang)}</div><div />
      </div>
      <div className="h-[calc(100%-30px)] overflow-y-auto">
        {promptRows.map((row, index) => (
          <div key={row.id}>
            {/* Insert strip above this row */}
            <div className="group/insert relative h-3 z-10">
              <div className="absolute inset-x-0 top-1/2 border-t border-[var(--border)]" />
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 top-1/2 z-10 opacity-0 group-hover/insert:opacity-100 transition-opacity">
                <button onClick={() => insertRow(index)}
                        className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] shadow-sm transition-colors">
                  <Plus size={10} />
                </button>
              </div>
            </div>
            {/* Row */}
            <div className="grid grid-cols-[28px_28px_60px_minmax(100px,1fr)_36px_56px_54px_24px] items-center gap-x-1.5 border-b border-[var(--border)] px-2 py-1 last:border-0 hover:bg-[var(--bg-hover)] group/row">
              <div className="flex justify-center"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--text-muted)]">{row.id}</span></div>
              <div className="flex justify-center"><Checkbox checked={row.selected} onChange={(e) => updatePromptRow(row.id, { selected: e.currentTarget.checked })} /></div>
              <Button type="button" variant="primary" size="sm" onClick={() => handleSendPromptRow(row)}>{t("prompt_sender", lang)}</Button>
              <Input value={row.command} onChange={(e) => updatePromptRow(row.id, { command: e.currentTarget.value })} onKeyDown={(e) => handleCommandKeyDown(e, row)} ref={(el: HTMLInputElement) => { commandRefs.current[row.id] = el; }} placeholder={t("command_placeholder", lang)} className="bg-transparent" />
              <div className="flex justify-center"><Checkbox checked={row.isHex} onChange={(e) => updatePromptRow(row.id, { isHex: e.currentTarget.checked })} /></div>
              <Select value={row.ender} onChange={(e) => updatePromptRow(row.id, { ender: e.currentTarget.value as "" | "\r\n" | "\r" | "\n" })}>
                <option value="\r\n">{t("ender_crlf", lang)}</option><option value="">{t("ender_none", lang)}</option><option value="\n">{t("ender_lf", lang)}</option><option value="\r">{t("ender_cr", lang)}</option>
              </Select>
              <Input value={row.interval} onChange={(e) => updatePromptRow(row.id, { interval: e.currentTarget.value })} placeholder={t("interval_placeholder", lang)} className="text-center text-xs" />
              <div className="flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
                <button onClick={() => deleteRow(row.id)}
                        className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-rose-500 hover:bg-[var(--bg-input)] text-xs leading-none transition-colors">
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
        {/* Insert after last row */}
        <div className="group/insert relative h-3 z-10">
          <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 top-1/2 z-10 opacity-0 group-hover/insert:opacity-100 transition-opacity">
            <button onClick={() => insertRow(promptRows.length)}
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] shadow-sm transition-colors">
              <Plus size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const batchContent = (
    <BatchEditor
      value={batchText}
      onChange={handleBatchTextChange}
      placeholder={lang === "zh" ? "每行一条指令，粘贴后自动填充到指令网格" : "One command per line — pasted content auto-fills the command grid"}
      lang={lang}
    />
  );

  const tabBar = (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => handlePromptTabChange("grid")} className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${activePromptTab === "grid" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"}`}>{t("tab_grid", lang)}</button>
      <button type="button" onClick={() => handlePromptTabChange("config")} className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${activePromptTab === "config" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"}`}>{t("tab_config", lang)}</button>
      <button type="button" onClick={() => handlePromptTabChange("batch")} className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${activePromptTab === "batch" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"}`}>{t("tab_batch", lang)}</button>
      {activePromptTab === "config" && (
        <>
          <span className="mx-1 text-[var(--border)]">|</span>
          <button type="button" onClick={() => { setConfigName(""); setConfigAction("save"); }} className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]">{t("save_config", lang)}</button>
          <button type="button" onClick={handleShowLoadList} className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]">{t("load_config", lang)}</button>
          <button type="button" onClick={handleOpenConfigDir} className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]">{t("open_config_dir", lang)}</button>
        </>
      )}
    </div>
  );

  const buttonBar = (
    <div className="flex gap-1.5 pb-2">
      <input readOnly value={lang === "zh" ? "指令：点击左侧行按钮发送…" : "COMMAND: click a row button to send…"} className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[var(--text-muted)] outline-none" />
      <Button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">{lang === "zh" ? "预设" : "Prompt"}</Button>
      <Button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">Idx</Button>
      <Button className="rounded bg-[var(--accent)] px-3 py-1.5 text-white">{lang === "zh" ? "开始" : "Start"}</Button>
      <input readOnly value={lang === "zh" ? "总次数" : "Total Times"} className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[var(--text-muted)] outline-none" />
      <Button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">{lang === "zh" ? "停止" : "Stop"}</Button>
    </div>
  );

  const tabBarWithCount = (
    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
      {tabBar}
      {activePromptTab === "grid" && (
        <label className="flex items-center gap-1 text-[10px] font-normal normal-case">
          {t("prompt_rows", lang)}
          <Input type="number" min={1} max={500} value={rowCountInput}
                 onChange={(e) => setRowCountInput(e.currentTarget.value)}
                 onBlur={(e) => handleRowCountApply(Number(e.currentTarget.value))}
                 onKeyDown={(e) => { if (e.key === 'Enter') handleRowCountApply(Number(rowCountInput)); }}
                 className="w-14 text-center" />
        </label>
      )}
    </div>
  );

  // ── Config mode content ──

  const configContent = (
    <>
      {configAction === "save" && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--bg-input)]">
          <input value={configName} onChange={(e) => setConfigName(e.currentTarget.value)} placeholder={t("config_name_hint", lang)} className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]" onKeyDown={(e) => { if (e.key === "Enter" && configName.trim()) handleSaveConfig(configName.trim()); if (e.key === "Escape") setConfigAction(null); }} autoFocus />
          <Button type="button" variant="primary" size="sm" disabled={!configName.trim()} onClick={() => handleSaveConfig(configName.trim())} className="px-2 py-1 text-[11px]">{t("save_config", lang)}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfigAction(null)} className="px-2 py-1 text-[11px]">{lang === "zh" ? "取消" : "Cancel"}</Button>
        </div>
      )}
      {configAction === "load" && (
        <div className="border-b border-[var(--border)] bg-[var(--bg-input)]">
          {savedConfigs.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">{t("no_configs", lang)}</div>
          ) : (
            <div className="divide-y divide-[var(--border)] max-h-32 overflow-y-auto">
              {savedConfigs.map((name) => (
                <div key={name} className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]">
                  <button type="button" className="flex-1 text-left text-[var(--text-primary)]" onClick={() => handleLoadConfig(name)}>{name}</button>
                  <button type="button" onClick={() => handleDeleteConfig(name)} className="rounded px-1 py-0.5 text-[var(--text-muted)] hover:text-rose-500 transition-colors text-[10px]">{lang === "zh" ? "删除" : "Del"}</button>
                </div>
              ))}
            </div>
          )}
          <div className="px-3 py-1.5 border-t border-[var(--border)]">
            <button type="button" onClick={() => setConfigAction(null)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">{lang === "zh" ? "取消" : "Cancel"}</button>
          </div>
        </div>
      )}
      <YamlEditor value={yamlText} onChange={handleYamlChange} error={yamlError} lang={lang} />
    </>
  );

  // ── Grid layout variant: single card with all content ──

  const gridVariant = (
    <div className="overflow-hidden rounded-lg flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] p-2">
      {tabBarWithCount}
      {activePromptTab === "grid" && buttonBar}
      <div className="min-h-0 flex-1">
        {activePromptTab === "grid" ? gridContent : activePromptTab === "batch" ? batchContent : configContent}
      </div>
    </div>
  );

  // ── Panel variant: header + scrollable content ──

  const panelVariant = (
    <>
      <div className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-2 text-xs">
        {tabBarWithCount}
        {activePromptTab === "grid" && buttonBar}
      </div>
      {activePromptTab === "grid" ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
          {gridContent}
        </div>
      ) : activePromptTab === "batch" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {batchContent}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
          {configContent}
        </div>
      )}
    </>
  );

  return variant === "grid" ? gridVariant : panelVariant;
}
