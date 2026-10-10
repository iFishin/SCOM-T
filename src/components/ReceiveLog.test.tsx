import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReceiveLog } from "./ReceiveLog";
import type { SerialLogEntry } from "../hooks/useSerialPort";

function entry(over: Partial<SerialLogEntry> & { id: string }): SerialLogEntry {
  return {
    direction: "received",
    mode: "ascii",
    payload: "OK\r\n",
    timestamp: "[2026-10-10 08:05:03.042]",
    seq: 1,
    ...over,
  };
}

const noop = () => {};

function render(mode: "text" | "hex" | "card", logs: SerialLogEntry[]) {
  return renderToStaticMarkup(
    <ReceiveLog
      logs={logs}
      lang="zh"
      displayMode={mode}
      onClearAll={noop}
      onClearReceived={noop}
      onClearSent={noop}
    />,
  );
}

describe("ReceiveLog rendering", () => {
  it("renders the empty state", () => {
    const html = render("text", []);
    expect(html).toContain("暂无串口数据");
    expect(html).not.toContain("data-seq");
  });

  it("text mode: one row per entry, tagged RX/TX with the payload", () => {
    const logs = [
      entry({ id: "a", seq: 1, direction: "received", payload: "+CSQ: 25,0\r\n" }),
      entry({ id: "b", seq: 2, direction: "sent", payload: "AT+CSQ\r\n", terminator: "0D 0A" }),
    ];
    const html = render("text", logs);
    expect(html.match(/data-seq=/g)).toHaveLength(2);
    expect(html).toContain("RX");
    expect(html).toContain("TX");
    expect(html).toContain("+CSQ: 25,0");
    expect(html).toContain("AT+CSQ");
    // TX terminator is surfaced inline.
    expect(html).toContain("[0D 0A]");
  });

  it("hex mode: renders a dump with byte count", () => {
    const logs = [entry({ id: "h", seq: 1, payload: "OK", mode: "ascii" })];
    const html = render("hex", logs);
    expect(html).toContain("4f 4b");
    expect(html).toContain("(2B)");
  });

  it("card mode: merges adjacent RX entries sharing timestamp/source/mode", () => {
    const ts = "[2026-10-10 08:05:03.042]";
    const logs = [
      entry({ id: "c1", seq: 1, payload: "OK\r\n", timestamp: ts }),
      entry({ id: "c2", seq: 2, payload: "RDY\r\n", timestamp: ts }),
      entry({ id: "c3", seq: 3, payload: "DONE\r\n", timestamp: ts, direction: "sent" }),
    ];
    const html = render("card", logs);
    // c1+c2 merge into one card carrying both seqs; c3 stays separate.
    expect(html).toContain('data-seq="1,2"');
    expect(html).toContain('data-seq="3"');
    expect(html).toContain("(2 packets)");
  });

  it("cards are grouped independently per display mode (hex does not merge)", () => {
    const ts = "[2026-10-10 08:05:03.042]";
    const logs = [
      entry({ id: "h1", seq: 1, payload: "OK", timestamp: ts }),
      entry({ id: "h2", seq: 2, payload: "OK", timestamp: ts }),
    ];
    const html = render("hex", logs);
    expect(html.match(/data-seq=/g)).toHaveLength(2);
  });
});
