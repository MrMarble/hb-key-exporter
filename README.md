# HumbleBundle Key Exporter

![License](https://img.shields.io/badge/License-MIT-blue)
![GitHub Release](https://img.shields.io/github/v/release/mrmarble/hb-key-exporter)
![GitHub Downloads](https://img.shields.io/github/downloads/mrmarble/hb-key-exporter/total)

Userscript to assist in key management for Humble Bundle games.

![](/assets/image.png)

## Features

- Easily view and copy keys
- Advanced filtering options
- Export in various formats:
  - CSV (all data)
  - ASF (`<name> <key>`)
  - TXT (`<key>`)
- Reveal hidden keys
- Create Gift links
- Bulk claim keys!

## Installation

1. Install [Violentmonkey](https://violentmonkey.github.io/) or similar browser extension.
2. Get the [latest version](https://github.com/MrMarble/hb-key-exporter/releases/latest/download/hb-key-exporter.user.js) from the releases page.
3. Done

## Usage

Go to Humble Bundle [keys page](https://www.humblebundle.com/home/keys), open the collapsible menu by clicking on the `Advanced Exporter` at the top of the main section.

### Build

To build the userscript locally, make sure you have [pnpm](https://pnpm.io/) installed, then run:

```bash
pnpm install
pnpm build
```

## Troubleshooting

Humble bundle will load all your keys into the `localStorage` of your browser. This userscript will read the keys from there. If you have a lot of keys, it may take a while to load them all the first time, leave the page open for a minute or two, you can refresh the list by clicking the `Refresh` button on the right or just reload the page.
