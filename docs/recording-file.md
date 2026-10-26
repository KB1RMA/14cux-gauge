# Recording file format

A recording file holds one or more recorded sessions, so they can be kept as a
backup, moved to another computer, or sent to someone helping with a fault.
14CUX Gauge saves one with **Save as file** on a session's page, or **Save
selected as file** in the Sessions list, and opens one with **Open recording
file…**.

Unlike the CSV export, which is for reading in a spreadsheet, a recording file
keeps everything the app recorded: every sample at full precision in the ECU
library's units, the notes, the ECU's identity and fault codes from the start
of the recording, and the writes to the ECU made while recording. Opening it
gives back the same recording.

This document is the format's contract. Other tools may read and write it.

## The file

A UTF-8 JSON document, saved with the `.json` extension. One object:

| Field        | Type   | Meaning                                                                 |
| ------------ | ------ | ----------------------------------------------------------------------- |
| `kind`       | string | Always `"14cux-gauge-recordings"`. Anything else is not a recording file. |
| `version`    | number | The format version. This document describes version `1`.               |
| `savedAt`    | number | When the file was saved, in milliseconds since 1970-01-01 UTC.          |
| `savedBy`    | string | What saved it, such as `"14CUX Gauge 0.13.0"`.                          |
| `recordings` | array  | The recordings, in the order they were chosen. May be empty.            |

## A recording

| Field       | Type           | Meaning                                                                                                   |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `name`      | string         | The recording's name.                                                                                     |
| `notes`     | string         | The user's notes; empty if none.                                                                          |
| `source`    | string         | `"serial"` for a real ECU, `"demo"` for the app's simulated ECU.                                          |
| `startedAt` | number         | When recording started (milliseconds since 1970 UTC).                                                     |
| `endedAt`   | number or null | When recording stopped; `null` if it never did (the app closed first, or it was still recording).         |
| `identity`  | object or null | The ECU's identity and fault codes at the start (below); `null` if the recording is from before they were kept. |
| `writes`    | array or null  | Writes to the ECU made while recording (below); `null` if the recording is from before they were kept.   |
| `samples`   | array          | Every sample, in the order recorded (below).                                                              |

### Samples

Each sample is one pass over the readings, as the ECU library returned them:

- `timestamp`: when the pass finished, in milliseconds since 1970 UTC.
- One field per reading taken. The names and units are those of
  `src/model/snapshot.ts`: for example `engineRpm` in rpm, `coolantTempF` in
  °F, `roadSpeedMph` in mph, `throttle` as a fraction from 0 to 1, and
  `injectorPulseUs` in microseconds. `gear` and `purgeValve` are the library's
  numbers.
- A reading that was **not taken** is left out. A reading the ECU returned as
  **invalid** is `null`. Neither is ever written as 0.

Numbers are written as JavaScript writes them, which reads back to exactly the
same value, so no precision is lost. JSON has no negative zero, so a reading of
-0 reads back as 0.

A sample with a field this version does not know makes the file unreadable,
rather than having that reading dropped.

### Identity

As kept with a recording (`src/model/identity.ts`): `tune`, `rpmLimit`,
`fuelMap` and `faultCodes`, each an object with a `status` of `"read"` (with
`readAt` and `value`), `"invalid"` (with `readAt`), or `"failed"` (with
`readAt` and a `message` saying why).

### Writes

Each write has an `id`, the `write` it was (`"clearFaultCodes"`,
`"idleAirControl"` or `"fuelPump"`, or another name from a newer version),
`startedAt`, `endedAt` (`null` if it was still running when recording
stopped) and an `outcome` with a `status` (`"running"`, `"done"`, `"failed"`
or `"partial"`) and, once finished, a `message`.

## Opening a file

The app checks the whole file before storing anything. It opens every
recording in the file, or none:

- A file whose `kind` is not `"14cux-gauge-recordings"`, or that is not JSON,
  is reported as not a recording file.
- A file with a `version` higher than the app knows is reported as saved by a
  newer version of the app.
- A file with any value missing or of the wrong type is reported as damaged,
  naming where the value is, such as `recordings.0.samples.12.engineRpm`.

Each opened recording becomes a new session, with a note of the file it came
from, when it was opened, and the file's `savedAt` and `savedBy`. Opening the
same file twice gives two copies.

## Changing the format

The version goes up whenever a field is added, removed, or changes meaning,
including a new reading in samples. The app keeps reading every older version.
