# Changelog

## [0.12.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.11.0...v0.12.0) (2026-10-25)


### Features

* help search engines find and describe the app ([#119](https://github.com/KB1RMA/14cux-gauge/issues/119)) ([00c98c3](https://github.com/KB1RMA/14cux-gauge/commit/00c98c396c5f77f167366319361efbfbbbe2f461))

## [0.11.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.10.0...v0.11.0) (2026-10-12)


### Features

* keep the ECU's identity and starting fault codes with each recording ([#102](https://github.com/KB1RMA/14cux-gauge/issues/102)) ([#117](https://github.com/KB1RMA/14cux-gauge/issues/117)) ([ce06b6c](https://github.com/KB1RMA/14cux-gauge/commit/ce06b6c8737203e8056fb5430644785c5301597f))
* keep the screen on, go full screen and reconnect to an allowed port ([#118](https://github.com/KB1RMA/14cux-gauge/issues/118)) ([ac6b81b](https://github.com/KB1RMA/14cux-gauge/commit/ac6b81be9edaecbfd4928c56c010c23e82d140a3))
* show the factory fault code number beside each stored fault ([#101](https://github.com/KB1RMA/14cux-gauge/issues/101)) ([20b90e3](https://github.com/KB1RMA/14cux-gauge/commit/20b90e3ac4a095682b6e15c89523c41355f792c5))


### Bug Fixes

* show fault code 25 (misfire), which ECUs with firmware before R3360 store and the app did not show ([#101](https://github.com/KB1RMA/14cux-gauge/issues/101)) ([20b90e3](https://github.com/KB1RMA/14cux-gauge/commit/20b90e3ac4a095682b6e15c89523c41355f792c5))

## [0.10.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.9.1...v0.10.0) (2026-10-10)


### Features

* show the time and value under the pointer on live graphs ([#99](https://github.com/KB1RMA/14cux-gauge/issues/99)) ([1446f8c](https://github.com/KB1RMA/14cux-gauge/commit/1446f8c3f98613b1cfc2a8b4be60922515eef1cf))

## [0.9.1](https://github.com/KB1RMA/14cux-gauge/compare/v0.9.0...v0.9.1) (2026-10-10)


### Bug Fixes

* show an error instead of a blank page when the app cannot start ([#97](https://github.com/KB1RMA/14cux-gauge/issues/97)) ([bad4ce7](https://github.com/KB1RMA/14cux-gauge/commit/bad4ce70e35e3e58c3cb7918a6662c2a6a433093))

## [0.9.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.8.0...v0.9.0) (2026-10-10)


### Features

* resize the replay window by dragging handles on its ends ([#94](https://github.com/KB1RMA/14cux-gauge/issues/94)) ([de56801](https://github.com/KB1RMA/14cux-gauge/commit/de56801370c870c0e4910f58d98816644e6b94eb))


### Bug Fixes

* show an error and a Reload button in place of a view that fails, instead of a blank page ([3d022d9](https://github.com/KB1RMA/14cux-gauge/commit/3d022d936338d1157249fc47809662d2fd96870d))


### Performance Improvements

* load the dashboard and sessions views on demand, so the app starts faster ([3d022d9](https://github.com/KB1RMA/14cux-gauge/commit/3d022d936338d1157249fc47809662d2fd96870d))

## [0.8.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.7.0...v0.8.0) (2026-10-10)


### Features

* sessions and ROM images saved, renamed or deleted in one window now update in other windows ([#78](https://github.com/KB1RMA/14cux-gauge/issues/78)) ([d879d6b](https://github.com/KB1RMA/14cux-gauge/commit/d879d6bf122f18a07a59209e0e6689498387ada8))


### Bug Fixes

* draw the replay overview strip in the chosen temperature and speed units ([2e6a494](https://github.com/KB1RMA/14cux-gauge/commit/2e6a49454364a538415135ad10713edf09d1341f))
* say when another window has taken the browser's storage, and offer to reload, instead of failing silently ([#78](https://github.com/KB1RMA/14cux-gauge/issues/78)) ([d879d6b](https://github.com/KB1RMA/14cux-gauge/commit/d879d6bf122f18a07a59209e0e6689498387ada8))

## [0.7.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.6.0...v0.7.0) (2026-10-09)


### Features

* keep settings in step across windows ([#72](https://github.com/KB1RMA/14cux-gauge/issues/72)) ([914daa9](https://github.com/KB1RMA/14cux-gauge/commit/914daa9aa8965d756e97c278c394db7dbfab004b))


### Bug Fixes

* check stored recordings and ROM images, and list ones that can't be read ([#70](https://github.com/KB1RMA/14cux-gauge/issues/70)) ([f316657](https://github.com/KB1RMA/14cux-gauge/commit/f3166575af73c1995f18431e4db08d64fa92379b))
* show the sample rate of the readings now chosen, not of those before a change or a pause ([#74](https://github.com/KB1RMA/14cux-gauge/issues/74)) ([83a545b](https://github.com/KB1RMA/14cux-gauge/commit/83a545b512a2db4ce5b2999a49d53406013374a8))
* stop a ROM read and writes to the ECU from running at the same time ([#67](https://github.com/KB1RMA/14cux-gauge/issues/67)) ([#73](https://github.com/KB1RMA/14cux-gauge/issues/73)) ([25f41cd](https://github.com/KB1RMA/14cux-gauge/commit/25f41cd4a954004acdfa28454c2849fe63615191))

## [0.6.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.5.0...v0.6.0) (2026-10-07)


### Features

* keep writes to the ECU in recorded sessions, and show them in replay ([#56](https://github.com/KB1RMA/14cux-gauge/issues/56)) ([2ecfab3](https://github.com/KB1RMA/14cux-gauge/commit/2ecfab3fa6f81e93fd230df2d7fe5be28f9e9ec9))

## [0.5.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.4.0...v0.5.0) (2026-10-07)


### Features

* lay the live graphs out in a grid or stacked at full width ([58b11be](https://github.com/KB1RMA/14cux-gauge/commit/58b11be909beb4d8509ea2c776d9b2f99861f5f6))
* notify ECU write starts and outcomes from the bottom of the app ([6457104](https://github.com/KB1RMA/14cux-gauge/commit/6457104a508a4d279fe729f02ff865f04d1726dc))
* show the live graphs over the whole session since connecting, keeping every spike and dip on long sessions ([58b11be](https://github.com/KB1RMA/14cux-gauge/commit/58b11be909beb4d8509ea2c776d9b2f99861f5f6))


### Bug Fixes

* load the development server with an ad blocker turned on ([58b11be](https://github.com/KB1RMA/14cux-gauge/commit/58b11be909beb4d8509ea2c776d9b2f99861f5f6))
* print each live graph at the full page width, without splitting one across two pages ([58b11be](https://github.com/KB1RMA/14cux-gauge/commit/58b11be909beb4d8509ea2c776d9b2f99861f5f6))
* say when a continuous fuel pump test stops because the connection to the ECU closed ([6457104](https://github.com/KB1RMA/14cux-gauge/commit/6457104a508a4d279fe729f02ff865f04d1726dc))

## [0.4.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.3.0...v0.4.0) (2026-10-06)


### Features

* fuel pump test, run once or continuously, behind a confirmation ([#26](https://github.com/KB1RMA/14cux-gauge/issues/26)) ([#51](https://github.com/KB1RMA/14cux-gauge/issues/51)) ([84e0f38](https://github.com/KB1RMA/14cux-gauge/commit/84e0f38672ad35f52e2d9788bf04497e748eda30))
* idle air control motor test, behind a confirmation ([#50](https://github.com/KB1RMA/14cux-gauge/issues/50)) ([3ff92be](https://github.com/KB1RMA/14cux-gauge/commit/3ff92be8d46ef95b3e45a9a4e4e5c87bc0db3510))
* show CO trim voltage, purge valve, A/C and heated screen states ([#48](https://github.com/KB1RMA/14cux-gauge/issues/48)) ([d48a925](https://github.com/KB1RMA/14cux-gauge/commit/d48a92590e919d6caaebb24cc499b1571ccb82e0))


### Bug Fixes

* announce every ECU write's start, end or failure in the status bar, including fuel pump failures ([bfbd421](https://github.com/KB1RMA/14cux-gauge/commit/bfbd4219c3f9896573dfff2c0d1d85235fe1d81e))
* hold other ECU writes until the fuel pump has actually stopped ([bfbd421](https://github.com/KB1RMA/14cux-gauge/commit/bfbd4219c3f9896573dfff2c0d1d85235fe1d81e))
* report a write that fails part-way, or loses its connection part-way, as possibly incomplete ([bfbd421](https://github.com/KB1RMA/14cux-gauge/commit/bfbd4219c3f9896573dfff2c0d1d85235fe1d81e))
* run only one ECU write at a time, and keep each write's result when you leave the view ([#52](https://github.com/KB1RMA/14cux-gauge/issues/52)) ([bfbd421](https://github.com/KB1RMA/14cux-gauge/commit/bfbd4219c3f9896573dfff2c0d1d85235fe1d81e))

## [0.3.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.2.0...v0.3.0) (2026-10-06)


### Features

* explain each reading and its typical values ([#41](https://github.com/KB1RMA/14cux-gauge/issues/41)) ([c3d9e18](https://github.com/KB1RMA/14cux-gauge/commit/c3d9e18fe65a947ce25aaff641489630abcc672f)), closes [#32](https://github.com/KB1RMA/14cux-gauge/issues/32)
* export a recorded session as CSV ([#46](https://github.com/KB1RMA/14cux-gauge/issues/46)) ([0252f3b](https://github.com/KB1RMA/14cux-gauge/commit/0252f3bca19698dae085d8b9979ff957fc51f4ed))
* give every screen a URL so views can be deep linked ([#47](https://github.com/KB1RMA/14cux-gauge/issues/47)) ([b5ed246](https://github.com/KB1RMA/14cux-gauge/commit/b5ed24672c61acc3d594ce25430c67beaf009978))
* picture fuel trims on bars centred on zero ([#43](https://github.com/KB1RMA/14cux-gauge/issues/43)) ([b7d44b3](https://github.com/KB1RMA/14cux-gauge/commit/b7d44b37e26c74eae88f967914ece4ed12d1b790)), closes [#30](https://github.com/KB1RMA/14cux-gauge/issues/30)
* save the ECU ROM image to a file ([#45](https://github.com/KB1RMA/14cux-gauge/issues/45)) ([b756615](https://github.com/KB1RMA/14cux-gauge/commit/b756615170649e7640a0b00875ee2aecb2525a79))
* show injector duty cycle, worked out from pulse width and RPM ([#44](https://github.com/KB1RMA/14cux-gauge/issues/44)) ([aa63212](https://github.com/KB1RMA/14cux-gauge/commit/aa63212ae7600b8e9f845d5beccc1e98737ca6fe)), closes [#29](https://github.com/KB1RMA/14cux-gauge/issues/29)

## [0.2.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.1.3...v0.2.0) (2026-10-06)


### Features

* choose which readings to take, so fewer readings poll faster ([#37](https://github.com/KB1RMA/14cux-gauge/issues/37)) ([5308817](https://github.com/KB1RMA/14cux-gauge/commit/5308817d321e83a63a6f48e05f8bb4b7afc05baa))
* show the fuel map in use, idle control, injector pulse and rev limit ([#36](https://github.com/KB1RMA/14cux-gauge/issues/36)) ([66b6342](https://github.com/KB1RMA/14cux-gauge/commit/66b634258d4c240d95a5b35939eee61f74cad066))

## [0.1.3](https://github.com/KB1RMA/14cux-gauge/compare/v0.1.2...v0.1.3) (2026-10-06)


### Features

* count visits and basic usage anonymously with GoatCounter ([#24](https://github.com/KB1RMA/14cux-gauge/issues/24)) ([cf379a4](https://github.com/KB1RMA/14cux-gauge/commit/cf379a4ba7d67802c6beb833049214f7bf88de51))

## [0.1.2](https://github.com/KB1RMA/14cux-gauge/compare/v0.1.1...v0.1.2) (2026-10-06)


### Features

* record debug sessions, and browse, replay and annotate them ([#14](https://github.com/KB1RMA/14cux-gauge/issues/14)) ([11846a9](https://github.com/KB1RMA/14cux-gauge/commit/11846a99bf756e78b2ac59d1674b24e62b090607))
* record serial traffic and let users download a diagnostic log ([#23](https://github.com/KB1RMA/14cux-gauge/issues/23)) ([452922a](https://github.com/KB1RMA/14cux-gauge/commit/452922ac7a7b581e8c4437c110c8a9acaf86a31f))
* replay graphs on a zoomable, scrubbable timeline ([#21](https://github.com/KB1RMA/14cux-gauge/issues/21)) ([aac5590](https://github.com/KB1RMA/14cux-gauge/commit/aac5590c9477acb5c60ed8040a1386094bf9115a))
* work offline as an installable PWA, and flag offline and out-of-date builds ([#18](https://github.com/KB1RMA/14cux-gauge/issues/18)) ([3ddd092](https://github.com/KB1RMA/14cux-gauge/commit/3ddd0920571eeefc9e600ed50d2ca543172713fa))

## [0.1.1](https://github.com/KB1RMA/14cux-gauge/compare/v0.1.0...v0.1.1) (2026-10-05)


### Features

* show the release and commit in the footer ([#12](https://github.com/KB1RMA/14cux-gauge/issues/12)) ([402d38e](https://github.com/KB1RMA/14cux-gauge/commit/402d38ecafff15d00357cbd73b738d726284cff4))

## [0.1.0](https://github.com/KB1RMA/14cux-gauge/compare/v0.1.0...v0.1.0) (2026-10-05)


### Features

* show the release and commit in the footer ([#12](https://github.com/KB1RMA/14cux-gauge/issues/12)) ([402d38e](https://github.com/KB1RMA/14cux-gauge/commit/402d38ecafff15d00357cbd73b738d726284cff4))

## 0.1.0 (2026-10-05)


### Features

* add live graphs in a Graphs tab, and a storage layer for settings and sessions ([#4](https://github.com/KB1RMA/14cux-gauge/issues/4)) ([6be7517](https://github.com/KB1RMA/14cux-gauge/commit/6be7517060ac9882da23582377efb94349230b3b))
