// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { CheckIcon } from '@radix-ui/react-icons';
import { Checkbox, Label } from 'radix-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { describeError, isPortPickerCancelled } from '../ecu/errors';
import { describeRawError } from '../diagnostics/diagnosticLog';
import { useDiagnostics } from '../diagnostics/useDiagnostics';
import { useEcu } from '../ecu/useEcu';
import { useStoredState } from '../storage/useStoredState';
import { DownloadLogButton } from './DownloadLogButton';
import { ExternalLink } from './ExternalLink';
import styles from './ConnectScreen.module.css';

const LIBRARY_HARDWARE_URL = 'https://github.com/KB1RMA/comm14cux-ts#hardware';

/** Remembered, since it matches the user's ECU and rarely changes. */
const DOUBLE_SPEED_KEY = 'doubleSpeed';

function parseDoubleSpeed(stored: unknown): boolean {
  return stored === true;
}

function isWebSerialSupported(): boolean {
  return 'serial' in navigator;
}

export function ConnectScreen() {
  const { state, connect } = useEcu();
  const log = useDiagnostics();
  const [doubleSpeed, setDoubleSpeed] = useStoredState(
    DOUBLE_SPEED_KEY,
    parseDoubleSpeed,
  );
  const [pickerError, setPickerError] = useState<string | undefined>(undefined);
  const supported = isWebSerialSupported();
  const busy = state.status === 'connecting';
  const failed = state.status === 'error' || pickerError !== undefined;
  const doubleSpeedId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // After a disconnect the dashboard (and the focused control) is gone; start
  // the user at the top of this screen instead of the top of the page.
  const focusHeading = state.status === 'idle' && state.afterSession === true;

  useEffect(() => {
    if (focusHeading) {
      headingRef.current?.focus();
    }
  }, [focusHeading]);

  const connectSerial = async () => {
    setPickerError(undefined);

    let port: SerialPort;

    log.record('event', 'Asking the browser for a serial port');

    try {
      port = await navigator.serial.requestPort();
    } catch (error) {
      if (isPortPickerCancelled(error)) {
        log.record('event', 'The port picker was dismissed');
      } else {
        log.record(
          'error',
          `The port picker failed: ${describeRawError(error)}`,
        );
        setPickerError(describeError(error));
      }

      return;
    }

    await connect({ kind: 'serial', port, doubleSpeed });
  };

  return (
    <div className={styles['screen']}>
      {/* First, so the way to get help is the first thing seen after a failure. */}
      {failed ? (
        <section
          className={`${styles['card']} ${styles['trouble']}`}
          aria-labelledby="trouble-title"
        >
          <h2 id="trouble-title">Having trouble?</h2>
          <p>
            The connection failed. The app has logged every byte sent to and
            received from the ECU, and each connection attempt. Download the log
            and send it to whoever is helping you. It stays on this computer
            until you do.
          </p>
          <DownloadLogButton />
        </section>
      ) : null}

      <section className={styles['card']} aria-labelledby="connect-title">
        <h2 id="connect-title" ref={headingRef} tabIndex={-1}>
          Connect to an ECU
        </h2>
        {supported ? (
          <>
            <p>
              Plug in the interface cable, switch the ignition on, then choose
              the cable&apos;s serial port. See the{' '}
              <ExternalLink href={LIBRARY_HARDWARE_URL}>
                hardware notes
              </ExternalLink>{' '}
              for the cable you need.
            </p>
            <div className={styles['check']}>
              <Checkbox.Root
                id={doubleSpeedId}
                className={styles['checkbox']}
                checked={doubleSpeed}
                onCheckedChange={(checked) => {
                  setDoubleSpeed(checked === true);
                }}
              >
                <Checkbox.Indicator>
                  <CheckIcon aria-hidden="true" />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <Label.Root htmlFor={doubleSpeedId}>
                Double-speed firmware (15625 baud)
              </Label.Root>
            </div>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void connectSerial()}
            >
              Connect to ECU
            </button>
          </>
        ) : (
          <p role="note" className={styles['unsupported']}>
            This browser can&apos;t talk to serial ports. Web Serial needs
            Chrome, Edge or Opera on a desktop computer, or Firefox 151 or
            later. Demo mode still works here.
          </p>
        )}
        {pickerError ? (
          <p role="alert" className={styles['error']}>
            {pickerError}
          </p>
        ) : null}
      </section>

      <section className={styles['card']} aria-labelledby="demo-title">
        <h2 id="demo-title">Try it without a car</h2>
        <p>
          Demo mode runs a simulated ECU in the browser: it warms up, idles,
          goes for a short drive and revs, with one stored fault code to read
          and clear.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void connect({ kind: 'demo' })}
        >
          Demo mode
        </button>
      </section>
    </div>
  );
}
