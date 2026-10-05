// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

// Runs in the page, before the app loads. Replaces `navigator.serial` with a
// port whose far end is comm14cux-ts's SimulatedTransport, an emulation of
// the ECU's byte-level serial protocol. The shipped app's WebSerialTransport
// therefore talks to it exactly as it would talk to a USB cable.

import { SimulatedTransport } from 'comm14cux-ts';
import { buildSyntheticRom } from '../../src/demo/syntheticRom';

export type PortChoice = 'grant' | 'cancel';

/** Test controls, reached from the spec through `page.evaluate`. */
export interface EmulatedSerialControls {
  /** What the browser's port picker does when the app asks for a port. */
  portChoice: PortChoice;
  /** The options of every `port.open()` call, in order. */
  readonly opens: SerialOptions[];
  /** Writes bytes into the emulated ECU's memory. */
  poke(address: number, bytes: readonly number[]): void;
  /** Reads bytes from the emulated ECU's memory. */
  peek(address: number, length: number): number[];
  /** Makes the ECU stop (or resume) answering. */
  setSilent(silent: boolean): void;
  /** Simulates pulling the USB cable out. */
  unplug(): void;
}

declare global {
  interface Window {
    emulatedSerial: EmulatedSerialControls;
  }
}

class EmulatedSerialPort extends EventTarget {
  readonly ecu = new SimulatedTransport();
  readonly opens: SerialOptions[] = [];
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  #toHost: ReadableStreamDefaultController<Uint8Array> | undefined;

  constructor() {
    super();
    this.ecu.loadRom(buildSyntheticRom());
  }

  async open(options: SerialOptions): Promise<void> {
    if (this.readable) {
      throw new DOMException('The port is already open.', 'InvalidStateError');
    }

    this.opens.push(options);
    await this.ecu.open();
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#toHost = controller;
      },
    });
    this.writable = new WritableStream<Uint8Array>({
      write: async (chunk) => {
        await this.ecu.write(chunk);
        await this.#deliverReply();
      },
    });
  }

  async close(): Promise<void> {
    this.readable = null;
    this.writable = null;
    this.#toHost = undefined;
    await this.ecu.close();
  }

  unplug(): void {
    this.#toHost?.error(
      new DOMException('The device has been lost.', 'NetworkError'),
    );
    this.dispatchEvent(new Event('disconnect'));
  }

  /** Moves whatever the emulated ECU has queued onto the readable stream. */
  async #deliverReply(): Promise<void> {
    const reply: number[] = [];

    for (;;) {
      try {
        // Rejects once the queue is empty; the simulation never waits.
        reply.push(...(await this.ecu.read(1, 0)));
      } catch {
        break;
      }
    }

    // One chunk per reply, as a UART delivers a short burst.
    if (reply.length > 0) {
      this.#toHost?.enqueue(Uint8Array.from(reply));
    }
  }
}

const port = new EmulatedSerialPort();

const controls: EmulatedSerialControls = {
  portChoice: 'grant',
  opens: port.opens,
  poke(address, bytes) {
    port.ecu.memory.set(bytes, address);
  },
  peek(address, length) {
    return Array.from(port.ecu.memory.subarray(address, address + length));
  },
  setSilent(silent) {
    port.ecu.silent = silent;
  },
  unplug() {
    port.unplug();
  },
};

window.emulatedSerial = controls;
Object.defineProperty(navigator, 'serial', {
  configurable: true,
  value: {
    requestPort: () =>
      controls.portChoice === 'grant'
        ? Promise.resolve(port)
        : Promise.reject(
            new DOMException('No port selected by the user.', 'NotFoundError'),
          ),
  },
});
