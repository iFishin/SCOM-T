import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, File, Trash2, Pencil } from "lucide-react";
import { Button } from "../ui/Button";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { t } from "../../i18n";
import type { Lang } from "../../i18n";

type FileSidebarProps = {
  lang: Lang;
  isOpen: boolean;
  onToggle: () => void;
  currentFile: string;
  onFileSelect: (fileName: string) => void;
  onFileCreate: (fileName: string) => void;
  onFileRename: (oldName: string, newName: string) => void;
  onFileDelete: (fileName: string) => void;
};

export function FileSidebar({
  lang,
  isOpen,
  onToggle,
  currentFile,
  onFileSelect,
  onFileCreate,
  onFileRename,
  onFileDelete,
}: FileSidebarProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Load files from ~/SCOM-T/prompts/ directory
  const loadFiles = useCallback(async () => {
    try {
      const { join, homeDir } = await import("@tauri-apps/api/path");
      const { readDir, exists, mkdir } = await import("@tauri-apps/plugin-fs");

      const dir = await join(await homeDir(), "SCOM-T", "prompts");

      // Create directory if it doesn't exist
      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
        setFiles([]);
        return;
      }

      const entries = await readDir(dir);
      const yamlFiles = entries
        .filter((e) => e.name?.endsWith(".yaml") || e.name?.endsWith(".yml"))
        .map((e) => e.name!)
        .sort();

      setFiles(yamlFiles);
    } catch (e) {
      console.error("Failed to load config files:", e);
      setFiles([]);
    }
  }, []);

  // Load files on mount and when sidebar opens
  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
  }, [isOpen, loadFiles]);

  // Focus input when creating or renaming
  useEffect(() => {
    if (isCreating || renamingFile) {
      inputRef.current?.focus();
    }
  }, [isCreating, renamingFile]);

  const handleContextMenu = (e: React.MouseEvent, file: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;

    const fileName = newFileName.trim().endsWith(".yaml")
      ? newFileName.trim()
      : `${newFileName.trim()}.yaml`;

    try {
      const { join, homeDir } = await import("@tauri-apps/api/path");
      const { writeTextFile, exists } = await import("@tauri-apps/plugin-fs");

      const dir = await join(await homeDir(), "SCOM-T", "prompts");
      const filePath = await join(dir, fileName);

      // Check if file already exists
      if (await exists(filePath)) {
        alert(lang === "zh" ? "文件已存在" : "File already exists");
        return;
      }

      // Create YAML file with default template (10 empty command slots)
      const template = `Commands:
${Array.from({ length: 10 }, (_, i) => `  - command: ''
    hex_mode: false
    line_ending: CRLF
    timeout: 0
    order: ${i + 1}`).join('\n')}
`;
      await writeTextFile(filePath, template);

      setNewFileName("");
      setIsCreating(false);
      await loadFiles();
      onFileCreate(fileName);
    } catch (e) {
      console.error("Failed to create file:", e);
    }
  };

  const handleRenameFile = async () => {
    if (!renamingFile || !renameValue.trim()) return;

    const oldName = renamingFile;
    const newName = renameValue.trim().endsWith(".yaml")
      ? renameValue.trim()
      : `${renameValue.trim()}.yaml`;

    if (oldName === newName) {
      setRenamingFile(null);
      return;
    }

    try {
      const { join, homeDir } = await import("@tauri-apps/api/path");
      const { rename, exists } = await import("@tauri-apps/plugin-fs");

      const dir = await join(await homeDir(), "SCOM-T", "prompts");
      const oldPath = await join(dir, oldName);
      const newPath = await join(dir, newName);

      // Check if new name already exists
      if (await exists(newPath)) {
        alert(lang === "zh" ? "文件已存在" : "File already exists");
        return;
      }

      await rename(oldPath, newPath);

      setRenamingFile(null);
      setRenameValue("");
      await loadFiles();
      onFileRename(oldName, newName);
    } catch (e) {
      console.error("Failed to rename file:", e);
    }
  };

  const handleDeleteFile = async (fileName: string) => {
    try {
      const { join, homeDir } = await import("@tauri-apps/api/path");
      const { remove } = await import("@tauri-apps/plugin-fs");

      const dir = await join(await homeDir(), "SCOM-T", "prompts");
      const filePath = await join(dir, fileName);

      await remove(filePath);
      await loadFiles();
      onFileDelete(fileName);
    } catch (e) {
      console.error("Failed to delete file:", e);
    }
  };

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        {
          id: "rename",
          label: t("config_rename", lang),
          onClick: () => {
            setRenamingFile(contextMenu.file);
            setRenameValue(contextMenu.file.replace(/\.yaml$/, ""));
            setContextMenu(null);
          },
        },
        {
          id: "delete",
          label: t("config_delete", lang),
          onClick: () => {
            if (confirm(t("config_delete_confirm", lang))) {
              handleDeleteFile(contextMenu.file);
            }
            setContextMenu(null);
          },
        },
      ]
    : [];

  return (
    <>
      <div
        className="flex h-full border-l border-[var(--border)] bg-[var(--bg-surface)] transition-all duration-300"
        style={{ width: isOpen ? 240 : 0 }}
      >
        {isOpen && (
          <div className="flex flex-col w-[240px] min-w-[240px]">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                {t("config_files", lang)}
              </span>
              <Button
                type="button"
                onClick={onToggle}
                className="p-1 rounded hover:bg-[var(--bg-input)]"
              >
                <ChevronRight size={14} className="text-[var(--text-muted)]" />
              </Button>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto">
              {/* Main prompts.yaml file - always shown */}
              <div
                className={`group flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors ${
                  currentFile === "prompts.yaml"
                    ? "bg-[var(--accent)] text-white"
                    : "hover:bg-[var(--bg-input)] text-[var(--text-primary)]"
                }`}
                onClick={() => onFileSelect("prompts.yaml")}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <File size={14} className="shrink-0" />
                  <span className="text-sm truncate">prompts.yaml</span>
                </div>
                {currentFile === "prompts.yaml" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-white">
                    {t("config_active", lang)}
                  </span>
                )}
              </div>

              {/* Divider if there are other files */}
              {files.length > 0 && (
                <div className="border-t border-[var(--border)]" />
              )}

              {/* Other files from prompts/ directory */}
              <div className="divide-y divide-[var(--border)]">
                {files.map((file) => (
                  <div
                    key={file}
                    className={`group flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors ${
                      currentFile === file
                        ? "bg-[var(--accent)] text-white"
                        : "hover:bg-[var(--bg-input)] text-[var(--text-primary)]"
                    }`}
                    onClick={() => onFileSelect(file)}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                  >
                    {renamingFile === file ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRenameFile}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameFile();
                          if (e.key === "Escape") setRenamingFile(null);
                        }}
                        className="w-full text-sm bg-transparent border border-[var(--accent)] rounded px-2 py-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <File size={14} className="shrink-0" />
                          <span className="text-sm truncate">{file.replace(/\.yaml$/, "")}</span>
                        </div>
                        <div className="hidden group-hover:flex items-center gap-1">
                          {currentFile === file && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-white mr-1">
                              {t("config_active", lang)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingFile(file);
                              setRenameValue(file.replace(/\.yaml$/, ""));
                            }}
                            className="p-1 rounded hover:bg-[var(--bg-primary)]"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(t("config_delete_confirm", lang))) {
                                handleDeleteFile(file);
                              }
                            }}
                            className="p-1 rounded hover:bg-[var(--bg-primary)] text-rose-500"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* New file input */}
            {isCreating && (
              <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-input)]">
                <input
                  ref={inputRef}
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onBlur={() => {
                    if (!newFileName.trim()) setIsCreating(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFile();
                    if (e.key === "Escape") setIsCreating(false);
                  }}
                  placeholder={t("config_new_name_hint", lang)}
                  className="w-full text-sm bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            )}

            {/* Footer - Add button */}
            <div className="px-3 py-2 border-t border-[var(--border)]">
              <Button
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--bg-input)] transition-colors"
              >
                <Plus size={14} />
                {t("config_new", lang)}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Toggle button (always visible) */}
      <div className="flex items-center border-l border-[var(--border)] bg-[var(--bg-surface)]">
        <Button
          type="button"
          onClick={onToggle}
          className="h-full px-1.5 py-4 hover:bg-[var(--bg-input)] transition-colors"
        >
          {isOpen ? (
            <ChevronRight size={16} className="text-[var(--text-muted)]" />
          ) : (
            <ChevronLeft size={16} className="text-[var(--text-muted)]" />
          )}
        </Button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
