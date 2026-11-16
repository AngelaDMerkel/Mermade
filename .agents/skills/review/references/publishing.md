# Publish through Muttis Minder

This skill uses Artilities' existing review publisher. It is an external tool
dependency, not bundled Mermade application code. Use a trusted Artilities
checkout containing `scripts/review/publish.mjs` and `scripts/review/github.mjs`,
with Node.js 24.2 or later. On the current workstation the publisher is:

```text
/Users/duffy/Documents/GitHub/artilities/scripts/review/publish.mjs
```

The existing private settings file is
`~/.config/artilities-reviewer/app.env`. It supplies `ARTILITIES_REVIEW_APP_ID`
and `ARTILITIES_REVIEW_KEY_FILE`; never print or copy its values into the
repository, chat, or PR. The Muttis Minder App must be installed for
`AngelaDMerkel/Mermade` with **Pull requests: Read and write**. Do not assume
access because it works for Artilities. If the publisher, credentials, or
installation are unavailable, finish the independent review, report the
publication blocker, and leave the PR open. Do not substitute the PR author's
account for the reviewer or change App permissions without authorization.

Run candidate scripts and tests in a disposable container or VM containing
only candidate source, test dependencies, and synthetic fixtures. Keep the
signing key, settings file, host home directory, Docker socket, and credential
agents outside it. A separate worktree alone does not isolate host credentials.
Run the trusted publisher on the host with credentials scoped to that command.

Prepare the review in a temporary JSON file outside tracked source:

```json
{
  "repository": "AngelaDMerkel/Mermade",
  "pr": 1,
  "base": "main",
  "head": "<full reviewed head SHA>",
  "round": 1,
  "verdict": "clean",
  "summary": "Describe checks, observations, and material verification limits.",
  "findings": []
}
```

Use the actual PR number, full 40-character head SHA, and next PR round. For
requested changes, use `"verdict": "request_changes"` and findings with `body`,
plus optional repository-relative `path`, positive `line`, and `side` (`RIGHT`
by default, or `LEFT` for removed lines). Include severity, trigger, and evidence
in each body. A clean verdict has no unresolved required findings.

Preview offline, verify the App and PR using a read-only token, then publish
after checking the latest user directions in both chats:

```sh
publisher=/Users/duffy/Documents/GitHub/artilities/scripts/review/publish.mjs
draft=/absolute/path/to/review.json
settings="$HOME/.config/artilities-reviewer/app.env"
node "$publisher" --dry-run "$draft"
node --env-file="$settings" "$publisher" --check "$draft"
node --env-file="$settings" "$publisher" --publish "$draft"
```

Set `publisher` to the trusted checkout's actual path on another workstation.
Before publishing, `--check` must report `muttis-minder[bot]` on the intended
repository, PR, base, and head. Publication verifies the review author, commit,
verdict, and content before returning its URL. Read the review back on GitHub.
Repository rules determine which approvals count.

Retry the same JSON on the same workstation after a publication error. The
publisher reconciles the PR's recorded rounds before submitting and stores
exclusive round claims under
`${XDG_STATE_HOME:-~/.local/state}/artilities/reviews`. Do not remove a claim
while publication may be pending. Once the head changes, use the next round.
