import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Save, FolderOpen, Download } from "lucide-react";
import { YamlEditor } from "./YamlEditor.tsx";
import { Button } from "./ui/Button.tsx";
import { serializeToYaml } from "../utils/yamlConfig.ts";
import { usePromptConfig } from "../hooks/usePromptConfig.ts";
import type { Lang } from "../i18n.ts";

type ConfigPageProps = {
  lang: Lang;
  pushToast: (msg: string, type: "success" | "error" | "warn") => void;
  onBack: () => void;
};

export function ConfigPage({ lang, pushToast, onBack }: ConfigPageProps) {
  const promptConfig = usePromptConfig();
  const [yamlText, setYamlText] = useState("");
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const yamlDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── On mount: load ~/SCOM-T/prompts.yaml ──
  useEffect(() => {
    async function load() {
      try {
        const { join, homeDir } = await import("@tauri-apps/api/path");
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await join(await homeDir(), "SCOM-T", "prompts.yaml");
        const text = await readTextFile(path);
        setYamlText(text);
      } catch { /* file may not exist */ }
      setLoaded(true);
    }
    load();
  }, []);

  // ── Auto-save to prompts.yaml when content changes ──
  useEffect(() => {
    if (!loaded) return;
    if (yamlDebounce.current) clearTimeout(yamlDebounce.current);
    yamlDebounce.current = setTimeout(async () => {
      try {
        const { join, homeDir } = await import("@tauri-apps/api/path");
        const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
        const dir = await join(await homeDir(), "SCOM-T");
        await mkdir(dir, { recursive: true }).catch(() => {});
        const path = await join(dir, "prompts.yaml");
        await writeTextFile(path, yamlText);
      } catch (e) {
        console.error("Auto-save failed", e);
      }
    }, 800);
    return () => { if (yamlDebounce.current) clearTimeout(yamlDebounce.current); };
  }, [yamlText, loaded]);

  // ── Open config directory ──
  const handleOpenDir = useCallback(async () => {
    try {
      await promptConfig.openConfigDir();
    } catch (e) {
      pushToast(`${lang === "zh" ? "打开目录失败" : "Failed to open directory"}: ${e}`, "error");
    }
  }, [promptConfig, pushToast, lang]);

  // ── Load a saved config into the editor ──
  const handleLoadConfig = useCallback(async () => {
    try {
      const names = await promptConfig.listConfigs();
      if (names.length === 0) {
        pushToast(lang === "zh" ? "没有保存的配置" : "No saved configs", "warn");
        return;
      }
      const rows = await promptConfig.loadConfig(names[0]);
      const yaml = serializeToYaml(rows);
      setYamlText(yaml);
      setYamlError(null);
      pushToast(`${lang === "zh" ? "已加载" : "Loaded"}: ${names[0]}`, "success");
    } catch (e) {
      pushToast(`${lang === "zh" ? "加载失败" : "Load failed"}: ${e}`, "error");
    }
  }, [promptConfig, pushToast, lang]);

  // Clean up debounce on unmount
  useEffect(() => {
    return () => { if (yamlDebounce.current) clearTimeout(yamlDebounce.current); };
  }, []);

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden bg-[var(--bg-primary)]">
      {/* ── Header ── */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-surface)] px-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={14} />
            {lang === "zh" ? "返回" : "Back"}
          </button>
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {lang === "zh" ? "配置文件管理" : "Config File Manager"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleOpenDir}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)]"
            title={lang === "zh" ? "打开配置目录" : "Open config directory"}
          >
            <FolderOpen size={13} />
            {lang === "zh" ? "配置目录" : "Config Dir"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLoadConfig}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)]"
            title={lang === "zh" ? "加载已保存的配置" : "Load saved config"}
          >
            <Download size={13} />
            {lang === "zh" ? "加载配置" : "Load Config"}
          </Button>
        </div>
      </header>

      {/* ── Editor ── */}
      <div className="flex flex-col min-h-0 flex-1">
        <YamlEditor
          value={yamlText}
          onChange={setYamlText}
          error={yamlError}
          lang={lang}
        />
      </div>

      {/* ── Footer ── */}
      <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5">
        <Save size={11} className="text-[var(--text-muted)]" />
        <span className="text-[10px] text-[var(--text-muted)]">
          {lang === "zh" ? "自动保存至 ~/SCOM-T/prompts.yaml" : "Auto-saved to ~/SCOM-T/prompts.yaml"}
        </span>
      </footer>
    </div>
  );
}

export default ConfigPage;
