export type SerialJournalEventType =
  | "tx-dispatched"
  | "tx-completed"
  | "tx-failed"
  | "rx-chunk"
  | "disconnected";

export type SerialJournalEvent = {
  seq: number;
  type: SerialJournalEventType;
  timestamp: number;
  bytes: Uint8Array;
  transferId?: number;
  error?: string;
};

export type SerialJournalListener = (event: SerialJournalEvent) => void;

/**
 * Append-only event source for one serial session.
 *
 * Events are synchronously sequenced before listeners run. Consumers may batch
 * rendering or persistence independently without changing transport order.
 */
export class SerialEventJournal {
  private nextSeq = 1;
  private nextTransferId = 1;
  private listeners = new Set<SerialJournalListener>();
  private rxBytes = 0;
  private txRequestedBytes = 0;
  private txCompletedBytes = 0;

  allocateTransferId(): number {
    return this.nextTransferId++;
  }

  subscribe(listener: SerialJournalListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  recordRx(bytes: Uint8Array, timestamp = Date.now()): SerialJournalEvent {
    this.rxBytes += bytes.length;
    return this.append("rx-chunk", bytes, timestamp);
  }

  recordTxDispatched(
    transferId: number,
    bytes: Uint8Array,
    timestamp = Date.now(),
  ): SerialJournalEvent {
    this.txRequestedBytes += bytes.length;
    return this.append("tx-dispatched", bytes, timestamp, transferId);
  }

  recordTxCompleted(
    transferId: number,
    bytes: Uint8Array,
    timestamp = Date.now(),
  ): SerialJournalEvent {
    this.txCompletedBytes += bytes.length;
    return this.append("tx-completed", bytes, timestamp, transferId);
  }

  recordTxFailed(
    transferId: number,
    bytes: Uint8Array,
    error: unknown,
    timestamp = Date.now(),
  ): SerialJournalEvent {
    const message = error instanceof Error ? error.message : String(error);
    return this.append("tx-failed", bytes, timestamp, transferId, message);
  }

  recordDisconnected(timestamp = Date.now()): SerialJournalEvent {
    return this.append("disconnected", new Uint8Array(), timestamp);
  }

  getStats() {
    return {
      lastSeq: this.nextSeq - 1,
      rxBytes: this.rxBytes,
      txRequestedBytes: this.txRequestedBytes,
      txCompletedBytes: this.txCompletedBytes,
    };
  }

  private append(
    type: SerialJournalEventType,
    bytes: Uint8Array,
    timestamp: number,
    transferId?: number,
    error?: string,
  ): SerialJournalEvent {
    const event: SerialJournalEvent = {
      seq: this.nextSeq++,
      type,
      timestamp,
      bytes: bytes.slice(),
      transferId,
      error,
    };

    for (const listener of this.listeners) listener(event);
    return event;
  }
}
