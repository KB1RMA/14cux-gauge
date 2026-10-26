# Architecture

How 14CUX Gauge is put together after the #76–#81 refactors. The rules behind
it are in [AGENTS.md](../AGENTS.md#state-and-data).

Keep this document up to date: a pull request that changes a service, hook,
provider, store, platform part, layer, stored shape or the flow of readings
updates the plain-language guide and the diagrams too.

## In plain words

This part explains the app without code. The diagrams after it show the same
ideas in more detail.

### What the app does

The app talks to a 14CUX engine computer, called the ECU. It asks the ECU for
readings, such as engine speed and coolant temperature, over and over. It shows
the readings, draws them on graphs, and can save them so you can look at them
later.

### The layers

Think of the app as a stack of layers. Each layer may use the layers below it,
but never the ones above it. From top to bottom:

1. **Views** are the screens, tiles, graphs and buttons you see. They show
   data, but they never fetch it themselves. The dashboard and the sessions
   views are downloaded just after the app starts, so the first screen shows
   sooner. If one of them breaks, only that view shows an error and a Reload
   button. Going to another page tries the view again. The app bar and
   status bar keep working, so you can still disconnect.
2. **Hooks and providers** are the go-betweens. A view asks a hook for what it
   needs, and the hook gets it from a service.
3. **Services** do the real work. There are seven:
   - **EcuSession** connects to the ECU, asks it for readings again and again,
     and keeps the recent ones.
   - **EcuWrites** sends commands that change something in the ECU, such as
     clearing fault codes or running the fuel pump. The app always asks you to
     confirm first.
   - **Recorder** saves readings into a session while you record. When a
     recording starts, it first asks EcuSession to read which ECU it is:
     the tune, rev limit, fuel map and stored fault codes. The tune is in
     the ROM and cannot change, so a recording uses the last time it was
     read on this connection. The recording's start time is taken after
     these reads, and any write made during them is still saved with it.
   - **RomReader** copies the ECU's program, called the ROM image, so you can
     keep it.
   - **ScreenWake** keeps the screen from going to sleep while an ECU is
     connected, if you chose that in Preferences. It lets go as soon as you
     disconnect, and the status bar says when the screen is kept on or when
     the browser would not do it.
   - **StorageService** opens the place where sessions and ROM images are kept.
   - **AppStatusStore** knows whether you are offline and whether a newer
     version of the app is out.
4. **Platform** is the only part that talks to the browser directly: the
   serial port (including the ports you already allowed, which the connect
   screen offers to reconnect to), saving files, storage, settings, the screen
   (keeping it on, and full screen) and reloading the page. A
   desktop version could swap in its own platform without changing the rest.
5. **Storage and settings** keep things between visits.
6. **Model** is the bottom layer. It sets the rules for what each kind of data
   looks like.

Only one part of the app may talk to the ECU at a time. EcuSession hands out a
**lease**, which works like a key. Whoever holds the key may talk to the ECU.
Everyone else waits. EcuWrites and RomReader borrow the key when they need it.

### A reading's trip

1. EcuSession asks the ECU for readings. The ECU answers with bytes over the
   serial cable.
2. The ECU library (libcomm14cux-ts) turns those bytes into values, such as rpm,
   °F or volts. The app keeps these values exactly as they arrive. It does not
   round them or change their units.
3. One pass over the readings, plus the time it was taken, is a
   **snapshot**.
4. The snapshot goes into the **history**, which holds the last 100,000
   snapshots. When it is full, the oldest one is dropped.
5. Tiles show the newest snapshot. Graphs draw from the history.
6. Values are rounded and changed to your units (such as °C) only at the moment
   they are shown. The kept value never changes.
7. If you are recording, the Recorder collects snapshots and saves them about
   once a second.

Some readings change slowly, such as coolant temperature and battery voltage.
The app reads those less often, usually on every tenth pass. In the passes
between, a snapshot repeats the last value it read.

### What a snapshot holds

Each reading in a snapshot is one of three things, and the app never mixes them
up:

- **A value**: a number, or on and off.
- **Missing**: the app did not ask for it, because you turned that reading
  off.
- **Invalid**: the ECU sent back a value that cannot be right.

None of these is the same as zero. On a graph, an invalid reading is a gap, not
a drop to zero.

### What gets saved

These are kept in the browser's database:

- **Sessions.** Each one has a name, notes, start and end times, the number of
  samples, and whether it came from a real ECU or the demo. It also keeps
  which ECU it came from: the tune number, ident, checksum fixer, rev limit,
  fuel map and the fault codes that were set, each with the time it was
  read. The tune is the last one read on the connection; the rest are read
  when recording starts. A value that could not be read says
  why. Sessions saved before this was kept say "Not recorded". Its snapshots
  are saved beside it in batches.
- **Writes.** Each command sent to the ECU during a recording, with when it
  started and ended and how it went: done, failed, or only partly done.
- **ROM images.** The copied program, with its tune number, size, a
  fingerprint (SHA-256) to tell copies apart, and whether it came from a real
  ECU or the demo.

**Settings**, such as units, theme and which readings to show, are small. They
are kept apart from the database, in the browser's local storage. Every
setting has a default, and so does each part of one. A new version can add a
setting without breaking an older one: the older version uses its default for
anything it does not know, and keeps the new part when it saves.

Each saved item carries a **format version**. When the shape of an item
changes, its version number goes up. Older items are updated as they are read;
they are never rewritten where they sit. Every item is checked against its
shape when it is read. If the app cannot read one, it lists it so you can
delete it, instead of hiding it.

### Replay

When you open a saved session, the app builds a history from its snapshots,
just as it does with live readings. The graphs then work the same way for both,
so a gap or a high point reads the same live and in replay.

## Structure

`main.tsx` builds the `Platform` and the `AppServices` once and hands them to
`<App>`. React providers only expose the services; views reach them through
hooks. `App.tsx` loads `Dashboard` and `SessionsView` with React's `lazy`,
each inside its own `ViewBoundary` (an error boundary and a `Suspense`
boundary). Arrows point from the user of a module to the module it uses.

```mermaid
flowchart TB
  main["main.tsx<br/>createAppServices(browserPlatform())"]

  subgraph views["components/ — views"]
    direction LR
    Connect[ConnectScreen]
    Dash["Dashboard (lazy)<br/>LiveTiles · GraphsView · FuelMapView<br/>FaultCodes · EcuInfo · tests"]
    Sessions["SessionsView (lazy)<br/>SessionList · SessionDetail · SessionReplay"]
    Chrome["StatusBar · PreferencesMenu · Footer<br/>SaveSessionDialog · AppNotices"]
  end

  subgraph react["Hooks and providers — React"]
    direction LR
    HEcu["useEcu · useEcuRead<br/>useLiveData · useHistory"]
    HWrite["useEcuWrite<br/>useFuelPumpRun"]
    HRec[useRecording]
    HRoms[useRoms]
    HSess["useSessions · useSessionList<br/>useSessionSamples"]
    HSet["useSetting · usePreferences<br/>ReadingsProvider"]
    HReplay["useReplay<br/>useRecordedSeries"]
    HRoute["routing/<br/>React Router"]
    HAppStatus[useAppStatus]
    HScreen["useScreenWake<br/>useFullscreen"]
    HPlat[usePlatform]
  end

  subgraph services["AppServices — plain TS, subscribe / getSnapshot"]
    direction LR
    Session["EcuSession<br/>ecu/"]
    Writes["EcuWrites<br/>ecuWrite/"]
    Recorder["Recorder<br/>recording/"]
    Roms["RomReader<br/>roms/"]
    Wake["ScreenWake<br/>screen/"]
    StorageSvc["StorageService<br/>storage/"]
    AppStatus["AppStatusStore<br/>pwa/"]
  end

  subgraph series["Series model — history/ · replay/"]
    direction LR
    SampleHistory["SampleHistory<br/>pushSnapshot"]
    ChartSeries["chartSeries<br/>timeline"]
  end

  subgraph platform["platform/ — the only reader of browser globals"]
    direction LR
    Serial["serial<br/>WebSerialTransport"]
    Files["files<br/>save"]
    StorePlat["storage<br/>open"]
    SettingsBE["settings<br/>localStorage"]
    AppPlat["app<br/>reload"]
    ScreenPlat["screen<br/>wakeLock · fullscreen"]
  end

  subgraph persist["storage/ · settings/"]
    direction LR
    Stores["SessionStore · RomStore<br/>IndexedDB or memory"]
    SettingStore["settingStore<br/>zod-checked"]
  end

  Model["model/ · metrics.ts · units.ts<br/>zod schemas, snapshots, formatting"]
  Lib[("libcomm14cux-ts<br/>Ecu · Transport")]
  Demo["demo/<br/>DemoEngine"]
  Diag["diagnostics/<br/>TracingTransport · DiagnosticLog"]

  main --> services
  main --> platform

  Connect & Dash & Chrome --> HEcu
  Dash --> HWrite
  Dash & Sessions & Chrome --> HRec
  Dash --> HRoms
  Sessions & Chrome --> HSess
  Sessions --> HReplay
  views --> HSet
  views --> HRoute
  Chrome --> HAppStatus
  Dash & Chrome --> HScreen
  Connect & Sessions & Chrome --> HPlat
  Dash & Sessions --> ChartSeries

  HEcu --> Session
  HWrite --> Writes
  HRec --> Recorder
  HRoms --> Roms
  HSess --> StorageSvc
  HSet --> SettingStore
  HSet -. chosen readings .-> Session
  HReplay --> SampleHistory
  HEcu --> SampleHistory
  HAppStatus --> AppStatus
  HPlat --> Serial
  HPlat --> Files
  HPlat --> AppPlat
  HScreen --> Wake
  HScreen --> ScreenPlat
  HSet -. keep the screen on .-> Wake

  Writes --> Session
  Recorder --> Session
  Recorder --> Writes
  Recorder --> StorageSvc
  Roms --> Session
  Roms --> StorageSvc
  Roms --> Recorder
  Roms --> Files
  Wake --> Session
  Wake --> ScreenPlat

  Session --> SampleHistory
  SampleHistory --> ChartSeries
  Session -- "Lease · Ecu calls" --> Lib
  Writes -- "Lease · Ecu calls" --> Lib
  Roms -- "Lease · Ecu calls" --> Lib
  Session --> Serial
  Session --> Demo
  Session --> Diag
  Diag --> Lib
  Serial --> Lib

  StorageSvc --> StorePlat
  StorePlat --> Stores
  SettingStore --> SettingsBE

  series --> Model
  persist --> Model
  services --> Model
```

### Layers

A module never imports from a layer above its own; `eslint.config.js` enforces
the boundaries. As above, arrows point from a layer to the layers it may use.
`history/` and `replay/` (outside their hooks) use only `model/`, `metrics` and
`units`, so the series model sits below the services and views that read it.

```mermaid
flowchart TB
  model["model/<br/>stored shapes, zod schemas"]
  storage["storage/ · settings/<br/>IndexedDB stores, settingStore"]
  platform["platform/<br/>serial, files, storage, settings, app, screen"]
  svc["services<br/>ecu/ · ecuWrite/ · roms/ · recording/ · screen/ · readings/"]
  series["history/ · replay/<br/>series model"]
  hooks["hooks and providers<br/>use*.ts · *Provider.tsx"]
  components["components/<br/>views"]

  components --> hooks --> svc --> platform --> storage --> model
  svc --> series --> model
```

## Live data flow

One polling pass, from the serial port to a tile, a graph and a recording.

```mermaid
sequenceDiagram
  autonumber
  participant Port as Serial port<br/>(platform.serial)
  participant Ecu as Ecu<br/>(libcomm14cux-ts)
  participant Session as EcuSession
  participant History as SampleHistory
  participant Recorder as Recorder
  participant Store as SessionStore
  participant View as Views<br/>(tiles, graphs)

  Session->>Ecu: poll chosen readings (holds the Lease)
  Ecu->>Port: request bytes (via TracingTransport)
  Port-->>Ecu: response bytes
  Ecu-->>Session: raw values in library units
  Session->>History: pushSnapshot (full precision, time read)
  Session-->>View: notify subscribers
  View->>Session: getSnapshot (useSyncExternalStore)
  View->>History: series for graphs (useHistory, then chartSeries in the chart)
  Note over View: metric.format converts units<br/>and rounds for display only
  Session-->>Recorder: snapshot event, while recording
  Recorder->>Store: append full-precision samples<br/>(buffered, saved about once a second)
```

As a recording starts, the `Recorder` asks `EcuSession.readNow` to run
`readIdentity` (in `ecu/reads.ts`) beside polling, and stores the result in
the session's summary (format 4). `readNow` reads nothing while a ROM read
has the link to itself, and the identity then says it was not read. A holder
that takes the link while a `readNow` read is running waits for it before
polling pauses. The tune revision is in the ROM, so `reads.ts` keeps the last
read of it for each connection's `Ecu`, with the time it was read. Every
recording on that connection uses it; the ECU info reads it afresh when
asked, which replaces it. A failed read never replaces a good one. The rev
limit, fuel map and fault codes are in the ECU's RAM and are read as each
recording starts. While this happens `RecorderState.starting` is set, the
`Recorder` already watches `EcuWrites`, and the session's `startedAt` is
taken once the reads are done.

ECU writes (clearing faults, actuator tests) go the other way: a view behind
`ConfirmDialog` calls `useEcuWrite`, which asks `EcuWrites`; `EcuWrites` takes
the `Lease` from `EcuSession`, calls the `Ecu` through it, keys the outcome by
`EcuLink`, and the `Recorder` logs it into the current session. `RomReader`
reads the ROM image the same way, through a `Lease` of its own.

Replay reads a stored session through `useSessionSamples`, and
`useRecordedSeries` builds a `SampleHistory` from it with `pushSnapshot`, as
`EcuSession` does live. The charts draw both with `chartSeries`, and `useReplay`
drives the shared timeline, so a gap or an extreme reads the same live and in
replay.
