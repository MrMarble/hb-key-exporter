# [0.8.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.7.0...v0.8.0) (2026-09-11)

### Features

- add downloadable exports and improve CSV and table UX ([#48](https://github.com/MrMarble/hb-key-exporter/issues/48)) ([73f7f14](https://github.com/MrMarble/hb-key-exporter/commit/73f7f1469892009a8629dd86024e54ddafa692ed))

# [0.7.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.6.0...v0.7.0) (2026-08-20)

### Features

- improve key revealing/export workflow and table data ([#45](https://github.com/MrMarble/hb-key-exporter/issues/45)) ([5d20ed7](https://github.com/MrMarble/hb-key-exporter/commit/5d20ed73c7c865990e3a2a89503b8690926deb0d))

# [0.6.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.5.0...v0.6.0) (2026-07-02)

### Features

- http server for dev script. ([#39](https://github.com/MrMarble/hb-key-exporter/issues/39)) ([e73694d](https://github.com/MrMarble/hb-key-exporter/commit/e73694d5ad2483c5a48bd17f2794bd35a4e2fd0f))
- improve redeemed date tracking and table behavior ([#38](https://github.com/MrMarble/hb-key-exporter/issues/38)) ([3279b60](https://github.com/MrMarble/hb-key-exporter/commit/3279b60d8d81c17287f4e0b59ead93c88a5cc1bc))
- **table:** improve Steam data integration, toasts, and UX ([#42](https://github.com/MrMarble/hb-key-exporter/issues/42)) ([f748086](https://github.com/MrMarble/hb-key-exporter/commit/f748086c5bc47e823e19cf6360f86ab1206de0b1))

# [0.5.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.4.2...v0.5.0) (2026-05-21)

### Bug Fixes

- correct Steam owned games detection and improve Advanced Exporter UX ([#19](https://github.com/MrMarble/hb-key-exporter/issues/19)) ([89ab7a4](https://github.com/MrMarble/hb-key-exporter/commit/89ab7a4e413886d2715470051e84054aab8c1b66))

### Features

- Add `purchase date` column ([#34](https://github.com/MrMarble/hb-key-exporter/issues/34)) ([dba9f33](https://github.com/MrMarble/hb-key-exporter/commit/dba9f337876ac4fd4f72b4359041e80e211336d6))

## [0.9.2](https://github.com/MrMarble/hb-key-exporter/compare/v0.9.1...v0.9.2) (2026-09-11)


### Bug Fixes

* **ci:** attach the userscript by publishing from a draft release ([#74](https://github.com/MrMarble/hb-key-exporter/issues/74)) ([e51f339](https://github.com/MrMarble/hb-key-exporter/commit/e51f3396f691fecbbfb4fd0f295f0a7572c5431c))

## [0.9.1](https://github.com/MrMarble/hb-key-exporter/compare/v0.9.0...v0.9.1) (2026-09-11)


### Bug Fixes

* **ci:** empty package-name so release-please tags merged release PRs ([#72](https://github.com/MrMarble/hb-key-exporter/issues/72)) ([6f793c4](https://github.com/MrMarble/hb-key-exporter/commit/6f793c4d78158e184de96dbc125181a54bef9fd9))
* **ci:** let release-please tag the merged release PR ([#71](https://github.com/MrMarble/hb-key-exporter/issues/71)) ([943f191](https://github.com/MrMarble/hb-key-exporter/commit/943f19174082ac5c30f6940ca9ec5e1fc322576f))

## [0.9.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.8.0...v0.9.0) (2026-09-11)


### Features

* show order loading progress and refresh when complete ([#67](https://github.com/MrMarble/hb-key-exporter/issues/67)) ([83acfc5](https://github.com/MrMarble/hb-key-exporter/commit/83acfc5f88f9531d7776463b6425c4f2ec1e79b6))
* skip permanently failed keys on bulk reveal ([#55](https://github.com/MrMarble/hb-key-exporter/issues/55)) ([4dc2941](https://github.com/MrMarble/hb-key-exporter/commit/4dc2941d879956a9db517f0b0b1a27f264f7720f))


### Bug Fixes

* improve non-retryable reveal handling ([#69](https://github.com/MrMarble/hb-key-exporter/issues/69)) ([96196ef](https://github.com/MrMarble/hb-key-exporter/commit/96196efeb291391b8463e0025556108b2906c8b3))
* report the order count that matches the table ([#70](https://github.com/MrMarble/hb-key-exporter/issues/70)) ([baef86e](https://github.com/MrMarble/hb-key-exporter/commit/baef86e150a20f2fabdfcbfe6fd7cde984a40efd))

## [0.4.2](https://github.com/MrMarble/hb-key-exporter/compare/v0.4.1...v0.4.2) (2026-05-21)

### Bug Fixes

- **csv:** quote and escape CSV fields during export ([#16](https://github.com/MrMarble/hb-key-exporter/issues/16)) ([c9a06ce](https://github.com/MrMarble/hb-key-exporter/commit/c9a06ce5614b66b6e414c8043cd0fa58ad204970))
- **expiry:** derive missing key expiration dates from custom_instructions_html ([#13](https://github.com/MrMarble/hb-key-exporter/issues/13)) ([1c62253](https://github.com/MrMarble/hb-key-exporter/commit/1c622531e17339febdd35c990a7435b5c59f662f))
- **table:** make expiration date filtering work with ISO date values ([#14](https://github.com/MrMarble/hb-key-exporter/issues/14)) ([5ac9b81](https://github.com/MrMarble/hb-key-exporter/commit/5ac9b812541b3afc3b33577c1495ceab77a60326))

# [0.4.1](https://github.com/MrMarble/hb-key-exporter/compare/v0.4.0...v0.4.1) (2026-02-05)

### Bug Fixes

- Fixed ASF export output format by @Knight1 in #6

# [0.4.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.3.0...v0.4.0) (2025-05-31)

### Features

- **cvs:** allow setting a custom separator ([#2](https://github.com/MrMarble/hb-key-exporter/issues/2)) ([30aaff5](https://github.com/MrMarble/hb-key-exporter/commit/30aaff5848797c15c40e6e55599412c366049324))

# [0.3.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.2.1...0.3.0) (2025-05-11)

### Bug Fixes

- set container to max with ([b1404bd](https://github.com/MrMarble/hb-key-exporter/commit/b1404bd41b4b6d234789abfba237211153ceb4a1))

### Features

- show owned apps ([82ecc2e](https://github.com/MrMarble/hb-key-exporter/commit/82ecc2e35c9394ac4171c704425205cdbc707839))

## [0.2.1](https://github.com/MrMarble/hb-key-exporter/compare/v0.2.0...v0.2.1) (2025-05-09)

### Bug Fixes

- add default values ([c1cda4a](https://github.com/MrMarble/hb-key-exporter/commit/c1cda4a00957cc0102129777b9907ad976a0e76f))

# [0.2.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.1.1...v0.2.0) (2025-05-08)

### Bug Fixes

- parent container has wrong width ([c219591](https://github.com/MrMarble/hb-key-exporter/commit/c219591708215080eb947d391e2cfce1f399a082))

### Features

- bulk claim on export ([2ca166d](https://github.com/MrMarble/hb-key-exporter/commit/2ca166dbeee4d999f63a99c2e4eac5d835f6e449))
- generate gift link ([7b40b29](https://github.com/MrMarble/hb-key-exporter/commit/7b40b29337519d13622cce8d84efdaf752550cf0))
- show unrevealed keys ([fcf44e2](https://github.com/MrMarble/hb-key-exporter/commit/fcf44e27927a7806175862f87b19f2e35ff7ea74))

## [0.1.1](https://github.com/MrMarble/hb-key-exporter/compare/v0.1.0...v0.1.1) (2025-05-07)

### Features

- add uptate urls to meta ([6068fbf](https://github.com/MrMarble/hb-key-exporter/commit/6068fbfb6911a91b9a2caa41850d26d0b7fad948))

# 0.1.0 (2025-05-07)
