# Architecture

How 14CUX Gauge is put together after the #76–#81 refactors. The rules behind
it are in [AGENTS.md](../AGENTS.md#state-and-data).

## Structure

`main.tsx` builds the `Platform` and the `AppServices` once and hands them to
`<App>`. React providers only expose the services; views reach them through
hooks. Arrows point from the user of a module to the module it uses.

```mermaid
flowchart TB
  main["main.tsx<br/>createAppServices(browserPlatform())"]

  subgraph views["components/ — views"]
    direction LR
    Connect[ConnectScreen]
    Dash["Dashboard<br/>LiveTiles · GraphsView · FuelMapView<br/>FaultCodes · EcuInfo · tests"]
    Sessions["SessionsView<br/>SessionList · SessionDetail · SessionReplay"]
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
    HPlat[usePlatform]
  end

  subgraph services["AppServices — plain TS, subscribe / getSnapshot"]
    direction LR
    Session["EcuSession<br/>ecu/"]
    Writes["EcuWrites<br/>ecuWrite/"]
    Recorder["Recorder<br/>recording/"]
    Roms["RomReader<br/>roms/"]
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
  Chrome --> HRec
  Dash & Sessions --> HRoms
  Sessions --> HSess
  Sessions --> HReplay
  views --> HSet
  views --> HRoute
  Chrome --> HAppStatus
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

  Writes --> Session
  Recorder --> Session
  Recorder --> Writes
  Recorder --> StorageSvc
  Roms --> Session
  Roms --> StorageSvc
  Roms --> Recorder
  Roms --> Files

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
  platform["platform/<br/>serial, files, storage, settings, app"]
  svc["services<br/>ecu/ · ecuWrite/ · roms/ · recording/ · readings/"]
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
