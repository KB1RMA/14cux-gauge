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

/** One line: UTC timestamp to the millisecond, kind, message. */
function formatEntry(entry: DiagnosticEntry): string {
  return `${new Date(entry.time).toISOString()} ${LABELS[entry.kind]} ${entry.message}`;
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
    'Times are UTC. TX is sent to the ECU, RX is received from it (with how',
    'long the read took), ERR is a failure.',
    'Bytes are hexadecimal. Demo mode traffic is not recorded.',
    '',
    ...snapshot.head.map(formatEntry),
  ];

  if (snapshot.dropped > 0) {
    lines.push(
      `… ${String(snapshot.dropped)} entries omitted to save memory …`,
    );
  }

  lines.push(...snapshot.tail.map(formatEntry), '');

  return lines.join('\n');
}

/** The last `count` entries, one per line, for showing on screen. */
export function formatRecentEntries(
  snapshot: DiagnosticSnapshot,
  count: number,
): string {
  const all = [...snapshot.head, ...snapshot.tail];

  return all.slice(-count).map(formatEntry).join('\n');
}

/** A file name that sorts by time and is safe on every OS, e.g. `14cux-gauge-log-2026-10-06T14-03-07.txt`. */
export function reportFileName(generatedAt: number): string {
  const stamp = new Date(generatedAt)
    .toISOString()
    .slice(0, 19)
    .replaceAll(':', '-');

  return `14cux-gauge-log-${stamp}.txt`;
}
