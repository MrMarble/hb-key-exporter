# Humble Bundle Key Exporter

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
  - ASF (`<name><TAB><key>`)
  - TXT (`<key>`)
- Reveal hidden keys
- Create Gift links
- Show purchase dates for owned Steam games
- Bulk claim keys!

## Installation

1. Install [Violentmonkey](https://violentmonkey.github.io/) or similar browser extension.
2. Get the [latest version](https://github.com/MrMarble/hb-key-exporter/releases/latest/download/hb-key-exporter.user.js) from the releases page.
3. Done

## Usage

Go to Humble Bundle [keys page](https://www.humblebundle.com/home/keys), open the collapsible menu by clicking on the `Advanced Exporter` button at the top of the main section.

> [!NOTE]
> You need to be signed in to Steam for some of the features to work, such as showing purchase dates and claiming keys.

## Contributing

### Build

The toolchain is pinned in `mise.toml` (Node 24, pnpm 10). With
[mise](https://mise.jdx.dev/) installed, `mise install` provisions both;
otherwise use [pnpm](https://pnpm.io/) with Node >= 20.18.0.

```bash
pnpm install
pnpm build
```

The bundled userscript is written to `dist/hb-key-exporter.user.js`. Note that
`pnpm build` runs the linter first and will fail before bundling if it reports
errors.

### Commit messages

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/). A
`commit-msg` git hook runs [commitlint](https://commitlint.js.org/) and rejects
messages that don't parse:

```
feat: add CSV column chooser
fix(table): correct expiry sort order
feat!: drop support for Node 18
```

`feat:` bumps the minor version, `fix:` the patch version, and a `!` suffix (or a
`BREAKING CHANGE:` footer) bumps the major. Types other than `feat`/`fix`/`perf`/
`revert` are kept out of the changelog.

## Releasing

Releases are automated with
[release-please](https://github.com/googleapis/release-please-action). Merging
conventional commits to `main` keeps a "chore: release vX.Y.Z" pull request up to
date with the next version and the generated `CHANGELOG.md`.

Merging that release PR bumps `package.json`, updates the changelog, and pushes
the `vX.Y.Z` tag, which in turn triggers `publish.yml` to build and attach
`dist/hb-key-exporter.user.js` to the GitHub release. No manual version bumping
or tagging is required.

> [!NOTE]
> The workflow uses a `RELEASE_PLEASE_TOKEN` repository secret (a PAT). The
> default `GITHUB_TOKEN` cannot be used here because tags it creates do not
> trigger `publish.yml`.

## Troubleshooting

Humble bundle will load all your keys into the `localStorage` of your browser. This userscript will read the keys from there. If you have a lot of keys, it may take a while to load them all the first time, leave the page open for a minute or two, you can refresh the list by clicking the `Refresh` button on the right or just reload the page.
