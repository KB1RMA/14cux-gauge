// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { CheckIcon } from '@radix-ui/react-icons';
import { Checkbox, Label } from 'radix-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { describeError, isPortPickerCancelled } from '../ecu/errors';
import { describeRawError } from '../diagnostics/diagnosticLog';
import { useDiagnostics } from '../diagnostics/useDiagnostics';
import { useEcu } from '../ecu/useEcu';
import { usePlatform } from '../platform/usePlatform';
import type { SerialPortHandle } from '../platform/platform';
import { useSetting } from '../settings/useSetting';
import { ExternalLink } from './ExternalLink';
import styles from './ConnectScreen.module.css';

const LIBRARY_HARDWARE_URL = 'https://github.com/KB1RMA/comm14cux-ts#hardware';

export function ConnectScreen() {
  const { state, connect } = useEcu();
  const log = useDiagnostics();
  const { serial } = usePlatform();
  const [doubleSpeed, setDoubleSpeed] = useSetting('doubleSpeed');
  const [pickerError, setPickerError] = useState<string | undefined>(undefined);
  const supported = serial.available();
  const busy = state.status === 'connecting';
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

    let port: SerialPortHandle;

    log.record('event', 'Asking for a serial port');

    try {
      port = await serial.requestPort();
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
