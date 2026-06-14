import React from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Panel } from "./Panel";
import Checkbox from "./Checkbox";
import Toggle from "./Toggle";
import Textarea from "./Textarea";
import Select from "./Select";
import IconButton from "./IconButton";
import { Send } from "lucide-react";

export function ComponentPreview() {
  const [checked, setChecked] = React.useState(true);
  const [indeterminateRef, setIndeterminateRef] = React.useState<HTMLInputElement | null>(null);
  const [toggled, setToggled] = React.useState(false);
  const [text, setText] = React.useState("示例文本");
  const [selectValue, setSelectValue] = React.useState("one");
  const [inputValue, setInputValue] = React.useState("");
  const [showToast, setShowToast] = React.useState(false);

  React.useEffect(() => {
    if (indeterminateRef) {
      indeterminateRef.indeterminate = true;
    }
  }, [indeterminateRef]);

  return (
    <div className="space-y-4 p-3">
      <div className="text-sm font-semibold">组件示例预览</div>

      <Panel>
        <div className="p-3 space-y-4">
          {/* Buttons: sizes and variants */}
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-2">按钮 - 尺寸 / 变体 / 状态</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="px-2 py-1 text-sm">Small</Button>
              <Button className="px-3 py-1.5">Default</Button>
              <Button className="px-4 py-2">Large</Button>
              <Button className="px-3 py-1.5 btn-primary">Primary</Button>
              <Button className="px-3 py-1.5" disabled>Disabled</Button>
              <Button className="px-3 py-1.5">Outline</Button>
              <IconButton aria-label="send"><Send size={14} /></IconButton>
            </div>
          </div>

          {/* Inputs: prefix/suffix, validation */}
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-2">输入 - 前缀/后缀 / 校验提示</div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="text-[12px] mb-1">带前缀</div>
                <div className="flex items-center gap-2">
                  <span className="px-2 text-sm text-[var(--text-muted)]">+86</span>
                  <Input value={inputValue} onChange={(e) => setInputValue(e.currentTarget.value)} placeholder="手机号" />
                </div>
              </div>

              <div>
                <div className="text-[12px] mb-1">带后缀 / 错误提示</div>
                <div>
                  <div className="flex items-center gap-2">
                    <Input value={inputValue} onChange={(e) => setInputValue(e.currentTarget.value)} placeholder="数量" />
                    <span className="text-xs text-[var(--text-muted)]">units</span>
                  </div>
                  <div className="text-xs text-[var(--accent)] mt-1">示例错误：数值不可用</div>
                </div>
              </div>
            </div>
          </div>

          {/* Textarea */}
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-2">文本域</div>
            <Textarea value={text} onChange={(e) => setText(e.currentTarget.value)} rows={4} />
          </div>

          {/* Checkbox / Toggle states */}
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-2">复选 / 开关 状态</div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={checked} onChange={(e) => setChecked(e.currentTarget.checked)} label="已选" />
              </div>
              <div className="flex items-center gap-2">
                <input ref={(el) => setIndeterminateRef(el)} type="checkbox" className="sr-only" />
                <span className="text-sm text-[var(--text-muted)]">部分选中（indeterminate）</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={false} onChange={() => {}} label="禁用" disabled />
              </div>
              <div className="flex items-center gap-2">
                <Toggle checked={toggled} onChange={setToggled} />
                <span className="text-sm text-[var(--text-muted)]">开关</span>
              </div>
            </div>
          </div>

          {/* Select */}
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-2">下拉</div>
            <div className="flex items-center gap-2">
              <Select value={selectValue} onChange={(e) => setSelectValue(e.currentTarget.value)}>
                <option value="one">选项一</option>
                <option value="two">选项二</option>
                <option value="three">选项三</option>
              </Select>
              <Select value={selectValue} onChange={(e) => setSelectValue(e.currentTarget.value)} className="w-48">
                <option value="one">宽度示例一</option>
                <option value="two">宽度示例二</option>
              </Select>
            </div>
          </div>

          {/* Panel / Card / Toast demo */}
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-2">面板 / 提示</div>
            <div className="flex gap-3 items-start">
              <div className="w-64">
                <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                  <div className="font-semibold">卡片标题</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">卡片内容示例，用于观察背景与边框。</div>
                  <div className="mt-3">
                    <Button className="px-3 py-1.5">操作</Button>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-[var(--text-muted)]">Toast 示例</div>
                <div className="mt-2">
                  <Button className="px-3 py-1.5" onClick={() => setShowToast(true)}>显示提示</Button>
                  {showToast ? (
                    <div className="mt-2 rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div>这是一条提示消息</div>
                        <Button type="button" className="text-xs text-[var(--text-muted)]" onClick={() => setShowToast(false)}>关闭</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default ComponentPreview;
