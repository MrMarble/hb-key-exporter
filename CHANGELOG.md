# [0.6.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.5.0...v0.6.0) (TBD)

### Features

* Add Humble Choice support: automatically choose and redeem keys from Choice subscription bundles
* Redeem all key types (steam, origin, uplay, generic, etc.) except keyless entries which are unredeemable
* Show order loading progress indicator with live count of loaded orders
* Auto-refresh product list once all orders have finished loading
* Show toast notification when CSV export has no keys to export
* Add region lock column to table and CSV export showing country restrictions
* Add SearchBuilder filter for region lock with "Redeemable in" / "Not redeemable in" conditions using ISO country codes
* Add region lock to table (with hover menu) and the csv Export

### Changed

* Separate Choice and non-Choice claiming flows for more reliable key redemption
* Normal Bundles are no longer redeemed if the Value is_expired is true

### Bug Fixes

* Fix ASF format in README for key and name order (#7)
* There was an empty field in the exporter 

by @Knight1

# [0.5.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.4.1...v0.5.0) (TBD)

### Features

* Track permanent errors (for now expired keys) and do not try to redeem those keys again since it will fail again
* Add build instructions to README
* If the clipboard is blocked the code now caches the export and shows a button to export again which unlocks the clipboard
* CSV is now properly escaped if a game's human_name contains "," which breaks the csv

### Changed

* Updated CI with matrix and latest node versions
* Changed Changelog generator to changelogen since the old one contained a dependency with a known vulnerability
* Updated all dependencies
* Do not export keyless keys into keys and csv
* Do not redeem keyless keys since this tool is for exporting keys and keyless means no keys to export

by @Knight1

# [0.4.1](https://github.com/MrMarble/hb-key-exporter/compare/v0.4.0...v0.4.1) (2026-02-05)

### Bug Fixes

* Fixed ASF export output format by @Knight1 in #6


# [0.4.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.3.0...v0.4.0) (2025-05-31)


### Features

* **csv:** allow setting a custom separator ([#2](https://github.com/MrMarble/hb-key-exporter/issues/2)) ([30aaff5](https://github.com/MrMarble/hb-key-exporter/commit/30aaff5848797c15c40e6e55599412c366049324))



# [0.3.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.2.1...0.3.0) (2025-05-11)


### Bug Fixes

* set container to max width ([b1404bd](https://github.com/MrMarble/hb-key-exporter/commit/b1404bd41b4b6d234789abfba237211153ceb4a1))


### Features

* show owned apps ([82ecc2e](https://github.com/MrMarble/hb-key-exporter/commit/82ecc2e35c9394ac4171c704425205cdbc707839))



## [0.2.1](https://github.com/MrMarble/hb-key-exporter/compare/v0.2.0...v0.2.1) (2025-05-09)


### Bug Fixes

* add default values ([c1cda4a](https://github.com/MrMarble/hb-key-exporter/commit/c1cda4a00957cc0102129777b9907ad976a0e76f))



# [0.2.0](https://github.com/MrMarble/hb-key-exporter/compare/v0.1.1...v0.2.0) (2025-05-08)


### Bug Fixes

* parent container has wrong width ([c219591](https://github.com/MrMarble/hb-key-exporter/commit/c219591708215080eb947d391e2cfce1f399a082))


### Features

* bulk claim on export ([2ca166d](https://github.com/MrMarble/hb-key-exporter/commit/2ca166dbeee4d999f63a99c2e4eac5d835f6e449))
* generate gift link ([7b40b29](https://github.com/MrMarble/hb-key-exporter/commit/7b40b29337519d13622cce8d84efdaf752550cf0))
* show unrevealed keys ([fcf44e2](https://github.com/MrMarble/hb-key-exporter/commit/fcf44e27927a7806175862f87b19f2e35ff7ea74))



## [0.1.1](https://github.com/MrMarble/hb-key-exporter/compare/v0.1.0...v0.1.1) (2025-05-07)


### Features

* add update urls to meta ([6068fbf](https://github.com/MrMarble/hb-key-exporter/commit/6068fbfb6911a91b9a2caa41850d26d0b7fad948))



# 0.1.0 (2025-05-07)



