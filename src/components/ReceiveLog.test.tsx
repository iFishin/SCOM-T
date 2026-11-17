import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReceiveLog, extendCardGroups, WINDOW_INITIAL } from "./ReceiveLog";
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

function render(mode: "text" | "hex" | "card", logs: SerialLogEntry[], mounted = true) {
  return renderToStaticMarkup(
    <ReceiveLog
      logs={logs}
      mounted={mounted}
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
      rawBytes: Uint8Array.from([0xaa, 0x55, 0x01, 0x00, 0x00, 0xfb, 0xac]),
    })];
    const html = render("hex", logs);
    expect(html).toContain("AA 55 01 00 00 FB AC");
    expect(html).toContain("(7B)");
    expect(html).not.toContain("EF BF BD");
  });

  it("hex mode: rawBytes containing the terminator are not duplicated", () => {
    const logs = [entry({
      id: "term", seq: 1, direction: "sent", payload: "AT", mode: "ascii",
      terminator: "0D 0A", rawBytes: Uint8Array.from([0x41, 0x54, 0x0d, 0x0a]),
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

describe("card grouping cache", () => {
  const ts = "[2026-10-10 08:05:03.042]";
  const rx = (id: string, seq: number, payload = "OK", extra: Partial<SerialLogEntry> = {}) =>
    entry({ id, seq, payload, timestamp: ts, ...extra });

  /** Compare the observable shape of two group lists. */
  const shape = (groups: Array<{ entries: SerialLogEntry[]; mergedPayload: string; startIndex: number }>) =>
    groups.map((g) => ({
      keys: g.entries.map((e) => e.id),
      mergedPayload: g.mergedPayload,
      startIndex: g.startIndex,
    }));

  it("matches a full rebuild when batches are appended", () => {
    const all = [
      rx("a", 1),
      rx("b", 2),
      rx("c", 3, "DONE"),
      entry({ id: "d", seq: 4, direction: "sent", payload: "AT" }),
      rx("e", 5, "OK", { timestamp: "[2026-10-10 08:05:04.000]" }),
    ];

    let cache = extendCardGroups(all.slice(0, 2), null);
    for (const end of [3, 4, 5]) {
      const logs = all.slice(0, end);
      cache = extendCardGroups(logs, cache);
      expect(shape(cache.groups)).toEqual(shape(extendCardGroups(logs, null).groups));
      expect(cache.consumed).toBe(end);
    }
  });

  it("keeps closed groups referentially stable so memoized rows can skip", () => {
    // Three separate timestamps → three closed groups after the first batch.
    const first = [
      rx("a", 1, "A", { timestamp: "[t1]" }),
      rx("b", 2, "B", { timestamp: "[t2]" }),
      rx("c", 3, "C", { timestamp: "[t3]" }),
    ];
    const before = extendCardGroups(first, null);

    const after = extendCardGroups([...first, rx("d", 4, "D", { timestamp: "[t4]" })], before);

    // The first two groups are done; their identity must survive the append.
    expect(after.groups[0]).toBe(before.groups[0]);
    expect(after.groups[1]).toBe(before.groups[1]);
    expect(after.groups).toHaveLength(4);
  });

  it("does not merge a rebuilt open group across the previous boundary", () => {
    // A single RX group that keeps growing: the seam must stay inside it.
    const first = [rx("a", 1, "A"), rx("b", 2, "B")];
    const before = extendCardGroups(first, null);
    expect(before.groups).toHaveLength(1);

    const after = extendCardGroups([...first, rx("c", 3, "C")], before);

    expect(after.groups).toHaveLength(1);
    expect(after.groups[0].entries.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(after.groups[0].mergedPayload).toBe("A\nB\nC");
  });

  it("rebuilds when the array is cleared or trimmed", () => {
    const first = [rx("a", 1, "A", { timestamp: "[t1]" }), rx("b", 2, "B", { timestamp: "[t2]" })];
    const before = extendCardGroups(first, null);

    expect(extendCardGroups([], before)).toEqual({ groups: [], consumed: 0 });

    // A trimmed array is a different sequence: no stale groups may survive.
    const trimmed = extendCardGroups([first[1]], before);
    expect(trimmed.groups.map((g) => g.entries[0].id)).toEqual(["b"]);
  });
});

describe("windowed rendering", () => {
  const bulk = (count: number, ts = "[2026-10-10 08:05:03.042]") =>
    Array.from({ length: count }, (_, i) =>
      entry({ id: `l${i}`, seq: i + 1, payload: "OK", timestamp: ts }),
    );

  it("mounts only the tail window instead of the whole buffer", () => {
    const html = render("text", bulk(5000));
    expect(html.match(/data-seq=/g)).toHaveLength(WINDOW_INITIAL);
    // The newest entries are the ones mounted, not the oldest.
    expect(html).toContain('data-seq="5000"');
    expect(html).not.toContain('data-seq="1"');
  });

  it("shows how many entries are still above the window", () => {
    const html = render("text", bulk(5000));
    expect(html).toContain("上方还有 4400 条");
  });

  it("renders everything when the buffer fits in one window", () => {
    const html = render("text", bulk(120));
    expect(html.match(/data-seq=/g)).toHaveLength(120);
    expect(html).not.toContain("上方还有");
  });

  it("windows the card view too, keeping the newest groups", () => {
    const logs = Array.from({ length: 2000 }, (_, i) =>
      entry({ id: `c${i}`, seq: i + 1, payload: "OK", timestamp: `[t${i}]` }),
    );
    const html = render("card", logs);
    const rows = html.match(/data-seq=/g) ?? [];
    // One extra group may straddle the window boundary.
    expect(rows.length).toBeLessThanOrEqual(WINDOW_INITIAL + 1);
    expect(html).toContain('data-seq="2000"');
  });
});

describe("background tab", () => {
  it("drops the log rows while the tab is inactive", () => {
    const logs = [entry({ id: "a", seq: 1 }), entry({ id: "b", seq: 2 })];
    const html = render("card", logs, false);
    expect(html).not.toContain("data-seq=");
    expect(html).toContain("切回该标签页");
  });
});
