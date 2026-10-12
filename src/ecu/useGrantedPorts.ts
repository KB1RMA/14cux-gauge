// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useState } from 'react';
import { describeRawError } from '../diagnostics/diagnosticLog';
import { useDiagnostics } from '../diagnostics/useDiagnostics';
import type { SerialPortHandle } from '../platform/platform';
import { usePlatform } from '../platform/usePlatform';

/**
 * The serial ports the user has already allowed, which can be connected to
 * without the picker. Empty until they are known, and where serial is not
 * available.
 */
export function useGrantedPorts(): readonly SerialPortHandle[] {
  const { serial } = usePlatform();
  const log = useDiagnostics();
  const [ports, setPorts] = useState<readonly SerialPortHandle[]>([]);

  useEffect(() => {
    if (!serial.available()) {
      return undefined;
    }

    let current = true;

    serial.grantedPorts().then(
      (granted) => {
        if (current) {
          setPorts(granted);
        }
      },
      (error: unknown) => {
        log.record(
          'error',
          `Could not list the allowed serial ports: ${describeRawError(error)}`,
        );
      },
    );

    return () => {
      current = false;
    };
  }, [serial, log]);

  return ports;
}
