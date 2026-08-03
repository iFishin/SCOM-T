import { describe, expect, it } from "vitest";
import { TauriSerialService } from "./SerialService.ts";
import { FakeSerialTransport } from "./FakeSerialTransport.ts";
import type { SerialConfig } from "./types.ts";

const config: SerialConfig = {
  path: "TEST",
  baudRate: 115200,
  dataBits: "8",
  parity: "none",
  stopBits: "1",
  flowControl: "none",
  rts: false,
  dtr: false,
};

async function openWith(transport: FakeSerialTransport) {
  const service = new TauriSerialService(() => transport);
  await service.open(config);
  return service;
}

describe("TauriSerialService", () => {
  it("retries partial writes with only the remaining suffix", async () => {
    const transport = new FakeSerialTransport({
      writeChunkSize: (attempt) => attempt === 1 ? 3 : 99,
    });
    const service = await openWith(transport);

    await service.sendBinary([1, 2, 3, 4, 5]);

    expect(transport.writes).toEqual([
      [1, 2, 3, 4, 5],
      [4, 5],
    ]);
    await service.dispose();
  });

  it("serializes rapid writes without merging command bytes", async () => {
    const transport = new FakeSerialTransport({ writeDelay: 5 });
    const service = await openWith(transport);

    await Promise.all([
      service.sendBinary(Array.from(new TextEncoder().encode("get_version\r\n"))),
      service.sendBinary(Array.from(new TextEncoder().encode("version\r\n"))),
    ]);

    expect(transport.writes.map((bytes) => new TextDecoder().decode(new Uint8Array(bytes)))).toEqual([
      "get_version\r\n",
      "version\r\n",
    ]);
    await service.dispose();
  });

  it("fires lifecycle dispatch only when a queued write actually starts", async () => {
    const transport = new FakeSerialTransport({ writeDelay: 10 });
    const service = await openWith(transport);
    const order: string[] = [];

    const first = service.sendBinary([1], {
      onDispatch: () => order.push("dispatch-1"),
      onComplete: () => order.push("complete-1"),
    });
    const second = service.sendBinary([2], {
      onDispatch: () => order.push("dispatch-2"),
      onComplete: () => order.push("complete-2"),
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["dispatch-1", "complete-1", "dispatch-2", "complete-2"]);
    await service.dispose();
  });

  it("delivers fragmented RX byte-for-byte while a write is pending", async () => {
    const transport = new FakeSerialTransport({ writeDelay: 20 });
    const service = await openWith(transport);
    const received: number[] = [];
    service.onData((bytes) => received.push(...bytes));

    const send = service.sendBinary([0x41]);
    transport.simulateReceive([0x67, 0x65, 0x74, 0x5f, 0x76, 0x65, 0x72]);
    transport.simulateReceive([0x73, 0x69, 0x6f, 0x6e, 0x0d, 0x0a]);

    await send;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(received).toEqual(Array.from(new TextEncoder().encode("get_version\r\n")));
    await service.dispose();
  });

  it("keeps the queue usable after a failed write", async () => {
    const transport = new FakeSerialTransport({
      writeChunkSize: (attempt) => attempt === 1 ? 0 : 99,
    });
    const service = await openWith(transport);

    await expect(service.sendBinary([1])).rejects.toThrow("串口写入异常");
    await expect(service.sendBinary([2])).resolves.toBeUndefined();
    expect(transport.writes).toEqual([[1], [2]]);
    await service.dispose();
  });

  it("never interleaves bytes when many sends are fired concurrently", async () => {
    const transport = new FakeSerialTransport({
      writeDelay: 1,
      writeChunkSize: (attempt) => attempt === 1 ? 5 : 99,
    });
    const service = await openWith(transport);
    const command = Array.from(new TextEncoder().encode("get_version\r\n"));

    const sends = Array.from({ length: 20 }, () => service.sendBinary(command.slice()));
    await Promise.all(sends);

    // Every byte actually placed on the wire must be a clean, complete command.
    const concatenated = transport.transmitted;
    expect(concatenated).toEqual(Array.from({ length: 20 }, () => command).flat());

    // Each send must be reconstructable as a whole command.
    const text = new TextDecoder().decode(new Uint8Array(concatenated));
    expect(text.match(/get_version/g)).toHaveLength(20);
    await service.dispose();
  });

  it("fires dispatch in real queue order for rapid overlapping sends", async () => {
    const transport = new FakeSerialTransport({ writeDelay: 2 });
    const service = await openWith(transport);
    const order: string[] = [];

    const pending = Array.from({ length: 5 }, (_, i) =>
      service.sendBinary([i + 1], {
        onDispatch: () => order.push(`d${i + 1}`),
        onComplete: () => order.push(`c${i + 1}`),
      }),
    );
    await Promise.all(pending);

    expect(order).toEqual(["d1", "c1", "d2", "c2", "d3", "c3", "d4", "c4", "d5", "c5"]);
    await service.dispose();
  });
});
