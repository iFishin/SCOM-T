import { describe, expect, it } from "vitest";
import { SerialEventJournal } from "./SerialEventJournal.ts";

describe("SerialEventJournal", () => {
  it("assigns one strictly increasing sequence across TX and RX", () => {
    const journal = new SerialEventJournal();
    const events = [] as ReturnType<typeof journal.recordRx>[];
    journal.subscribe((event) => events.push(event));
    const transferId = journal.allocateTransferId();

    journal.recordTxDispatched(transferId, new Uint8Array([1]), 10);
    journal.recordRx(new Uint8Array([2, 3]), 11);
    journal.recordTxCompleted(transferId, new Uint8Array([1]), 12);

    expect(events.map((event) => event.seq)).toEqual([1, 2, 3]);
    expect(events.map((event) => event.type)).toEqual([
      "tx-dispatched",
      "rx-chunk",
      "tx-completed",
    ]);
  });

  it("copies bytes so callers cannot mutate recorded events", () => {
    const journal = new SerialEventJournal();
    const input = new Uint8Array([1, 2]);
    const event = journal.recordRx(input);
    input[0] = 9;
    expect(Array.from(event.bytes)).toEqual([1, 2]);
  });

  it("tracks requested, completed, and received byte totals", () => {
    const journal = new SerialEventJournal();
    const transferId = journal.allocateTransferId();
    journal.recordTxDispatched(transferId, new Uint8Array([1, 2, 3]));
    journal.recordRx(new Uint8Array([4, 5]));
    journal.recordTxCompleted(transferId, new Uint8Array([1, 2, 3]));

    expect(journal.getStats()).toEqual({
      lastSeq: 3,
      rxBytes: 2,
      txRequestedBytes: 3,
      txCompletedBytes: 3,
    });
  });
});
