import { useEffect, useState } from "react";
import { Cloud, Download, Edit3, RefreshCw, Save, Store, Trash2, Upload } from "lucide-react";
import { Button } from "./ui/Button.tsx";
import { Input } from "./ui/Input.tsx";
import { t } from "../i18n";
import type { Lang } from "../i18n";
import {
  useCloudMarketplace,
  ItemExistsError,
  type MarketplaceItem,
  type MarketplaceItemType,
  type MarketplaceFetchState,
  type MarketplaceDownload,
} from "../hooks/useCloudMarketplace";
import { useResponseSet, type ResponseSet } from "../hooks/useResponseSet";
import { usePromptConfig } from "../hooks/usePromptConfig";
import type { PromptRow } from "../utils/yamlConfig";
import { ResponseSetCommandEditor } from "./ResponseSetCommandEditor.tsx";
import { PromptConfigRowEditor } from "./PromptConfigRowEditor.tsx";

type MarketplacePageProps = {
  lang: Lang;
  serverUrl: string;
  authToken?: string;
  uploaderName?: string;
  onClose: () => void;
  onApply?: (responseSetId: string) => void;
  onApplyPromptConfig?: (configName: string) => void;
};

type TypeFilter = "all" | MarketplaceItemType;

export function MarketplacePage({
  lang,
  serverUrl,
  authToken,
  uploaderName,
  onClose: _onClose,
  onApply,
  onApplyPromptConfig,
}: MarketplacePageProps) {
  const { listMarketplaceItems, downloadMarketplaceItem, uploadMarketplaceItem, deleteMarketplaceItem } =
    useCloudMarketplace();
  const { listResponseSets, loadResponseSet, saveResponseSet } = useResponseSet();
  const { listConfigs, loadConfig, saveConfig } = usePromptConfig();

  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [fetchState, setFetchState] = useState<MarketplaceFetchState>("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [preview, setPreview] = useState<MarketplaceDownload | null>(null);
  const [previewState, setPreviewState] = useState<MarketplaceFetchState>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editedSet, setEditedSet] = useState<ResponseSet | null>(null);
  const [editedRows, setEditedRows] = useState<PromptRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [localSets, setLocalSets] = useState<{ fileId: string; name: string }[]>([]);
  const [localConfigs, setLocalConfigs] = useState<string[]>([]);
  const [uploadType, setUploadType] = useState<MarketplaceItemType>("response_set");
  const [uploadTarget, setUploadTarget] = useState("");
  const [uploadId, setUploadId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [collision, setCollision] = useState<{ name: string; type: MarketplaceItemType; updatedAt?: string } | null>(
    null,
  );

  const hasToken = !!authToken && authToken.trim().length > 0;

  function refresh() {
    if (!serverUrl.trim()) {
      setFetchState("error");
      setFetchError(t("marketplace_no_server", lang));
      return;
    }
    if (!hasToken) {
      setFetchState("error");
      setFetchError(t("marketplace_token_required", lang));
      return;
    }
    setFetchState("loading");
    setFetchError(null);
    listMarketplaceItems(serverUrl, authToken)
      .then((list) => {
        setItems(list);
        setFetchState("loaded");
      })
      .catch((e) => {
        setFetchState("error");
        setFetchError(e instanceof Error ? e.message : String(e));
      });
  }

  useEffect(() => {
    refresh();
  }, [serverUrl, authToken]);

  useEffect(() => {
    listResponseSets().then(async (fileIds) => {
      const withNames = await Promise.all(
        fileIds.map(async (fileId) => {
          const set = await loadResponseSet(fileId);
          return { fileId, name: set?.name || fileId };
        }),
      );
      setLocalSets(withNames);
    });
    listConfigs().then(setLocalConfigs);
  }, []);

  const filteredItems = items.filter((i) => typeFilter === "all" || i.type === typeFilter);
  const selected = items.find((i) => i.id === selectedId) || null;

  useEffect(() => {
    setEditing(false);
    setEditedSet(null);
    setEditedRows(null);
    setSaveError(null);
    if (!selected) {
      setPreview(null);
      setPreviewState("idle");
      setPreviewError(null);
      return;
    }
    setPreviewState("loading");
    setPreviewError(null);
    downloadMarketplaceItem(serverUrl, selected.id, authToken)
      .then((result) => {
        setPreview(result);
        setPreviewState("loaded");
      })
      .catch((e) => {
        setPreview(null);
        setPreviewState("error");
        setPreviewError(e instanceof Error ? e.message : String(e));
      });
  }, [selectedId]);

  async function handleDownloadAndApply() {
    if (!selected || !preview) return;
    setApplying(true);
    setApplyError(null);
    try {
      if (preview.type === "response_set") {
        await saveResponseSet(selected.id, preview.set);
        onApply?.(selected.id);
      } else {
        await saveConfig(selected.id, preview.rows);
        onApplyPromptConfig?.(selected.id);
      }
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  async function handleDownloadOnly() {
    if (!selected || !preview) return;
    setDownloading(true);
    setApplyError(null);
    try {
      if (preview.type === "response_set") {
        await saveResponseSet(selected.id, preview.set);
      } else {
        await saveConfig(selected.id, preview.rows);
      }
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setDeleting(true);
    setApplyError(null);
    try {
      await deleteMarketplaceItem(serverUrl, selected.id, authToken);
      setSelectedId(null);
      refresh();
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function startEditing() {
    if (!preview || !selected) return;
    if (preview.type === "response_set") {
      setEditedSet({ ...preview.set });
    } else {
      setEditedRows([...preview.rows]);
    }
    setEditing(true);
    setSaveError(null);
  }

  function cancelEditing() {
    setEditing(false);
    setEditedSet(null);
    setEditedRows(null);
    setSaveError(null);
  }

  async function handleSaveEdit() {
    if (!selected || !preview) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (preview.type === "response_set" && editedSet) {
        await uploadMarketplaceItem(serverUrl, selected.id, "response_set", editedSet, authToken, true, uploaderName);
        setPreview({ type: "response_set", set: editedSet });
      } else if (preview.type === "prompt_config" && editedRows) {
        await uploadMarketplaceItem(serverUrl, selected.id, "prompt_config", editedRows, authToken, true, uploaderName);
        setPreview({ type: "prompt_config", rows: editedRows });
      }
      setEditing(false);
      setEditedSet(null);
      setEditedRows(null);
      refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doUpload(overwrite: boolean) {
    if (!uploadTarget || !uploadId.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      if (uploadType === "response_set") {
        const set = await loadResponseSet(uploadTarget);
        if (!set) throw new Error(t("marketplace_upload_load_error", lang));
        await uploadMarketplaceItem(serverUrl, uploadId.trim(), "response_set", set, authToken, overwrite, uploaderName);
      } else {
        const rows = await loadConfig(uploadTarget);
        await uploadMarketplaceItem(serverUrl, uploadId.trim(), "prompt_config", rows, authToken, overwrite, uploaderName);
      }
      setCollision(null);
      setShowUpload(false);
      setUploadTarget("");
      setUploadId("");
      refresh();
    } catch (e) {
      if (e instanceof ItemExistsError) {
        setCollision(e.existing);
      } else {
        setUploadError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleUpload() {
    await doUpload(false);
  }

  async function handleConfirmOverwrite() {
    await doUpload(true);
  }

  if (!hasToken) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)] gap-2 px-6 text-center">
        <Cloud size={14} />
        {t("marketplace_token_required", lang)}
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 shrink-0">
        <Button
          type="button"
          onClick={refresh}
          disabled={fetchState === "loading"}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-40"
        >
          <RefreshCw size={12} className={fetchState === "loading" ? "animate-spin" : ""} />
          {t("marketplace_refresh", lang)}
        </Button>
        <Button
          type="button"
          onClick={() => setShowUpload((v) => !v)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          <Upload size={12} />
          {t("marketplace_upload", lang)}
        </Button>
        {selected && !editing && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-[var(--border)] text-rose-500 hover:opacity-80 disabled:opacity-40"
            >
              {deleting ? <span className="animate-spin">⟳</span> : <Trash2 size={12} />}
              {t("marketplace_delete", lang)}
            </Button>
            <Button
              type="button"
              onClick={startEditing}
              disabled={previewState !== "loaded"}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-40"
            >
              <Edit3 size={12} />
              {t("marketplace_edit", lang)}
            </Button>
            <Button
              type="button"
              onClick={handleDownloadOnly}
              disabled={downloading || previewState !== "loaded"}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-40"
            >
              {downloading ? <span className="animate-spin">⟳</span> : <Download size={12} />}
              {t("marketplace_download_only", lang)}
            </Button>
            <Button
              type="button"
              onClick={handleDownloadAndApply}
              disabled={applying}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80 disabled:opacity-40"
            >
              {applying ? <span className="animate-spin">⟳</span> : <Download size={12} />}
              {t("marketplace_download_apply", lang)}
            </Button>
          </div>
        )}
        {selected && editing && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] hover:opacity-80 disabled:opacity-40"
            >
              {t("marketplace_cancel", lang)}
            </Button>
            <Button
              type="button"
              onClick={handleSaveEdit}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80 disabled:opacity-40"
            >
              {saving ? <span className="animate-spin">⟳</span> : <Save size={12} />}
              {t("marketplace_save", lang)}
            </Button>
          </div>
        )}
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="border-b border-[var(--border)] p-3 space-y-2 shrink-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t("marketplace_upload_hint", lang)}
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] overflow-hidden w-fit">
            <button
              type="button"
              onClick={() => {
                setUploadType("response_set");
                setUploadTarget("");
              }}
              className={`px-2.5 py-1 text-[10px] transition-colors ${
                uploadType === "response_set"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {t("marketplace_type_response_set", lang)}
            </button>
            <button
              type="button"
              onClick={() => {
                setUploadType("prompt_config");
                setUploadTarget("");
              }}
              className={`px-2.5 py-1 text-[10px] transition-colors ${
                uploadType === "prompt_config"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {t("marketplace_type_prompt_config", lang)}
            </button>
          </div>
          <select
            value={uploadTarget}
            onChange={(e) => setUploadTarget(e.target.value)}
            className="input w-full text-xs"
          >
            <option value="">{t("marketplace_upload_select", lang)}</option>
            {uploadType === "response_set"
              ? localSets.map(({ fileId, name }) => (
                  <option key={fileId} value={fileId}>
                    {name}
                  </option>
                ))
              : localConfigs.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
          </select>
          <Input
            type="text"
            value={uploadId}
            onChange={(e) => setUploadId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
            placeholder={t("marketplace_upload_id_placeholder", lang)}
            className="w-full text-xs"
          />
          {uploadError && <div className="text-xs text-rose-500">{uploadError}</div>}
          {collision && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 space-y-1.5 text-xs text-amber-800">
              <div>{t("marketplace_overwrite_confirm", lang).replace("%s", collision.name)}</div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={handleConfirmOverwrite}
                  disabled={uploading}
                  className="rounded-lg px-2.5 py-1 text-xs bg-amber-600 text-white hover:opacity-80 disabled:opacity-40"
                >
                  {t("marketplace_overwrite", lang)}
                </Button>
                <Button
                  type="button"
                  onClick={() => setCollision(null)}
                  className="rounded-lg px-2.5 py-1 text-xs border border-[var(--border)] text-[var(--text-muted)] hover:opacity-80"
                >
                  {t("marketplace_cancel", lang)}
                </Button>
              </div>
            </div>
          )}
          <Button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !uploadTarget || !uploadId.trim()}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80 disabled:opacity-40"
          >
            {uploading ? <span className="animate-spin">⟳</span> : <Upload size={12} />}
            {t("marketplace_upload_confirm", lang)}
          </Button>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-64 shrink-0 border-r border-[var(--border)] p-3 flex flex-col">
          <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] overflow-hidden mb-2 w-fit">
            {(["all", "response_set", "prompt_config"] as TypeFilter[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTypeFilter(tf)}
                className={`px-2 py-1 text-[10px] transition-colors ${
                  typeFilter === tf
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                {tf === "all"
                  ? t("marketplace_type_all", lang)
                  : tf === "response_set"
                    ? t("marketplace_type_response_set", lang)
                    : t("marketplace_type_prompt_config", lang)}
              </button>
            ))}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            {t("marketplace_list", lang)}
            <span className="ml-1 font-normal normal-case">({filteredItems.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {fetchState === "loading" && (
              <div className="text-[10px] text-[var(--text-muted)] text-center py-8">
                {t("marketplace_loading", lang)}
              </div>
            )}
            {fetchState === "error" && (
              <div className="text-[10px] text-rose-500 text-center py-8">
                {fetchError || t("marketplace_fetch_error", lang)}
              </div>
            )}
            {fetchState === "loaded" && filteredItems.length === 0 && (
              <div className="text-[10px] text-[var(--text-muted)] text-center py-8">
                {t("marketplace_empty", lang)}
              </div>
            )}
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  selectedId === item.id
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Cloud size={13} />
                <span className="truncate flex-1">{item.name}</span>
                <span className="shrink-0 text-[9px] opacity-70 uppercase">
                  {item.type === "prompt_config" ? "cfg" : "set"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right preview */}
        <div className="flex-1 flex flex-col min-h-0">
          {selected ? (
            <div className="flex-1 p-3 space-y-3 overflow-y-auto min-h-0">
              <Input type="text" value={selected.name} readOnly className="w-full text-sm" />
              <Input
                type="text"
                value={selected.description || ""}
                readOnly
                placeholder={lang === "zh" ? "无描述" : "No description"}
                className="w-full text-xs"
              />
              {(selected.uploadedBy || selected.updatedAt) && (
                <div className="text-[10px] text-[var(--text-muted)] space-y-0.5">
                  {selected.uploadedBy && (
                    <div>
                      {t("marketplace_uploaded_by", lang)}: {selected.uploadedBy}
                    </div>
                  )}
                  {selected.updatedAt && (
                    <div>
                      {t("marketplace_updated_at", lang)}: {new Date(selected.updatedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {editing && (
                <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">
                  {t("marketplace_editing", lang)}
                </div>
              )}

              {previewState === "loading" && (
                <div className="text-[10px] text-[var(--text-muted)] py-4 text-center">
                  {t("marketplace_loading", lang)}
                </div>
              )}
              {previewState === "error" && <div className="text-xs text-rose-500">{previewError}</div>}

              {previewState === "loaded" && preview && (
                <>
                  {editing ? (
                    preview.type === "response_set" && editedSet ? (
                      <ResponseSetCommandEditor
                        lang={lang}
                        commands={editedSet.commands}
                        onChange={(commands) => setEditedSet({ ...editedSet, commands })}
                      />
                    ) : editedRows ? (
                      <PromptConfigRowEditor lang={lang} rows={editedRows} onChange={setEditedRows} />
                    ) : null
                  ) : preview.type === "response_set" ? (
                    <>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] pt-1">
                        {t("marketplace_commands", lang)}
                        <span className="ml-1 font-normal normal-case">({preview.set.commands.length})</span>
                      </div>
                      {preview.set.commands.length === 0 ? (
                        <div className="text-[10px] text-[var(--text-muted)] py-4 text-center">
                          {t("marketplace_no_commands", lang)}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {preview.set.commands.map((c, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border border-[var(--border)] p-2 space-y-1 bg-[var(--bg-input)]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs text-[var(--text-primary)] truncate">
                                  {c.command}
                                </span>
                                <span className="shrink-0 text-[10px] text-[var(--text-muted)] uppercase">
                                  {c.matchMode}
                                </span>
                              </div>
                              {c.expectedResponses.length > 0 ? (
                                <div className="space-y-0.5">
                                  {c.expectedResponses.map((r, i) => (
                                    <div key={i} className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                                      {c.expectedResponseRegex?.[i] ? "/" : ""}
                                      {r}
                                      {c.expectedResponseRegex?.[i] ? "/" : ""}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[11px] text-[var(--text-muted)] italic">
                                  {t("marketplace_no_expected_response", lang)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] pt-1">
                        {t("marketplace_commands", lang)}
                        <span className="ml-1 font-normal normal-case">({preview.rows.length})</span>
                      </div>
                      {preview.rows.length === 0 ? (
                        <div className="text-[10px] text-[var(--text-muted)] py-4 text-center">
                          {t("marketplace_no_commands", lang)}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {preview.rows.map((r, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border border-[var(--border)] p-2 space-y-1 bg-[var(--bg-input)]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs text-[var(--text-primary)] truncate">
                                  {r.command}
                                </span>
                                <span className="shrink-0 text-[10px] text-[var(--text-muted)] uppercase">
                                  {r.isHex ? "HEX" : ""} {r.ender ? r.ender.replace("\r\n", "CRLF").replace("\r", "CR").replace("\n", "LF") : "None"}
                                </span>
                              </div>
                              {r.expectedResponses && r.expectedResponses.length > 0 && (
                                <div className="space-y-0.5">
                                  {r.expectedResponses.map((resp, i) => (
                                    <div key={i} className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                                      {resp}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {applyError && <div className="text-xs text-rose-500">{applyError}</div>}
              {saveError && <div className="text-xs text-rose-500">{saveError}</div>}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)] gap-2">
              <Store size={14} />
              {t("marketplace_select_hint", lang)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
