// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { BuildInfo } from '../buildInfo';
import type {
  DiagnosticEntry,
  DiagnosticKind,
  DiagnosticSnapshot,
} from './diagnosticLog';

/** What the report says about where it came from, besides the log itself. */
export interface ReportContext {
  generatedAt: number;
  build: BuildInfo;
  userAgent: string;
  webSerial: boolean;
  /** The connection status line as the app shows it. */
  connection: string;
}

const LABELS: Record<DiagnosticKind, string> = {
  event: '   ',
  tx: 'TX ',
  rx: 'RX ',
  error: 'ERR',
};

function formatEntry(entry: DiagnosticEntry, startedAt: number): string {
  const seconds = ((entry.time - startedAt) / 1000).toFixed(3).padStart(10);

  return `${seconds}s ${LABELS[entry.kind]} ${entry.message}`;
}

function describeBuild(build: BuildInfo): string {
  const commit = build.commit === null ? 'unknown commit' : build.commit;

  return build.releaseTag === null
    ? `development build of ${build.version} (${commit})`
    : `${build.releaseTag} (${commit})`;
}

/** The plain-text file a user downloads and sends to whoever is helping them. */
export function formatReport(
  snapshot: DiagnosticSnapshot,
  context: ReportContext,
): string {
  const lines = [
    '14CUX Gauge diagnostic log',
    `Generated:   ${new Date(context.generatedAt).toISOString()}`,
    `Log started: ${new Date(snapshot.startedAt).toISOString()}`,
    `App:         ${describeBuild(context.build)}`,
    `Browser:     ${context.userAgent}`,
    `Web Serial:  ${context.webSerial ? 'available' : 'not available'}`,
    `Connection:  ${context.connection}`,
    '',
    'Times are seconds since the log started. TX is sent to the ECU, RX is',
    'received from it (with how long the read took), ERR is a failure.',
    'Bytes are hexadecimal. Demo mode traffic is not recorded.',
    '',
    ...snapshot.head.map((entry) => formatEntry(entry, snapshot.startedAt)),
  ];

  if (snapshot.dropped > 0) {
    lines.push(
      `           … ${String(snapshot.dropped)} entries omitted to save memory …`,
    );
  }

  lines.push(
    ...snapshot.tail.map((entry) => formatEntry(entry, snapshot.startedAt)),
    '',
  );

  return lines.join('\n');
}

/** The last `count` entries, one per line, for showing on screen. */
export function formatRecentEntries(
  snapshot: DiagnosticSnapshot,
  count: number,
): string {
  const all = [...snapshot.head, ...snapshot.tail];

  return all
    .slice(-count)
    .map((entry) => formatEntry(entry, snapshot.startedAt))
    .join('\n');
}

/** A file name that sorts by time and is safe on every OS, e.g. `14cux-gauge-log-2026-10-06T14-03-07.txt`. */
export function reportFileName(generatedAt: number): string {
  const stamp = new Date(generatedAt)
    .toISOString()
    .slice(0, 19)
    .replaceAll(':', '-');

  return `14cux-gauge-log-${stamp}.txt`;
}

/** Saves `text` as a file through the browser's normal download. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/plain;charset=utf-8' }),
  );
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);
}
