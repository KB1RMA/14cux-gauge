// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { IDENTITY } from '../test-support/identity';
import {
  fileRecording,
  readRecordingFile,
  RecordingFileError,
  recordingFileText,
} from './recordingFile';
import type { LiveSnapshot } from './snapshot';
import type { RecordedWrite } from './write';

const SESSION = {
  name: 'Idle hunt',
  notes: 'Hunts when warm.',
  source: 'serial' as const,
  startedAt: 1_791_208_800_000,
  endedAt: 1_791_208_802_000,
  identity: IDENTITY,
  writesKept: true,
};

const WRITE: RecordedWrite = {
  id: 'pump-1',
  write: 'fuelPump',
  startedAt: 1_791_208_800_500,
  endedAt: 1_791_208_801_000,
  outcome: { status: 'done', message: 'Fuel pump stopped.' },
};

/** Two samples: every reading read, and a few missing (not read) or invalid. */
const SAMPLES: LiveSnapshot[] = [
  { timestamp: 1_791_208_800_000, engineRpm: 812.5, milOn: false },
  { timestamp: 1_791_208_800_250, engineRpm: null, coolantTempF: 185.75 },
];

const SAVED = { savedAt: 1_791_208_900_000, savedBy: '14CUX Gauge 0.13.0' };

/** A file holding SESSION, written out by hand from the format's description. */
const FILE = {
  kind: '14cux-gauge-recordings',
  version: 1,
  savedAt: 1_791_208_900_000,
  savedBy: '14CUX Gauge 0.13.0',
  recordings: [
    {
      name: 'Idle hunt',
      notes: 'Hunts when warm.',
      source: 'serial',
      startedAt: 1_791_208_800_000,
      endedAt: 1_791_208_802_000,
      identity: IDENTITY,
      writes: [WRITE],
      samples: [
        { timestamp: 1_791_208_800_000, engineRpm: 812.5, milOn: false },
        { timestamp: 1_791_208_800_250, engineRpm: null, coolantTempF: 185.75 },
      ],
    },
  ],
};

function fileWith(change: (recording: Record<string, unknown>) => void) {
  const recording: Record<string, unknown> = structuredClone(
    FILE.recordings[0],
  ) as unknown as Record<string, unknown>;

  change(recording);

  return JSON.stringify({ ...FILE, recordings: [recording] });
}

function reasonFor(text: string): string {
  try {
    readRecordingFile(text, 'idle.json', 0);
  } catch (error) {
    if (error instanceof RecordingFileError) {
      return error.message;
    }

    throw error;
  }

  throw new Error('The file was opened');
}

describe('recordingFileText', () => {
  it('writes the documented format', () => {
    const text = recordingFileText({
      ...SAVED,
      recordings: [fileRecording(SESSION, SAMPLES, [WRITE])],
    });

    expect(JSON.parse(text)).toEqual(FILE);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('writes `null` for the writes of a recording that did not keep them', () => {
    expect(
      fileRecording({ ...SESSION, writesKept: false }, SAMPLES, []).writes,
    ).toBeNull();
  });
});

describe('readRecordingFile', () => {
  it('gives back every sample bit for bit', () => {
    const awkward = [
      0.1 + 0.2,
      1 / 3,
      Number.MIN_VALUE,
      Number.MAX_VALUE,
      -1e-300,
      2 ** 53 + 2,
      14.099999999999998,
    ];
    const samples: LiveSnapshot[] = awkward.map((value, index) => ({
      timestamp: 1_791_208_800_000 + index * 97.3,
      lambdaShortOdd: value,
      mainVoltage: -value,
      coolantTempF: null,
    }));

    const [opened] = readRecordingFile(
      recordingFileText({
        ...SAVED,
        recordings: [fileRecording(SESSION, samples, [WRITE])],
      }),
      'idle.json',
      0,
    );

    expect(opened?.samples).toHaveLength(samples.length);
    opened?.samples.forEach((sample, index) => {
      const original = samples[index];

      expect(Object.keys(sample).sort()).toEqual(
        Object.keys(original ?? {}).sort(),
      );

      for (const [key, value] of Object.entries(original ?? {})) {
        // `Object.is` tells every bit pattern apart but NaN's, which a
        // reading never is.
        expect(Object.is(sample[key as keyof LiveSnapshot], value)).toBe(true);
      }
    });
  });

  it('reads each recording with a note of where it came from', () => {
    expect(
      readRecordingFile(JSON.stringify(FILE), 'idle.json', 1_791_209_000_000),
    ).toEqual([
      {
        session: {
          name: 'Idle hunt',
          notes: 'Hunts when warm.',
          source: 'serial',
          startedAt: 1_791_208_800_000,
          endedAt: 1_791_208_802_000,
          identity: IDENTITY,
          writesKept: true,
          imported: {
            fileName: 'idle.json',
            importedAt: 1_791_209_000_000,
            savedAt: 1_791_208_900_000,
            savedBy: '14CUX Gauge 0.13.0',
          },
        },
        samples: FILE.recordings[0]?.samples,
        writes: [WRITE],
      },
    ]);
  });

  it('reads a recording that did not keep its writes, and one with no identity', () => {
    const [opened] = readRecordingFile(
      fileWith((recording) => {
        recording['writes'] = null;
        recording['identity'] = null;
      }),
      'old.json',
      0,
    );

    expect(opened?.session.writesKept).toBe(false);
    expect(opened?.session.identity).toBeNull();
    expect(opened?.writes).toEqual([]);
  });

  it('reads a file with no recordings', () => {
    expect(
      readRecordingFile(JSON.stringify({ ...FILE, recordings: [] }), 'a', 0),
    ).toEqual([]);
  });

  it('says a file from a newer version of the app needs the app updated', () => {
    expect(reasonFor(JSON.stringify({ ...FILE, version: 2 }))).toBe(
      'idle.json could not be opened: it was saved by a newer version of the app (file format 2). Update the app to open it.',
    );
  });

  it('says which value is wrong in a damaged file', () => {
    expect(
      reasonFor(
        fileWith((recording) => {
          (recording['samples'] as Record<string, unknown>[])[1] = {
            timestamp: 1_791_208_800_250,
            engineRpm: '812',
          };
        }),
      ),
    ).toBe(
      'idle.json could not be opened: it is damaged (recordings.0.samples.1.engineRpm: Invalid input).',
    );
    expect(
      reasonFor(
        fileWith((recording) => {
          recording['source'] = 'bluetooth';
        }),
      ),
    ).toMatch(
      /^idle\.json could not be opened: it is damaged \(recordings\.0\.source: /,
    );
  });

  it('rejects a reading it does not know rather than dropping it', () => {
    expect(
      reasonFor(
        fileWith((recording) => {
          (recording['samples'] as Record<string, unknown>[])[0] = {
            timestamp: 1,
            boostPressure: 3,
          };
        }),
      ),
    ).toBe(
      'idle.json could not be opened: it is damaged (recordings.0.samples.0: unknown boostPressure).',
    );
  });

  it('rejects a version that is not a known one', () => {
    expect(reasonFor(JSON.stringify({ ...FILE, version: 0 }))).toMatch(
      /^idle\.json could not be opened: it is damaged \(version: /,
    );
    expect(reasonFor(JSON.stringify({ ...FILE, version: '1' }))).toMatch(
      /^idle\.json could not be opened: it is damaged \(version: /,
    );
  });

  it('says a file that is not a recording file is not one', () => {
    for (const text of [
      'Time since start (s),Time (UTC)\r\n',
      '{"kind":"something else","version":1}',
      '[]',
      'null',
      '',
    ]) {
      expect(reasonFor(text)).toBe(
        'idle.json could not be opened: it is not a recording file.',
      );
    }
  });
});
