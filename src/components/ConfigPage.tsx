import { useEffect, useRef, useState, useCallback } from "react";
import { Save } from "lucide-react";
import { YamlEditor } from "./YamlEditor.tsx";
import { FileSidebar } from "./config/FileSidebar.tsx";
import type { Lang } from "../i18n.ts";

type ConfigPageProps = {
  lang: Lang;
  activeConfigFile?: string;
  onActiveConfigFileChange?: (fileName: string) => void;
};

export function ConfigPage({ lang, activeConfigFile = "prompts.yaml", onActiveConfigFileChange }: ConfigPageProps) {
  const [yamlText, setYamlText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState(activeConfigFile);
  const yamlDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  // ── On mount: load current file ──
  useEffect(() => {
    async function load() {
      try {
        const { join, homeDir } = await import("@tauri-apps/api/path");
        const { readTextFile } = await import("@tauri-apps/plugin-fs");

        // Try to load the current file from prompts directory first
        let filePath: string;
        if (activeConfigFile === "prompts.yaml") {
          filePath = await join(await homeDir(), "SCOM-T", "prompts.yaml");
        } else {
          filePath = await join(await homeDir(), "SCOM-T", "prompts", activeConfigFile);
        }

        const text = await readTextFile(filePath);
        setYamlText(text);
      } catch {
        // File may not exist
      }
      setLoaded(true);
      initialLoadDone.current = true;
    }
    load();
  }, []); // Only run on mount

  // ── Auto-save to prompts.yaml when content changes ──
  useEffect(() => {
    if (!loaded || !initialLoadDone.current) return;
    if (yamlDebounce.current) clearTimeout(yamlDebounce.current);
    yamlDebounce.current = setTimeout(async () => {
      try {
        const { join, homeDir } = await import("@tauri-apps/api/path");
        const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
        const dir = await join(await homeDir(), "SCOM-T");
        await mkdir(dir, { recursive: true }).catch(() => {});

        // Save to the current file
        let savePath: string;
        if (currentFile === "prompts.yaml") {
          savePath = await join(dir, "prompts.yaml");
        } else {
          savePath = await join(dir, "prompts", currentFile);
        }

        await writeTextFile(savePath, yamlText);

        // Also sync to prompts.yaml if editing a file from prompts directory
        if (currentFile !== "prompts.yaml") {
          const mainPath = await join(dir, "prompts.yaml");
          await writeTextFile(mainPath, yamlText);
        }
      } catch (e) {
        console.error("Auto-save failed", e);
      }
    }, 500);
  }, [yamlText, loaded, currentFile]);

  // ── Load a specific file ──
  const loadFile = useCallback(
    async (fileName: string) => {
      setCurrentFile((prevFile) => {
        if (fileName === prevFile) return prevFile;

        // Load the file content
        (async () => {
          try {
            const { join, homeDir } = await import("@tauri-apps/api/path");
            const { readTextFile } = await import("@tauri-apps/plugin-fs");

            let filePath: string;
            if (fileName === "prompts.yaml") {
              filePath = await join(await homeDir(), "SCOM-T", "prompts.yaml");
            } else {
              filePath = await join(await homeDir(), "SCOM-T", "prompts", fileName);
            }

            const text = await readTextFile(filePath);
            setYamlText(text);
          } catch (e) {
            console.error("Failed to load file:", e);
          }
        })();

        // Persist the selection
        onActiveConfigFileChange?.(fileName);

        return fileName;
      });
    },
    [onActiveConfigFileChange],
  );

  // ── File operations handlers ──
  const handleFileSelect = useCallback(
    (fileName: string) => {
      // For now, auto-save before switching (can add confirmation dialog later)
      loadFile(fileName);
    },
    [loadFile],
  );

  const handleFileCreate = useCallback(
    (fileName: string) => {
      loadFile(fileName);
    },
    [loadFile],
  );

  const handleFileRename = useCallback(
    (oldName: string, newName: string) => {
      if (currentFile === oldName) {
        setCurrentFile(newName);
      }
    },
    [currentFile],
  );

  const handleFileDelete = useCallback(
    (fileName: string) => {
      if (currentFile === fileName) {
        loadFile("prompts.yaml");
      }
    },
    [currentFile, loadFile],
  );

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden bg-[var(--bg-primary)]">
      {/* ── Main content area ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Editor ── */}
        <div className="flex flex-col min-h-0 flex-1 min-w-0">
          <YamlEditor
            value={yamlText}
            onChange={setYamlText}
            error={null}
            lang={lang}
          />
        </div>

        {/* ── Sidebar ── */}
        <FileSidebar
          lang={lang}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          currentFile={currentFile}
          onFileSelect={handleFileSelect}
          onFileCreate={handleFileCreate}
          onFileRename={handleFileRename}
          onFileDelete={handleFileDelete}
        />
      </div>

      {/* ── Footer ── */}
      <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5">
        <Save size={11} className="text-[var(--text-muted)]" />
        <span className="text-[10px] text-[var(--text-muted)]">
          {currentFile === "prompts.yaml"
            ? lang === "zh"
              ? "自动保存至 ~/SCOM-T/prompts.yaml"
              : "Auto-saved to ~/SCOM-T/prompts.yaml"
            : lang === "zh"
              ? `正在编辑: ${currentFile}`
              : `Editing: ${currentFile}`}
        </span>
      </footer>
    </div>
  );
}

export default ConfigPage;