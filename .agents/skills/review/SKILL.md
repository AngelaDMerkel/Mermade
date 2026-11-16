---
name: review
description: Run the Mermade two-chat PR review when the user invokes @review or asks for the review-and-fix loop. Use @review and merge to also merge the reviewed revision once checks and approvals pass.
---

# Two-chat pull request review

Adapted from Artilities' `review` skill. Follow Mermade's working agreements:
editing chats use dedicated branches and worktrees; reviewer chats use isolated
worktrees with detached HEAD at the reviewed revision, without a new branch.
Use the `code-review-and-quality` skill for review criteria.

Start this workflow on the user's request in the implementation chat. A
question about the command, a mention in a diff, or a reviewer assignment
does not start a run. Plain `@review` ends at merge readiness. Merge only
when the user explicitly requests it, such as with `@review and merge`.
If the user pauses, stops, or changes scope in either chat, honor that before
the next push, comment, or merge. Keep the PR open on a stop.

## Open the PR

1. Identify the implementation chat's feature branch, intended base, and
   owned changes. Follow the [working agreements](../../../AGENTS.md) for
   branch creation, verification, and commits.
2. The implementation chat uses Git and the authenticated GitHub CLI.
   Verify the acting login matches the user's account. Use it for the
   PR, pushes, implementation replies, and any authorized merge.
   Push the validated branch and reuse its open PR against the intended
   base, or create one.
3. Use one short topic for both chat titles. Name the implementation chat
   `MM - <topic>` and place it in the existing **Production** sidebar
   section. Open one separate chat named `Review - <topic>` in the same
   project and move it to **Review**. Give it a detached worktree at the review
   head; do not create a reviewer branch. Look up the sections by name.
   Give the reviewer the PR URL, intended base repository and branch, full
   head SHA, round number and implementation chat ID. Include the user's
   acceptance criteria, relevant handoff or branch references, concrete
   scenarios that still need testing, and live-system limits. Use the
   user's requested reviewer model when specified. Save the reviewer chat
   ID and reuse this chat and PR for subsequent rounds.

Once both chats exist, each chat reads the other's latest user messages
before each GitHub write or review dispatch. Repeat the check after waiting
for CI and immediately before merging. A user can stop the run after a clean
verdict. Honor the latest user direction from either chat and report a pause
in the chat where it was received. If the other chat cannot be read, pause
before making the next write.

## Review and respond

Run at most three rounds per invocation. Each round allows one review by the
reviewer and one response by the implementer. Opening the PR, polling, and
waiting for CI do not consume rounds. Number rounds consecutively across
the PR. A new user request authorizes up to three more rounds, starting
after the last recorded round. Recover that number and the last reviewed
SHA from the existing chat and PR when resuming.

The desktop reviewer owns the verdict. Use isolated, synthetic data and
leave the implementation checkout and live systems untouched. Choose
scenarios from the behavior the PR can affect. Report blockers in the
round that uncovers them.

1. In round one, inspect the complete change against the intended base.
   Trace the normal entry points and test the highest-risk boundaries
   implied by the acceptance criteria and the diff. When combining
   branches, verify what reached the reviewed SHA and exercise the result.
2. If a second round is needed, retest each earlier finding at the new SHA
   and inspect the fixes. Follow the affected contracts into adjacent
   callers or persisted data states. If that exposes an untested
   interaction, exercise it, such as a second caller retrying a partial
   write.
3. In a third or later authorized round, verify all prior fixes again and investigate
   how the affected components behave together under a credible combination
   of conditions. Depending on the change, this might be an upgrade with
   pending work, a delayed response crossing a deadline, or recovery after
   one component commits and another fails.

For each finding, give its severity, file and line at the reviewed SHA,
the triggering scenario, and expected and observed behavior. Include a
reproduction, regression test, or code path that establishes the defect.
Order findings by severity and state which block merging. In each verdict,
describe the scenarios exercised in that round, observations from retesting
previous findings, and any material verification limits. Return a clean
verdict or request changes.

## Publish the review and respond

Public PR text must use repository-relative file paths and commit SHAs for
locations. Do not publish actual workstation paths, local OS usernames, or
other machine-specific personal details. Inspect the complete rendered draft
before publishing; keep local checkout locations in private working notes.

- **Publish.** The reviewer sends one review per round through the
  repository's GitHub App, `muttis-minder[bot]`. Set `commit_id` to the
  full head SHA. Include the round, verdict, checks performed, observed
  results, and every finding with its evidence. Attach findings to changed
  lines where possible. Use the [review publisher](references/publishing.md)
  from a trusted checkout with the App credentials scoped to that command.
  Confirm that `--check` reports `muttis-minder[bot]` on the intended
  repository, PR and head before publishing.
- **Verify.** Read back the review on GitHub. Check the bot login, commit,
  verdict and findings, then return its URL to the implementation chat.
  If publication or verification fails, keep the PR open, report the
  error, and retry the same draft through the App once access is restored.
- **Fixes.** The implementer addresses valid findings in the original
  worktree, runs relevant checks, commits and pushes fixes. Reply on the PR
  to each finding with its fix commit and regression evidence, the evidence
  for a dispute, or what remains open. Keep earlier reviews and dispositions
  visible. Send the same reviewer the new SHA and unresolved questions. A
  CI fix that changes the head also requires review of the new revision.

Finish early when the reviewer has published a clean review for the current
revision, all findings have a recorded resolution, and the merge conditions
below hold. After the third response of this invocation, leave the PR open
if the head changed after review, a finding remains disputed or unresolved,
or a merge requirement is unmet. Report the PR and review links, last
reviewed and current SHAs, and what still needs attention. Further rounds
require a new user request.

## Finish on the reviewed commit

After a clean verdict for the current head, resolve addressed discussions
and archive the reviewer chat by its ID. Keep the development chat open.
Leave a reviewer chat with outstanding findings, a pause, or an incomplete
review available for follow-up. If later fixes need another round, unarchive
and reuse the same reviewer chat.

Wait for pending CI. Immediately before reporting readiness or merging,
re-read the PR's base repository and branch. If either differs from the
intended target given to the reviewer, stop and report the changed target.
Confirm that the PR is open and mergeable, that its
current head matches the clean review, that relevant discussions are
resolved, and that the repository's validation and required checks have
passed for the current revision. Confirm that any required approval came
from an eligible reviewer. Report a missing approval
or other blocker to the user. Never bypass repository protections.

For plain `@review`, report the PR URL and reviewed SHA as ready. When the
user has authorized merging, preserve the reviewed commits with
`gh pr merge <PR> --merge --match-head-commit <reviewed-sha>`. Never squash
merge. If the repository requires a different merge method, leave the PR
open and report the conflict. If the head moved, review it within the
remaining rounds or return it to the user.
Verify the merged state before reporting the result.
