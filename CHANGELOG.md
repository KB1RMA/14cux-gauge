# Changelog

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
