const fs = require("fs");
let c = fs.readFileSync("D:/repos/SCOM-T/src/components/PromptPanel.tsx", "utf8");

const start = c.indexOf("const tabBarWithCount = (");
const end = c.indexOf("  );", start) + 4;
const oldBlock = c.substring(start, end);

const newBlock = `  const tabBarWithCount = (
    <div className="mb-2 flex items-center text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
      <div className="flex items-center gap-2">
        {tabBar}
        <span className="w-px h-5 bg-[var(--border)]" />
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
        {activePromptTab === "batch" && (
          <button type="button" onClick={() => setRegexCleanOpen(true)}
            className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
          >
            <Search size={13} />
            {lang === "zh" ? "正则清洗" : "Regex Clean"}
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
    </div>
  );`;

c = c.replace(oldBlock, newBlock);
fs.writeFileSync("D:/repos/SCOM-T/src/components/PromptPanel.tsx", c);
console.log("Done - replaced tabBarWithCount");
