import { useEffect, useRef, useState } from "react";
import { Plus, Search, Globe, Check, X, Loader2, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { BatchEditor } from "./BatchEditor.tsx";
import { YamlEditor } from "./YamlEditor.tsx";
import { RegexCleanDialog } from "./tools/RegexCleanDialog.tsx";
import { Button } from "./ui/Button.tsx";
import { Checkbox } from "./ui/Checkbox.tsx";
import { Input } from "./ui/Input.tsx";
import { Select } from "./ui/Select.tsx";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import { usePromptConfig } from "../hooks/usePromptConfig.ts";
import { useResponseSet } from "../hooks/useResponseSet.ts";
import { serializeToYaml, parseYamlToRows } from "../utils/yamlConfig.ts";
import type { SendMode, SerialLogEntry } from "../hooks/useSerialPort.ts";

type PromptRowStatus = "idle" | "pending" | "success" | "error";

type WaitingResponse = {
  rowId: number;
  expected: string[];
  isRegex: boolean[];
  timeout: number;
  startTime: number;
  receivedBuffer: string;
  matchIndex: number;
  timer: ReturnType<typeof setTimeout>;
  onComplete?: () => void;
};

type BatchExecutionState = {
  isRunning: boolean;
  currentLoop: number;
  totalLoops: number;
  currentIndex: number;
  selectedRows: PromptRow[];
};

type PromptRow = {
  id: number;
  selected: boolean;
  command: string;
  isHex: boolean;
  ender: "" | "\r\n" | "\r" | "\n";
  interval: string;
  device?: string;
  expectedResponses?: string[];
  expectedResponseRegex?: boolean[];
  status?: PromptRowStatus;
};

type PromptPanelProps = {
  variant: "grid" | "panel";
  isConnected: boolean;
  sendData: (value: string, sendMode: SendMode, appendNewline: "" | "\r\n" | "\r" | "\n") => Promise<void>;
  lang: Lang;
  promptRowCount: number;
  updatePromptRowCount: (count: number) => void;
  pushToast: (msg: string, type: "success" | "error" | "warn") => void;
  onNavigateToConfig?: () => void;
  onNavigateToResponseSet?: () => void;
  pendingApplyResponseSet?: string | null;
  onClearPendingApply?: () => void;
  activeConfigFile?: string;
  logs?: SerialLogEntry[];
  /** TCP Server broadcast — sends data to all connected TCP clients */
  tcpServerBroadcast?: (data: number[]) => Promise<void>;
  tcpClientCount?: number;
};

export function PromptPanel({
  variant,
  isConnected,
  sendData,
  lang,
  promptRowCount,
  updatePromptRowCount,
  pushToast,
  onNavigateToConfig,
  onNavigateToResponseSet,
  pendingApplyResponseSet,
  onClearPendingApply,
  activeConfigFile = "prompts.yaml",
  logs = [],
  tcpServerBroadcast,
  tcpClientCount,
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
      status: "idle" as PromptRowStatus,
    })),
  );
  const commandRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [rowCountInput, setRowCountInput] = useState(String(promptRowCount));
  const [activePromptTab, setActivePromptTab] = useState<"grid" | "config" | "batch">("grid");
  const [yamlText, setYamlText] = useState("");
  const [batchText, setBatchText] = useState("");
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [regexCleanOpen, setRegexCleanOpen] = useState(false);
  const [quickPresets, setQuickPresets] = useState<{ name: string; pattern: string; replacement: string; mode?: string; pinned?: boolean }[]>([]);
  const presetsLoaded = useRef(false);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const waitingResponsesRef = useRef<Map<number, WaitingResponse>>(new Map());
  const [batchState, setBatchState] = useState<BatchExecutionState>({
    isRunning: false,
    currentLoop: 0,
    totalLoops: 1,
    currentIndex: 0,
    selectedRows: [],
  });
  const [totalLoops, setTotalLoops] = useState(1);
  const batchAbortRef = useRef<boolean>(false);
  const [responseSetOptions, setResponseSetOptions] = useState<{ id: string; name: string }[]>([]);
  const responseSetOptionsLoaded = useRef(false);
  const [matchLog, setMatchLog] = useState<{ rowId: number; command: string; status: "pending" | "success" | "error"; detail: string; received?: string; expected?: string }[]>([]);
  const [matchLogOpen, setMatchLogOpen] = useState(false);

  // Load quick presets from the same file used by RegexCleanDialog
  useEffect(() => {
    if (presetsLoaded.current) return;
    presetsLoaded.current = true;
    loadQuickPresets();
  }, []);

  // Reload presets when dialog closes (user may have changed pins)
  useEffect(() => {
    if (!regexCleanOpen) loadQuickPresets();
  }, [regexCleanOpen]);

  // ── Load response set options for the row editor ──
  useEffect(() => {
    if (responseSetOptionsLoaded.current) return;
    responseSetOptionsLoaded.current = true;
    const { listResponseSets, loadResponseSet } = useResponseSet();
    (async () => {
      const names = await listResponseSets();
      const options: { id: string; name: string }[] = [];
      for (const name of names) {
        const set = await loadResponseSet(name);
        if (set) options.push({ id: name, name: set.name });
      }
      setResponseSetOptions(options);
    })();
  }, []);

  // ── Handle pending response set apply ──
  useEffect(() => {
    if (!pendingApplyResponseSet || !onClearPendingApply) return;
    const { loadResponseSet, applyToGrid } = useResponseSet();
    (async () => {
      const set = await loadResponseSet(pendingApplyResponseSet);
      if (!set) {
        pushToast(lang === "zh" ? "响应集加载失败" : "Failed to load response set", "error");
        onClearPendingApply();
        return;
      }
      const updates = applyToGrid(set, promptRows);
      if (updates.length === 0) {
        pushToast(lang === "zh" ? "响应集中没有匹配的指令" : "No matching commands in response set", "warn");
      } else {
        let matchCount = 0;
        for (const { rowId, expectedResponses, expectedResponseRegex } of updates) {
          updatePromptRow(rowId, { expectedResponses, expectedResponseRegex });
          matchCount++;
        }
        pushToast(
          lang === "zh"
            ? `已从「${set.name}」应用 ${matchCount} 条指令的期望结果`
            : `Applied ${matchCount} commands from "${set.name}"`,
          "success"
        );
      }
      onClearPendingApply();
    })();
  }, [pendingApplyResponseSet]);

  async function loadQuickPresets() {
    try {
      const { join, homeDir } = await import("@tauri-apps/api/path");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await join(await homeDir(), "SCOM-T", "regex-presets.json");
      setQuickPresets(JSON.parse(await readTextFile(path)));
    } catch {
      setQuickPresets([
        { name: "消除时间戳", pattern: "\\[20(.*?)\\]", replacement: "", mode: "replace", pinned: true },
        { name: "只保留AT指令", pattern: "AT\\+", replacement: "", mode: "keep", pinned: true },
      ]);
    }
  }
  const yamlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [configAction, setConfigAction] = useState<null | "save" | "load">(null);
  const [configName, setConfigName] = useState("");
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);

  const allSelected = promptRows.length > 0 && promptRows.every((r) => r.selected);
  function toggleSelectAll() {
    setPromptRows((current) => current.map((row) => ({ ...row, selected: !allSelected })));
  }

  // ── Auto-save ──

  const promptSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const promptRowsRef = useRef(promptRows);
  promptRowsRef.current = promptRows;

  // ── Load config file on startup ──

  useEffect(() => {
    async function load() {
      try {
        const { join, homeDir } = await import("@tauri-apps/api/path");
        const { readTextFile } = await import("@tauri-apps/plugin-fs");

        let filePath: string;
        if (activeConfigFile === "prompts.yaml") {
          filePath = await join(await homeDir(), "SCOM-T", "prompts.yaml");
        } else {
          filePath = await join(await homeDir(), "SCOM-T", "prompts", activeConfigFile);
        }

        const text = await readTextFile(filePath);
        const result = parseYamlToRows(text);
        if (result.valid && result.rows.length > 0) {
          setPromptRows(result.rows);
          // Update promptRowCount to match the loaded config
          updatePromptRowCount(result.rows.length);
        }
      } catch { /* file may not exist yet */ }
    }
    load();
  }, [activeConfigFile]);

  // Keep promptRows length in sync with promptRowCount
  useEffect(() => {
    setPromptRows((current) => {
      const target = promptRowCount;
      if (current.length === target) return current;
      return Array.from({ length: target }, (_, i) => {
        const existing = current[i];
        return existing
          ? { ...existing, id: i + 1 }
          : { id: i + 1, selected: false, command: "", isHex: false, ender: "\r\n" as const, interval: "", status: "idle" as PromptRowStatus };
      });
    });
  }, [promptRowCount]);

  // Auto-save to config file
  useEffect(() => {
    if (promptSaveTimer.current) clearTimeout(promptSaveTimer.current);
    promptSaveTimer.current = setTimeout(async () => {
      try {
        const { join, homeDir } = await import("@tauri-apps/api/path");
        const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
        const dir = await join(await homeDir(), "SCOM-T");
        await mkdir(dir, { recursive: true }).catch(() => {});

        let savePath: string;
        if (activeConfigFile === "prompts.yaml") {
          savePath = await join(dir, "prompts.yaml");
        } else {
          savePath = await join(dir, "prompts", activeConfigFile);
        }

        await writeTextFile(savePath, serializeToYaml(promptRows));

        // Also sync to prompts.yaml if editing a file from prompts directory
        if (activeConfigFile !== "prompts.yaml") {
          const mainPath = await join(dir, "prompts.yaml");
          await writeTextFile(mainPath, serializeToYaml(promptRows));
        }
      } catch { /* auto-save failure is non-critical */ }
    }, 800);
    return () => { if (promptSaveTimer.current) clearTimeout(promptSaveTimer.current); };
  }, [promptRows, activeConfigFile]);

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

  // ── Response matching: monitor logs for expected responses ──
  useEffect(() => {
    if (waitingResponsesRef.current.size === 0) return;
    if (!logs || logs.length === 0) return;

    const latestLog = logs[logs.length - 1];
    if (latestLog?.direction !== "received") return;

    const receivedText = latestLog.payload;

    // Log received data
    setMatchLog((prev) => {
      const next = [{ rowId: 0, command: "", status: "pending" as const, detail: `[RECV] ${receivedText.length > 80 ? receivedText.slice(0, 80) + "..." : receivedText}`, received: receivedText.length > 200 ? receivedText.slice(0, 200) + "..." : receivedText, expected: "" }, ...prev];
      return next.slice(0, 100);
    });

    waitingResponsesRef.current.forEach((waiting, rowId) => {
      waiting.receivedBuffer += receivedText;

      // Try to match expected responses in order
      while (waiting.matchIndex < waiting.expected.length) {
        const expected = waiting.expected[waiting.matchIndex];
        // Skip empty expected responses
        if (!expected.trim()) {
          waiting.matchIndex++;
          continue;
        }
        const isRegex = waiting.isRegex[waiting.matchIndex] ?? false;
        let matched = false;

        if (isRegex) {
          try {
            const re = new RegExp(expected);
            const match = re.exec(waiting.receivedBuffer);
            if (match) {
              matched = true;
              waiting.receivedBuffer = waiting.receivedBuffer.slice(match.index + match[0].length);
            }
          } catch {
            // Invalid regex, fall back to text match
            matched = waiting.receivedBuffer.includes(expected);
            if (matched) {
              const idx = waiting.receivedBuffer.indexOf(expected);
              waiting.receivedBuffer = waiting.receivedBuffer.slice(idx + expected.length);
            }
          }
        } else {
          matched = waiting.receivedBuffer.includes(expected);
          if (matched) {
            const idx = waiting.receivedBuffer.indexOf(expected);
            waiting.receivedBuffer = waiting.receivedBuffer.slice(idx + expected.length);
          }
        }

        if (matched) {
          waiting.matchIndex++;
          setMatchLog((prev) => {
            const next = [{ rowId, command: "", status: "pending" as const, detail: `[MATCH] #${waiting.matchIndex}/${waiting.expected.length}: ${expected.length > 40 ? expected.slice(0, 40) + "..." : expected}`, received: receivedText.length > 60 ? receivedText.slice(0, 60) + "..." : receivedText, expected: expected.length > 60 ? expected.slice(0, 60) + "..." : expected }, ...prev];
            return next.slice(0, 100);
          });
        } else {
          break;
        }
      }

      // All expected responses matched
      if (waiting.matchIndex >= waiting.expected.length) {
        clearTimeout(waiting.timer);
        updatePromptRow(rowId, { status: "success" });
        waitingResponsesRef.current.delete(rowId);
        waiting.onComplete?.();
        setMatchLog((prev) => {
          const next = [{ rowId, command: "", status: "success" as const, detail: `[SUCCESS] 行 ${rowId}: ${waiting.expected.length} 个期望结果全部匹配成功`, received: "", expected: "" }, ...prev];
          return next.slice(0, 100);
        });
      }
    });
  }, [logs]);

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

  function toggleExpandRow(id: number) {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }

  async function handleSendPromptRow(row: PromptRow) {
    if (!isConnected) { pushToast(t("toast_not_connected", lang), "warn"); return; }
    if (!row.command) { pushToast(`${t("prompt_sender", lang)} ${row.id}: ${t("toast_command_empty", lang)}`, "warn"); return; }

    updatePromptRow(row.id, { selected: true, status: "pending" });

    try {
      const mode = row.isHex ? "hex" : "ascii";
      // Set up response waiting BEFORE sending, so incoming data is captured
      if (row.expectedResponses && row.expectedResponses.length > 0) {
        waitForResponse(row);  // Don't await - fire and forget for single execution
      }
      await sendData(row.command, mode as SendMode, row.ender);

      if (!row.expectedResponses || row.expectedResponses.length === 0) {
        updatePromptRow(row.id, { status: "success" });
      }
    } catch (error) {
      updatePromptRow(row.id, { status: "error" });
    }
  }

  function waitForResponse(row: PromptRow): Promise<void> {
    return new Promise((resolve) => {
      // Clear existing timer for this row
      const existing = waitingResponsesRef.current.get(row.id);
      if (existing) clearTimeout(existing.timer);

      const timeout = row.interval ? parseInt(row.interval, 10) : 5000;
      const validTimeout = isNaN(timeout) || timeout < 100 ? 5000 : timeout;

      setMatchLog((prev) => {
        const expectedList = row.expectedResponses?.map((r, i) => {
          const isRegex = row.expectedResponseRegex?.[i] ?? false;
          return `${isRegex ? ".*" : "Abc"} ${r.length > 30 ? r.slice(0, 30) + "..." : r}`;
        }).join(" | ") || "";
        const next = [{
          rowId: row.id, command: row.command, status: "pending" as const,
          detail: `[WAIT] 行 ${row.id}: ${row.command} → 等待 ${waiting.expected.length} 个期望结果 (${validTimeout}ms)`,
          received: "", expected: expectedList
        }, ...prev];
        return next.slice(0, 100);
      });

      const waiting: WaitingResponse = {
        rowId: row.id,
        expected: row.expectedResponses!,
        isRegex: row.expectedResponseRegex ?? row.expectedResponses!.map(() => false),
        timeout: validTimeout,
        startTime: Date.now(),
        receivedBuffer: "",
        matchIndex: 0,
        timer: setTimeout(() => {
          // Timeout — mark as error
          updatePromptRow(row.id, { status: "error" });
          waitingResponsesRef.current.delete(row.id);
          setMatchLog((prev) => {
            const buffer = waiting.receivedBuffer;
            const next = [{
              rowId: row.id, command: row.command, status: "error" as const,
              detail: `[ERROR] 行 ${row.id}: 匹配超时 (${validTimeout}ms) — 已匹配 ${waiting.matchIndex}/${waiting.expected.length} 个`,
              received: buffer.length > 200 ? buffer.slice(0, 200) + "..." : buffer || "(空)",
              expected: ""
            }, ...prev];
            return next.slice(0, 100);
          });
          resolve();
        }, validTimeout),
        onComplete: resolve,
      };

      waitingResponsesRef.current.set(row.id, waiting);
    });
  }

  async function executeSingleCommand(row: PromptRow) {
    updatePromptRow(row.id, { status: "pending" });

    try {
      const mode = row.isHex ? "hex" : "ascii";
      // Set up response waiting BEFORE sending, so incoming data is captured
      if (row.expectedResponses && row.expectedResponses.length > 0) {
        await waitForResponse(row);
      }
      await sendData(row.command, mode as SendMode, row.ender);

      if (!row.expectedResponses || row.expectedResponses.length === 0) {
        updatePromptRow(row.id, { status: "success" });
      }
    } catch (error) {
      updatePromptRow(row.id, { status: "error" });
    }
  }

  async function startBatchExecution() {
    const selected = promptRows
      .filter(r => r.selected && r.command.trim())
      .sort((a, b) => a.id - b.id);

    if (selected.length === 0) {
      pushToast(t("batch_no_selected", lang), "warn");
      return;
    }

    batchAbortRef.current = false;
    setBatchState({
      isRunning: true,
      currentLoop: 0,
      totalLoops: totalLoops,
      currentIndex: 0,
      selectedRows: selected,
    });

    for (let loop = 0; loop < totalLoops; loop++) {
      if (batchAbortRef.current) break;

      setBatchState(prev => ({ ...prev, currentLoop: loop + 1 }));

      for (let i = 0; i < selected.length; i++) {
        if (batchAbortRef.current) break;

        setBatchState(prev => ({ ...prev, currentIndex: i }));
        await executeSingleCommand(selected[i]);
      }
    }

    resetBatchState();
  }

  function stopBatchExecution() {
    batchAbortRef.current = true;

    waitingResponsesRef.current.forEach((waiting) => {
      clearTimeout(waiting.timer);
    });
    waitingResponsesRef.current.clear();

    resetBatchState();
  }

  function resetBatchState() {
    setBatchState({
      isRunning: false,
      currentLoop: 0,
      totalLoops: 1,
      currentIndex: 0,
      selectedRows: [],
    });

    setPromptRows(current => current.map(row => ({
      ...row,
      selected: false,
      status: "idle" as PromptRowStatus,
    })));
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
      // Find the index of the last non-empty command
      let lastIdx = promptRows.length - 1;
      while (lastIdx >= 0 && !promptRows[lastIdx].command.trim()) lastIdx--;
      setBatchText(promptRows.slice(0, lastIdx + 1).map((r) => r.command).join("\n"));
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
          status: (existing?.status ?? "idle") as PromptRowStatus,
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
        status: "idle" as PromptRowStatus,
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

  function clearAllStatuses() {
    setPromptRows((current) => current.map((row) => ({ ...row, status: "idle" as PromptRowStatus })));
  }

  // ── Content blocks ──

  const gridContent = (
    <div className="h-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="grid grid-cols-[24px_24px_52px_minmax(80px,1fr)_30px_72px_60px_50px] items-center gap-x-1 border-b border-[var(--border)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] text-center">
        <button onClick={clearAllStatuses} className="hover:text-[var(--text-primary)] transition-colors" title={lang === "zh" ? "点击清空所有状态" : "Clear all statuses"}>#</button>
        <div className="flex justify-center">
          <Checkbox checked={allSelected} onChange={() => toggleSelectAll()} />
        </div><div>{t("send", lang)}</div><div>{t("command_placeholder", lang)}</div><div>HEX</div><div>{t("ender", lang)}</div><div>{t("interval_placeholder", lang)}</div><div />
      </div>
      <div className="h-[calc(100%-30px)] overflow-y-auto">
        {promptRows.map((row, index) => (
          <div key={row.id}>
            {/* Insert strip above this row */}
            <div className="group/insert relative h-2 z-10">
              <div className="absolute inset-x-0 top-1/2 border-t border-[var(--border)]" />
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 top-1/2 z-10 opacity-0 group-hover/insert:opacity-100 transition-opacity">
                <button onClick={() => insertRow(index)}
                        className="flex h-3 w-3 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] shadow-sm transition-colors">
                  <Plus size={8} />
                </button>
              </div>
            </div>
            {/* Row */}
            <div className={`grid grid-cols-[24px_24px_52px_minmax(80px,1fr)_30px_72px_60px_50px] items-center gap-x-1 border-b border-[var(--border)] px-1.5 py-0.5 last:border-0 hover:bg-[var(--bg-hover)] group/row ${
              batchState.isRunning && batchState.selectedRows[batchState.currentIndex]?.id === row.id
                ? "bg-[var(--accent)]/10"
                : ""
            }`}>
              {/* Status indicator */}
              <div className="flex justify-center">
                {row.status === "success" ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check size={10} strokeWidth={3} />
                  </span>
                ) : row.status === "error" ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white">
                    <X size={10} strokeWidth={3} />
                  </span>
                ) : row.status === "pending" ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white animate-pulse">
                    <Loader2 size={10} className="animate-spin" />
                  </span>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[10px] font-medium text-[var(--text-muted)]">
                    {row.id}
                  </span>
                )}
              </div>
              <div className="flex justify-center"><Checkbox checked={row.selected} onChange={(e) => updatePromptRow(row.id, { selected: e.currentTarget.checked })} /></div>
              <Button type="button" variant="primary" size="sm" onClick={() => handleSendPromptRow(row)} className="text-[10px] px-1.5 py-0.5">{t("prompt_sender", lang)}</Button>
              <Input value={row.command} onChange={(e) => updatePromptRow(row.id, { command: e.currentTarget.value })} onKeyDown={(e) => handleCommandKeyDown(e, row)} ref={(el: HTMLInputElement) => { commandRefs.current[row.id] = el; }} placeholder={t("command_placeholder", lang)} className="bg-transparent text-[11px]" />
              <div className="flex justify-center"><Checkbox checked={row.isHex} onChange={(e) => updatePromptRow(row.id, { isHex: e.currentTarget.checked })} /></div>
              <Select value={row.ender} onChange={(e) => updatePromptRow(row.id, { ender: e.currentTarget.value as "" | "\r\n" | "\r" | "\n" })} className="text-[11px]" style={{ paddingLeft: "4px" } as React.CSSProperties}>
                <option value="\r\n">{t("ender_crlf", lang)}</option><option value="">{t("ender_none", lang)}</option><option value="\n">{t("ender_lf", lang)}</option><option value="\r">{t("ender_cr", lang)}</option>
              </Select>
              <Input value={row.interval} onChange={(e) => updatePromptRow(row.id, { interval: e.currentTarget.value })} placeholder={t("interval_placeholder", lang)} className="text-center text-[11px] placeholder:text-[11px]" />
              <div className="flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity gap-1">
                <button
                  type="button"
                  onClick={() => toggleExpandRow(row.id)}
                  className={`flex items-center justify-center rounded transition-colors ${
                    row.expectedResponses && row.expectedResponses.length > 0
                      ? "text-[var(--accent)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                  }`}
                  style={{ width: 20, height: 20 }}
                >
                  {expandedRowId === row.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className="w-px" style={{ height: 16 }} />
                <button onClick={() => deleteRow(row.id)}
                        className="flex items-center justify-center rounded text-[var(--text-muted)] hover:text-rose-500 hover:bg-[var(--bg-input)] transition-colors"
                        style={{ width: 20, height: 20 }}>
                  <X size={14} />
                </button>
              </div>
            </div>
            {/* Expanded expected responses editor */}
            {expandedRowId === row.id && (
              <div className="border-b border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-semibold text-[var(--text-muted)]">
                    {t("prompt_expected_responses", lang)}
                  </label>
                  {responseSetOptions.length > 0 && (
                    <div className="flex items-center gap-1">
                      <select
                        value=""
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          if (!selectedId) return;
                          const { loadResponseSet, saveResponseSet } = useResponseSet();
                          loadResponseSet(selectedId).then((set) => {
                            if (!set) return;
                            // Update or add the current command
                            const cmdText = row.command.trim();
                            if (!cmdText) {
                              pushToast(lang === "zh" ? "当前指令行为空，无法保存" : "Command is empty, cannot save", "warn");
                              return;
                            }
                            const existing = set.commands.findIndex(
                              (c) => c.command.trim().toUpperCase() === cmdText.toUpperCase()
                            );
                            const newResponses = row.expectedResponses || [];
                            const newRegex = row.expectedResponseRegex;
                            if (existing >= 0) {
                              set.commands[existing] = {
                                ...set.commands[existing],
                                expectedResponses: newResponses,
                                expectedResponseRegex: newRegex,
                              };
                            } else {
                              set.commands.push({
                                command: cmdText,
                                expectedResponses: newResponses,
                                expectedResponseRegex: newRegex,
                                matchMode: "all",
                              });
                            }
                            saveResponseSet(selectedId, set).then(() => {
                              pushToast(
                                lang === "zh"
                                  ? `已保存到「${set.name}」`
                                  : `Saved to "${set.name}"`,
                                "success"
                              );
                            });
                          });
                        }}
                        className="text-[10px] rounded border border-[var(--border)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[var(--text-muted)] max-w-[90px]"
                      >
                        <option value="">{lang === "zh" ? "保存到..." : "Save to..."}</option>
                        {responseSetOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                      </select>
                      <span className="w-px h-3 bg-[var(--border)]" />
                      <select
                        value=""
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          if (!selectedId) return;
                          const { loadResponseSet, applyToGrid } = useResponseSet();
                          loadResponseSet(selectedId).then((set) => {
                            if (!set) return;
                            const updates = applyToGrid(set, promptRows);
                            if (updates.length === 0) {
                              pushToast(lang === "zh" ? "响应集中没有匹配的指令" : "No matching commands", "warn");
                              return;
                            }
                            let matchCount = 0;
                            for (const { rowId, expectedResponses, expectedResponseRegex } of updates) {
                              updatePromptRow(rowId, { expectedResponses, expectedResponseRegex });
                              matchCount++;
                            }
                            pushToast(
                              lang === "zh"
                                ? `已从「${set.name}」导入 ${matchCount} 条指令`
                                : `Imported ${matchCount} commands from "${set.name}"`,
                              "success"
                            );
                          });
                        }}
                        className="text-[10px] rounded border border-[var(--border)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[var(--text-primary)] max-w-[130px]"
                      >
                        <option value="">{lang === "zh" ? "从响应集导入..." : "Import from set..."}</option>
                        {responseSetOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  {(row.expectedResponses || []).map((resp, j) => {
                    const isRegex = row.expectedResponseRegex?.[j] ?? false;
                    return (
                      <div key={j} className="flex items-start gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const regex = row.expectedResponseRegex
                              ? [...row.expectedResponseRegex]
                              : (row.expectedResponses || []).map(() => false);
                            regex[j] = !regex[j];
                            updatePromptRow(row.id, { expectedResponseRegex: regex });
                          }}
                          className={`shrink-0 mt-1 px-1.5 py-0.5 text-[9px] font-mono rounded border transition-colors ${
                            isRegex
                              ? "bg-amber-100 border-amber-300 text-amber-700"
                              : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-muted)]"
                          }`}
                          title={isRegex
                            ? (lang === "zh" ? "正则模式" : "Regex mode")
                            : (lang === "zh" ? "文本模式" : "Text mode")
                          }
                        >
                          {isRegex ? ".*" : "Abc"}
                        </button>
                        <textarea
                          value={resp}
                          onChange={(e) => {
                            const responses = [...(row.expectedResponses || [])];
                            responses[j] = e.target.value;
                            const filtered = responses.filter((r) => r.trim() !== "");
                            updatePromptRow(row.id, { expectedResponses: filtered.length > 0 ? filtered : undefined });
                          }}
                          placeholder={isRegex
                            ? (lang === "zh" ? "正则表达式" : "Regex pattern")
                            : (lang === "zh" ? "期望响应内容" : "Expected response")
                          }
                          className="flex-1 text-[11px] bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 resize-y focus:outline-none focus:border-[var(--accent)] min-h-[24px]"
                          rows={Math.max(1, (resp.match(/\n/g)?.length || 0) + 1)}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const responses = (row.expectedResponses || []).filter((_, k) => k !== j);
                            const regex = row.expectedResponseRegex?.filter((_, k) => k !== j);
                            updatePromptRow(row.id, {
                              expectedResponses: responses.length > 0 ? responses : undefined,
                              expectedResponseRegex: regex && regex.length > 0 ? regex : undefined,
                            });
                          }}
                          className="text-rose-400 hover:text-rose-600 p-1 mt-1"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const responses = [...(row.expectedResponses || []), ""];
                      const regex = row.expectedResponseRegex
                        ? [...row.expectedResponseRegex, false]
                        : undefined;
                      updatePromptRow(row.id, { expectedResponses: responses, expectedResponseRegex: regex });
                    }}
                    className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] px-1 py-0.5"
                  >
                    <Plus size={10} />
                    {lang === "zh" ? "添加期望结果" : "Add Response"}
                  </button>
                </div>
              </div>
            )}
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
    <div className="flex flex-col md:flex-row flex-1 min-h-0 gap-1">
      <div className="flex-1 min-h-0 min-w-0">
        <BatchEditor
          value={batchText}
          onChange={handleBatchTextChange}
          placeholder={lang === "zh" ? "每行一条指令，粘贴后自动填充到指令网格" : "One command per line — pasted content auto-fills the command grid"}
          lang={lang}
        />
      </div>
      <div className="flex flex-row md:flex-col gap-1 shrink-0">
        {quickPresets.filter((p) => p.pinned !== false).map((p, i) => (
          <button key={i} type="button" onClick={() => {
            const text = batchText;
            try {
              let flags = "g";
              let pat = p.pattern;
              const m = pat.match(/^\(\?([imsx-]+)\)/);
              if (m) { flags += m[1]; pat = pat.slice(m[0].length); }
              const re = new RegExp(pat, flags);
              const mod = (p as any).mode;
              let result: string;
              if (mod === "keep") {
                result = text.split("\n").filter((l) => re.test(l)).join("\n");
              } else if (mod === "drop") {
                result = text.split("\n").filter((l) => !re.test(l)).join("\n");
              } else {
                result = text.replace(re, p.replacement);
              }
              handleBatchTextChange(result);
              pushToast(lang === "zh" ? `已应用: ${p.name}` : `Applied: ${p.name}`, "success");
            } catch {
              pushToast(lang === "zh" ? `预设执行失败: ${p.name}` : `Failed: ${p.name}`, "error");
            }
          }}
            className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] text-center transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] whitespace-nowrap"
          >
            {p.name}
          </button>
        ))}
        <button type="button" onClick={() => setRegexCleanOpen(true)}
          className="rounded border border-dashed border-[var(--border)] bg-transparent px-2 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] whitespace-nowrap"
        >
          + {lang === "zh" ? "更多" : "More"}
        </button>
      </div>
    </div>
  );

  const tabBar = (
    <div className="flex items-center rounded-md border border-[var(--border)] overflow-hidden">
      <button type="button" onClick={() => handlePromptTabChange("grid")} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors border-r border-[var(--border)]/50 ${activePromptTab === "grid" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"}`}>{t("tab_grid", lang)}</button>
      <button type="button" onClick={() => onNavigateToConfig?.()} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors border-r border-[var(--border)]/50 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-input)]">{t("tab_config", lang)}</button>
      <button type="button" onClick={() => handlePromptTabChange("batch")} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors border-r border-[var(--border)]/50 ${activePromptTab === "batch" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"}`}>{t("tab_batch", lang)}</button>
      <button type="button" onClick={() => onNavigateToResponseSet?.()} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-input)]">{t("response_set", lang)}</button>
      {activePromptTab === "config" && (
        <>
          <span className="mx-2 text-[var(--border)]">|</span>
          <button type="button" onClick={() => { setConfigName(""); setConfigAction("save"); }} className="rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]">{t("save_config", lang)}</button>
          <button type="button" onClick={handleShowLoadList} className="rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]">{t("load_config", lang)}</button>
          <button type="button" onClick={handleOpenConfigDir} className="rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]">{t("open_config_dir", lang)}</button>
        </>
      )}
    </div>
  );

  const buttonBar = (
    <div className="flex items-center gap-2 text-xs">
      <span className="shrink-0 text-[var(--text-muted)]">{t("batch_loop", lang)}</span>
      <Input
        type="number"
        min={1}
        max={9999}
        value={totalLoops}
        onChange={(e) => setTotalLoops(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-16 text-center text-[11px]"
        disabled={batchState.isRunning}
      />
      <span className="text-[var(--text-muted)]">{t("batch_times", lang)}</span>

      <span className="w-px h-4 bg-[var(--border)]" />

      <span className="text-[var(--text-muted)]">
        {batchState.isRunning
          ? `${batchState.currentLoop}/${batchState.totalLoops} - ${batchState.currentIndex + 1}/${batchState.selectedRows.length}`
          : t("batch_ready", lang)
        }
      </span>

      <span className="w-px h-4 bg-[var(--border)]" />

      <Button
        onClick={batchState.isRunning ? stopBatchExecution : startBatchExecution}
        className={`rounded px-3 py-1 text-xs ${
          batchState.isRunning
            ? "bg-rose-500 hover:bg-rose-600 text-white"
            : "bg-[var(--accent)] hover:bg-[var(--accent)]/80 text-white"
        }`}
      >
        {batchState.isRunning ? t("batch_stop", lang) : t("batch_start", lang)}
      </Button>

      {tcpClientCount !== undefined && tcpClientCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            const selected = promptRows.filter((r) => r.selected && r.command.trim());
            if (selected.length === 0) {
              pushToast(lang === "zh" ? "请先选择要广播的指令" : "Select commands to broadcast", "warn");
              return;
            }
            const text = selected.map((r) => r.command).join("\n");
            const bytes = Array.from(new TextEncoder().encode(text));
            tcpServerBroadcast?.(bytes);
            pushToast(lang === "zh" ? `已广播 ${selected.length} 条指令` : `Broadcast ${selected.length} commands`, "success");
          }}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          <Globe size={12} />
          {lang === "zh" ? "广播选中" : "Broadcast"}
        </Button>
      )}
    </div>
  );

    const tabBarWithCount = (
    <div className="mb-1.5 flex items-center text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
      {tabBar}
      <span className="w-px h-4 bg-[var(--border)] mx-2" />
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
        {activePromptTab === "grid" && (
          <div className="relative flex items-center">
            <span className="w-px h-3 bg-[var(--border)] mx-2" />
            <button
              type="button"
              onClick={() => setMatchLogOpen(true)}
              className="flex items-center gap-1 text-[10px] font-normal normal-case text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {matchLog.length > 0 && matchLog[0]?.status === "pending" ? (
                <span className="flex items-center gap-1 text-amber-500">
                  <Loader2 size={10} className="animate-spin" />
                </span>
              ) : matchLog.length > 0 && matchLog[0]?.status === "error" ? (
                <span className="flex items-center gap-1 text-rose-500">
                  <X size={10} />
                </span>
              ) : matchLog.length > 0 && matchLog[0]?.status === "success" ? (
                <span className="flex items-center gap-1 text-emerald-500">
                  <Check size={10} />
                </span>
              ) : null}
              <span>{matchLog.length > 0 ? `${lang === "zh" ? "匹配日志" : "Match Log"} (${matchLog.length})` : (lang === "zh" ? "匹配日志" : "Match Log")}</span>
            </button>
          </div>
        )}
        {activePromptTab === "batch" && (
          <button type="button" onClick={() => setRegexCleanOpen(true)}
            className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
          >
            <Search size={13} />
            {lang === "zh" ? "正则清洗" : "Regex"}
          </button>
        )}
        {activePromptTab === "config" && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => { setConfigName(""); setConfigAction("save"); }} className="rounded px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]">{t("save_config", lang)}</button>
            <button type="button" onClick={handleShowLoadList} className="rounded px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]">{t("load_config", lang)}</button>
            <button type="button" onClick={handleOpenConfigDir} className="rounded px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]">{t("open_config_dir", lang)}</button>
          </div>
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
      <div className="flex flex-col min-h-0 flex-1">
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
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          {batchContent}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
          {configContent}
        </div>
      )}
    </>
  );

  return (
    <>
      {variant === "grid" ? gridVariant : panelVariant}
      {regexCleanOpen && (
        <RegexCleanDialog
          text={batchText}
          lang={lang}
          onApply={(result) => { setBatchText(result); setRegexCleanOpen(false); }}
          onClose={() => setRegexCleanOpen(false)}
        />
      )}
      {matchLogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setMatchLogOpen(false)}>
          <div className="flex max-h-[75vh] w-[680px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl select-text" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{lang === "zh" ? "匹配日志" : "Match Log"}</span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {lang === "zh"
                    ? `成功 ${matchLog.filter(e => e.status === "success").length} / 失败 ${matchLog.filter(e => e.status === "error").length} / 进行中 ${matchLog.filter(e => e.status === "pending").length}`
                    : `OK ${matchLog.filter(e => e.status === "success").length} / Fail ${matchLog.filter(e => e.status === "error").length} / Pending ${matchLog.filter(e => e.status === "pending").length}`
                  }
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMatchLog([])}
                  className="text-[10px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {lang === "zh" ? "清空" : "Clear"}
                </button>
                <button
                  type="button"
                  onClick={() => setMatchLogOpen(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-2 text-xs font-mono leading-relaxed">
              {matchLog.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                  {lang === "zh" ? "暂无匹配记录，发送指令后自动生成" : "No match records yet. Send a command to start."}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {matchLog.map((entry, i) => (
                    <div
                      key={i}
                      className={`px-3 py-1.5 rounded ${
                        entry.status === "success" ? "bg-emerald-50/50" :
                        entry.status === "error" ? "bg-rose-50/50" :
                        ""
                      }`}
                    >
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5">
                          {entry.status === "success" ? (
                            <Check size={12} className="text-emerald-500" />
                          ) : entry.status === "error" ? (
                            <X size={12} className="text-rose-500" />
                          ) : entry.detail.startsWith("[RECV]") ? (
                            <span className="text-[10px] text-[var(--text-muted)]">&gt;</span>
                          ) : entry.detail.startsWith("[MATCH]") ? (
                            <span className="text-[10px] text-amber-500">~</span>
                          ) : (
                            <Loader2 size={10} className="animate-spin text-amber-500" />
                          )}
                        </span>
                        <span className={`text-[11px] ${
                          entry.status === "success" ? "text-emerald-600" :
                          entry.status === "error" ? "text-rose-600" :
                          "text-[var(--text-primary)]"
                        }`}>
                          {entry.detail}
                        </span>
                      </div>
                      {entry.expected && (
                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5 ml-5">
                          <span className="opacity-60">EXPECT: </span>
                          <span className="font-mono">{entry.expected}</span>
                        </div>
                      )}
                      {entry.received && (
                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5 ml-5">
                          <span className="opacity-60">RECV: </span>
                          <span className="font-mono break-all">{entry.received}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
