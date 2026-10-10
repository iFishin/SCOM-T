import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PromptRowEditor } from "./PromptRowEditor";
import type { PromptRow } from "./promptRow";

function row(over: Partial<PromptRow> = {}): PromptRow {
  return {
    id: 1,
    selected: false,
    command: "AT+CSQ",
    isHex: false,
    ender: "\r\n",
    interval: "",
    ...over,
  };
}

const noop = () => {};

function render(r: PromptRow, props: Partial<Parameters<typeof PromptRowEditor>[0]> = {}) {
  return renderToStaticMarkup(
    <PromptRowEditor
      row={r}
      lang="zh"
      responseSetOptions={[]}
      canCapture={false}
      onUpdate={noop}
      onSaveToResponseSet={noop}
      onImportFromResponseSet={noop}
      onCapture={noop}
      {...props}
    />,
  );
}

describe("PromptRowEditor", () => {
  it("renders one toggle + textarea per expected response", () => {
    const html = render(row({ expectedResponses: ["+CSQ: 25,0", "OK"] }));
    // Two per-entry regex toggles, two textareas, two delete buttons.
    expect(html.match(/Abc|\.\*/g)?.length).toBe(2);
    expect(html).toContain("+CSQ: 25,0");
    expect(html).toContain("OK");
  });

  it("shows the regex toggle as active for regex entries", () => {
    const html = render(row({ expectedResponses: ["\\d+", "OK"], expectedResponseRegex: [true, false] }));
    expect(html).toContain(".*"); // the regex entry
    expect(html).toContain("Abc"); // the literal entry
    expect(html).toContain("正则模式");
  });

  it("hides the all/any switch below two non-blank responses", () => {
    expect(render(row({ expectedResponses: ["OK"] }))).not.toContain("任意");
    expect(render(row({ expectedResponses: ["OK", " "] }))).not.toContain("任意");
    expect(render(row({ expectedResponses: ["OK", "RDY"] }))).toContain("任意");
  });

  it("marks only the active match mode", () => {
    const classOf = (html: string, label: string) => {
      const m = html.match(new RegExp(`<button[^>]*class="([^"]*)"[^>]*>${label}</button>`));
      return m?.[1] ?? "";
    };
    const all = render(row({ expectedResponses: ["OK", "RDY"], matchMode: "all" }));
    expect(classOf(all, "全部")).toContain("bg-[var(--accent)]");
    expect(classOf(all, "任意")).not.toContain("bg-[var(--accent)]");

    const any = render(row({ expectedResponses: ["OK", "RDY"], matchMode: "any" }));
    expect(classOf(any, "任意")).toContain("bg-[var(--accent)]");
    expect(classOf(any, "全部")).not.toContain("bg-[var(--accent)]");
  });

  it("treats a missing match mode as all", () => {
    const html = render(row({ expectedResponses: ["OK", "RDY"] }));
    const m = html.match(/<button[^>]*class="([^"]*)"[^>]*>全部<\/button>/);
    expect(m?.[1]).toContain("bg-[var(--accent)]");
  });

  it("disables capture when nothing is capturable", () => {
    expect(render(row({ expectedResponses: ["OK"] }))).toContain("disabled");
    const enabled = render(row({ expectedResponses: ["OK"] }), { canCapture: true });
    expect(enabled).toContain("采集响应");
    expect(enabled).not.toContain('disabled=""');
  });

  it("hides the response-set dropdowns when there are no sets", () => {
    expect(render(row())).not.toContain("保存到...");
    expect(render(row())).not.toContain("从响应集导入...");
  });

  it("lists response sets in both dropdowns", () => {
    const html = render(row(), {
      responseSetOptions: [
        { id: "a", name: "4G 基础" },
        { id: "b", name: "GPS" },
      ],
    });
    expect(html).toContain("保存到...");
    expect(html).toContain("从响应集导入...");
    expect(html.match(/4G 基础/g)?.length).toBe(2);
    expect(html.match(/>GPS</g)?.length).toBe(2);
  });

  it("renders without expected responses", () => {
    const html = render(row());
    expect(html).toContain("添加期望结果");
    expect(html).not.toContain("任意");
  });
});
