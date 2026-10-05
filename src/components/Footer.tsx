// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { ExternalLink } from './ExternalLink';
import styles from './Footer.module.css';

export const SOURCE_URL = 'https://github.com/KB1RMA/14cux-gauge';
export const LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';
const LIBRARY_URL = 'https://github.com/KB1RMA/comm14cux-ts';

export function Footer() {
  return (
    <footer className={styles['footer']}>
      <p>
        14CUX Gauge is free software under the{' '}
        <ExternalLink href={LICENSE_URL}>GNU GPL v3</ExternalLink>.{' '}
        <ExternalLink href={SOURCE_URL}>Source code</ExternalLink> · Built on{' '}
        <ExternalLink href={LIBRARY_URL}>comm14cux-ts</ExternalLink>, derived
        from libcomm14cux by Colin Bourassa.
      </p>
      <p>
        Provided with absolutely no warranty. Not affiliated with or endorsed by
        the author of libcomm14cux or RoverGauge.
      </p>
    </footer>
  );
}
