import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Zap, Database } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";
import type { MockSerialConfig, MockResponse } from "../../hooks/useSettings.ts";
import { RESPONSE_TEMPLATE_GROUPS } from "../../serial/mockTemplates.ts";
import type { ResponseTemplateGroup, ResponseTemplate } from "../../serial/mockTemplates.ts";
import { BUILTIN_MOCK_RESPONSES } from "../../serial/SerialService.ts";

type MockSerialSettingsProps = {
  lang: Lang;
  mockSerial: MockSerialConfig;
  onMockSerialChange: (config: MockSerialConfig) => void;
};

export function MockSerialSettings({ lang, mockSerial, onMockSerialChange }: MockSerialSettingsProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [showBuiltin, setShowBuiltin] = useState(false);

  function handleToggle() {
    onMockSerialChange({ ...mockSerial, enabled: !mockSerial.enabled });
  }

  function handleDelayChange(value: number) {
    const delay = Math.max(0, Math.min(5000, value));
    onMockSerialChange({ ...mockSerial, responseDelay: delay });
  }

  function addCustomResponse(command: string, response: string) {
    const newResponse: MockResponse = {
      id: `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      command,
      response,
      enabled: true,
    };
    onMockSerialChange({
      ...mockSerial,
      customResponses: [...mockSerial.customResponses, newResponse],
    });
  }

  function updateCustomResponse(id: string, updates: Partial<MockResponse>) {
    onMockSerialChange({
      ...mockSerial,
      customResponses: mockSerial.customResponses.map(r =>
        r.id === id ? { ...r, ...updates } : r
      ),
    });
  }

  function removeCustomResponse(id: string) {
    onMockSerialChange({
      ...mockSerial,
      customResponses: mockSerial.customResponses.filter(r => r.id !== id),
    });
  }

  function addTemplateResponse(template: ResponseTemplate) {
    // Check if already exists
    const exists = mockSerial.customResponses.some(
      r => r.command.toUpperCase() === template.command.toUpperCase()
    );
    if (!exists) {
      addCustomResponse(template.command, template.response);
    }
  }

  function addAllFromGroup(group: ResponseTemplateGroup) {
    for (const template of group.responses) {
      const exists = mockSerial.customResponses.some(
        r => r.command.toUpperCase() === template.command.toUpperCase()
      );
      if (!exists) {
        addCustomResponse(template.command, template.response);
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Enable/Disable */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-sm font-semibold flex items-center gap-2">
          <Zap size={14} />
          {t("settings_mock_serial", lang)}
        </div>
        <div className="text-xs text-[var(--text-muted)] mb-3">
          {t("settings_mock_serial_desc", lang)}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleToggle}
            className={`rounded-lg border px-4 py-2 text-xs ${
              !mockSerial.enabled
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border)] text-[var(--text-muted)]"
            }`}
          >
            {lang === "zh" ? "关闭" : "Disabled"}
          </Button>
          <Button
            type="button"
            onClick={handleToggle}
            className={`rounded-lg border px-4 py-2 text-xs ${
              mockSerial.enabled
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border)] text-[var(--text-muted)]"
            }`}
          >
            {lang === "zh" ? "开启" : "Enabled"}
          </Button>
        </div>
        {mockSerial.enabled && (
          <div className="mt-2 text-xs text-emerald-500">
            {lang === "zh" ? "✓ 模拟串口已启用，刷新串口列表后可用" : "✓ Mock serial enabled, refresh port list to use"}
          </div>
        )}
      </div>

      {/* Response Delay */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-sm font-semibold">
          {t("mock_serial_delay", lang)}
        </div>
        <div className="text-xs text-[var(--text-muted)] mb-3">
          {lang === "zh" ? "模拟设备响应的延迟时间（毫秒）" : "Simulated device response delay (ms)"}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={5000}
            value={String(mockSerial.responseDelay)}
            onChange={(e) => handleDelayChange(parseInt(e.target.value, 10) || 0)}
            className="w-24 text-center"
          />
          <span className="text-xs text-[var(--text-muted)]">ms</span>
          <span className="ml-2 text-[10px] text-[var(--text-muted)] opacity-60">
            {lang === "zh" ? "范围: 0-5000ms" : "Range: 0-5000ms"}
          </span>
        </div>
      </div>

      {/* Built-in Responses (collapsible) */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <button
          type="button"
          onClick={() => setShowBuiltin(!showBuiltin)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="text-sm font-semibold flex items-center gap-2">
            <Database size={14} />
            {t("mock_serial_builtin_responses", lang)}
            <span className="text-xs text-[var(--text-muted)] font-normal">({Object.keys(BUILTIN_MOCK_RESPONSES).length})</span>
          </div>
          {showBuiltin ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {showBuiltin && (
          <div className="mt-3 text-xs text-[var(--text-muted)] max-h-48 overflow-y-auto">
            <div className="grid gap-1">
              {Object.entries(BUILTIN_MOCK_RESPONSES).map(([cmd, resp]) => (
                <div key={cmd} className="flex items-center gap-2 py-1 border-b border-[var(--border)] last:border-0">
                  <span className="font-mono text-[var(--text-primary)] min-w-[100px]">{cmd}</span>
                  <span className="text-[var(--text-muted)] truncate">→ {resp.split('\n')[0]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Custom Responses */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-3 text-sm font-semibold">
          {t("mock_serial_custom_responses", lang)}
          <span className="text-xs text-[var(--text-muted)] font-normal ml-2">({mockSerial.customResponses.length})</span>
        </div>

        {/* Add new response */}
        <div className="mb-3">
          <AddResponseForm lang={lang} onAdd={addCustomResponse} />
        </div>

        {/* Response list */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {mockSerial.customResponses.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]"
            >
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => updateCustomResponse(r.id, { enabled: e.target.checked })}
                className="rounded"
              />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-[var(--text-primary)] truncate">{r.command}</div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">→ {r.response.split('\n')[0]}</div>
              </div>
              <button
                type="button"
                onClick={() => removeCustomResponse(r.id)}
                className="text-rose-500 hover:text-rose-600 p-1"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {mockSerial.customResponses.length === 0 && (
            <div className="text-xs text-[var(--text-muted)] text-center py-4">
              {lang === "zh" ? "暂无自定义响应" : "No custom responses"}
            </div>
          )}
        </div>
      </div>

      {/* Response Templates */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-3 text-sm font-semibold">
          {t("mock_serial_templates", lang)}
        </div>
        <div className="text-xs text-[var(--text-muted)] mb-3">
          {lang === "zh" ? "点击添加预设响应到自定义列表" : "Click to add template responses to custom list"}
        </div>
        <div className="space-y-2">
          {RESPONSE_TEMPLATE_GROUPS.map((group) => (
            <div key={group.id} className="border border-[var(--border)] rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                className="w-full flex items-center justify-between p-2 hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="text-xs font-medium">
                  {lang === "zh" ? group.name : group.nameEn}
                  <span className="text-[var(--text-muted)] ml-1">({group.responses.length})</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      addAllFromGroup(group);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent)] text-white hover:opacity-80"
                  >
                    {lang === "zh" ? "全部添加" : "Add All"}
                  </Button>
                  {expandedGroup === group.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </div>
              </button>
              {expandedGroup === group.id && (
                <div className="p-2 border-t border-[var(--border)] bg-[var(--bg-surface)] space-y-1">
                  {group.responses.map((template) => {
                    const exists = mockSerial.customResponses.some(
                      r => r.command.toUpperCase() === template.command.toUpperCase()
                    );
                    return (
                      <div
                        key={template.id}
                        className="flex items-center gap-2 py-1 px-2 text-xs"
                      >
                        <span className="font-mono text-[var(--text-primary)] min-w-[100px]">{template.command}</span>
                        <span className="text-[var(--text-muted)] flex-1 truncate">→ {template.response.split('\n')[0]}</span>
                        <Button
                          type="button"
                          onClick={() => addTemplateResponse(template)}
                          disabled={exists}
                          className={`text-[10px] px-2 py-0.5 rounded ${
                            exists
                              ? "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed"
                              : "bg-[var(--accent)] text-white hover:opacity-80"
                          }`}
                        >
                          {exists ? (lang === "zh" ? "已添加" : "Added") : (lang === "zh" ? "添加" : "Add")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function AddResponseForm({ lang, onAdd }: { lang: Lang; onAdd: (command: string, response: string) => void }) {
  const [command, setCommand] = useState("");
  const [response, setResponse] = useState("");

  function handleSubmit() {
    if (command.trim() && response.trim()) {
      onAdd(command.trim(), response.trim());
      setCommand("");
      setResponse("");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={lang === "zh" ? "AT指令" : "AT Command"}
          className="flex-1 text-xs"
        />
        <Input
          type="text"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder={lang === "zh" ? "响应内容" : "Response"}
          className="flex-1 text-xs"
        />
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!command.trim() || !response.trim()}
          className="rounded-lg bg-[var(--accent)] text-white px-3 py-1 text-xs hover:opacity-80 disabled:opacity-50"
        >
          <Plus size={14} />
        </Button>
      </div>
    </div>
  );
}
