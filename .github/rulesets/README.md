# Branch rulesets

`main.json` is the ruleset protecting the default branch. It is kept in the repo
so the protection config is reviewable and reproducible instead of living only
as checkboxes in the GitHub UI. **It is not applied automatically** — GitHub does
not read rulesets from the repository. Apply it with `gh`:

```sh
# Create
gh api --method POST /repos/MrMarble/hb-key-exporter/rulesets \
  --input .github/rulesets/main.json

# List (to find the id)
gh api /repos/MrMarble/hb-key-exporter/rulesets

# Update an existing ruleset
gh api --method PUT /repos/MrMarble/hb-key-exporter/rulesets/RULESET_ID \
  --input .github/rulesets/main.json
```

Applying this requires admin on the repo, and a token with the `repo` /
`administration:write` scope.

## What each rule does

| Rule | Effect |
| --- | --- |
| `deletion` | `main` cannot be deleted. |
| `non_fast_forward` | No force pushes — history cannot be rewritten to slip a commit past review. |
| `pull_request` | No direct pushes to `main`; changes must go through a PR. |
| `required_status_checks` | The `build` job from `lint.yml` must pass. |

Inside the `pull_request` rule:

- **`required_approving_review_count: 1`** — one approval to merge.
- **`require_code_owner_review: true`** — this is what activates `.github/CODEOWNERS`.
  Without it the CODEOWNERS file is advisory only and the release gate does not exist.
- **`dismiss_stale_reviews_on_push: true`** — approvals are voided by new commits.
  Critical here: otherwise an approval could be collected on a benign diff and the
  real payload pushed afterwards, before merge.
- **`require_last_push_approval: true`** — whoever pushed last cannot be the sole
  approver, so a review can never be self-serviced.

`strict_required_status_checks_policy: true` requires branches to be up to date
before merging, so the artifact is built from what was actually reviewed rather
than from an untested merge result.

## `bypass_actors` is deliberately empty

Repo admins would otherwise be able to merge past the code-owner requirement,
which defeats the point of the gate even for the admin who set it up. Leave it
empty; grant collaborators **Write**, never Maintain or Admin. Maintain/Admin can
edit or delete this ruleset, at which point it is advisory rather than enforced.

## Note on release-please

These rules target `main` only, not the `release-please--*` branch, so
release-please can continue to force-push its own PR branch normally. The rules
apply when that PR is merged into `main` — which is the intended gate.

`allowed_merge_methods` includes all three; if you enable "Require linear
history" later, drop `merge` from that list.
