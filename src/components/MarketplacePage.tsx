import { useEffect, useState } from "react";
import { Cloud, Download, RefreshCw, Store } from "lucide-react";
import { Button } from "./ui/Button.tsx";
import { Input } from "./ui/Input.tsx";
import { t } from "../i18n";
import type { Lang } from "../i18n";
import { useCloudMarketplace, type MarketplaceItem, type MarketplaceFetchState } from "../hooks/useCloudMarketplace";
import { useResponseSet } from "../hooks/useResponseSet";

type MarketplacePageProps = {
  lang: Lang;
  serverUrl: string;
  authToken?: string;
  onClose: () => void;
  onApply?: (responseSetId: string) => void;
};

export function MarketplacePage({ lang, serverUrl, authToken, onClose: _onClose, onApply }: MarketplacePageProps) {
  const { listMarketplaceItems, downloadMarketplaceItem } = useCloudMarketplace();
  const { saveResponseSet } = useResponseSet();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [fetchState, setFetchState] = useState<MarketplaceFetchState>("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  function refresh() {
    if (!serverUrl.trim()) {
      setFetchState("error");
      setFetchError(t("marketplace_no_server", lang));
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

  const selected = items.find((i) => i.id === selectedId) || null;

  async function handleDownloadAndApply() {
    if (!selected) return;
    setApplying(true);
    setApplyError(null);
    try {
      const set = await downloadMarketplaceItem(serverUrl, selected.id, authToken);
      await saveResponseSet(selected.id, set);
      onApply?.(selected.id);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
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
        {selected && (
          <Button
            type="button"
            onClick={handleDownloadAndApply}
            disabled={applying}
            className="ml-auto flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80 disabled:opacity-40"
          >
            {applying ? <span className="animate-spin">⟳</span> : <Download size={12} />}
            {t("marketplace_download_apply", lang)}
          </Button>
        )}
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-52 shrink-0 border-r border-[var(--border)] p-3 flex flex-col">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            {t("marketplace_list", lang)}
            <span className="ml-1 font-normal normal-case">({items.length})</span>
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
            {fetchState === "loaded" && items.length === 0 && (
              <div className="text-[10px] text-[var(--text-muted)] text-center py-8">
                {t("marketplace_empty", lang)}
              </div>
            )}
            {items.map((item) => (
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
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right preview */}
        <div className="flex-1 flex flex-col min-h-0">
          {selected ? (
            <div className="p-3 space-y-3">
              <Input type="text" value={selected.name} readOnly className="w-full text-sm" />
              <Input
                type="text"
                value={selected.description || ""}
                readOnly
                placeholder={lang === "zh" ? "无描述" : "No description"}
                className="w-full text-xs"
              />
              {applyError && (
                <div className="text-xs text-rose-500">{applyError}</div>
              )}
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
