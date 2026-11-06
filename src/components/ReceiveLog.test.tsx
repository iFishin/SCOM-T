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
    expect(html).toContain("4F 4B");
    expect(html).toContain("(2B)");
    expect(html).toContain("00000000");
  });

  it("hex mode: prefers rawBytes over the decoded payload (#36)", () => {
    // QCOM reports AA 55 01 00 00 FB AC. TextDecoder used to turn every
    // invalid byte into U+FFFD, which then re-encoded as EF BF BD.
    const logs = [entry({
      id: "raw", seq: 1, payload: "\uFFFD U \uFFFD", mode: "ascii",
      rawBytes: [0xaa, 0x55, 0x01, 0x00, 0x00, 0xfb, 0xac],
    })];
    const html = render("hex", logs);
    expect(html).toContain("AA 55 01 00 00 FB AC");
    expect(html).toContain("(7B)");
    expect(html).not.toContain("EF BF BD");
  });

  it("hex mode: rawBytes containing the terminator are not duplicated", () => {
    const logs = [entry({
      id: "term", seq: 1, direction: "sent", payload: "AT", mode: "ascii",
      terminator: "0D 0A", rawBytes: [0x41, 0x54, 0x0d, 0x0a],
    })];
    const html = render("hex", logs);
    expect(html).toContain("(4B)");
    expect(html).not.toContain("(6B)");
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

  it("keeps the large-log rendering hooks without changing row markup (#43)", () => {
    const html = render("text", [entry({ id: "a", seq: 1, payload: "OK" })]);
    // CSS hooks for skipping off-screen rows must survive refactors, and the
    // search flag stays off until a hit is active (jump-to-match needs real rects).
    expect(html).toContain("log-rows");
    expect(html).toContain("log-rows__list");
    expect(html).not.toContain("data-log-searching");
    expect(html).toContain('data-seq="1"');
  });
});
