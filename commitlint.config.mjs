/**
 * Conventional Commits enforcement.
 *
 * release-please parses these messages to decide the next version and to build
 * CHANGELOG.md, so a malformed subject silently drops the commit from the
 * release notes. The types below mirror `changelog-sections` in
 * release-please-config.json.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
  },
}
