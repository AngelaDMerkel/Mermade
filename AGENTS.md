# Mermade working agreements

These instructions apply to every Codex chat working in this repository. Read
[README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), and any applicable
nested `AGENTS.md` before changing files.

## One branch and worktree per chat

- Every new Codex chat must have its own newly created Git branch and worktree
  before beginning repository work, including review work. If Codex already
  created a dedicated pair for that chat, use it rather than creating a second
  pair. This is standing authorization; do not ask again for routine creation.
- Check `git status --short`, `git branch --show-current`, `git branch --all`,
  and `git worktree list` first. Confirm the intended base and use a descriptive,
  unique `codex/<topic>` branch name. Keep the shared primary checkout on `main`.
- Reuse the chat's assigned branch and worktree for follow-up work, testing, and
  review fixes. A new chat gets a new pair; a new message in the same chat does
  not. Bring needed base-branch changes into the assigned branch.
- Never switch another chat's checkout, share its Git index, silently stash or
  discard its changes, or reuse an occupied worktree. Coordinate overlapping
  changes and preserve unrelated work. Worktrees do not isolate ports, browser
  storage, or external services.

## Semantic commits for every meaningful change

- Make a semantic commit for every completed, coherent, validated change.
  Commit meaningful milestones during longer tasks and commit completed work
  before handoff, unless the user explicitly asks to leave it uncommitted.
  Related implementation iterations belong in one commit; individual edits,
  chat replies, and verification runs are not commit boundaries.
- Use Conventional Commits: `type(scope): concise imperative summary`. Choose
  `feat`, `fix`, `refactor`, `docs`, `test`, `build`, `ci`, `perf`, `style`, or
  `chore` with a meaningful scope. Mark genuine breaking changes with `!` and
  explain them in the body or footer.
- Run checks appropriate to the change before committing. Review the entire
  staged diff and stage only owned files or hunks. Preserve unrelated index
  entries; never sweep another chat's work into a commit.
- Preserve existing and published history. Do not rewrite old commits merely
  to rename them. Read-only work does not require a commit.
- Local commits are already authorized. Pushing, merging, deploying, and
  publishing require authorization for those actions.

## Verification

- Keep canonical Mermaid source authoritative and follow the editing and async
  state invariants in [ARCHITECTURE.md](ARCHITECTURE.md).
- Choose checks based on the affected behavior: `npm run test:unit` for unit
  coverage, `npm run lint` for static analysis, `npm test` for the production
  build and full suite, and `npm run build:pages` for the static export.
- Add behavior tests for new logic and regression tests for bug fixes. Verify
  visible behavior in the browser when UI or interactions change. Use isolated,
  synthetic data and keep tests from affecting live systems.
- For documentation-only changes, check accuracy, links, and `git diff --check`;
  application tests are unnecessary unless documented behavior also changes.
- Report checks actually run and any material verification limits. Do not
  describe an unavailable or skipped check as passing.

## Review process

Use the `code-review-and-quality` skill for correctness, readability,
architecture, security, and performance review before integration. The workflow
below follows the two-chat review pattern in Artilities' repository-local
`review` skill.

- An explicit `@review`, `$review`, or request for the review-and-fix loop
  authorizes pushing the validated branch, opening or reusing its PR, creating
  a separate reviewer chat with its own branch and worktree, and up to three
  review-and-fix rounds. Discussing the workflow does not start it. Plain
  `@review` stops at merge readiness; `@review and merge` also authorizes merging
  once all requirements pass.
- Give the reviewer the PR URL, intended base repository and branch, full head
  SHA, round number, implementation chat ID, acceptance criteria, and relevant
  verification limits. Reuse the same PR and reviewer chat across rounds.
- The reviewer independently tests the exact revision and owns the verdict.
  Start with the complete diff and highest-risk behavior. In later rounds,
  retest prior findings and inspect fixes, adjacent callers, and interactions.
  Keep the implementation checkout untouched.
- Each finding must include severity, file and line at the reviewed SHA,
  triggering scenario, expected and observed behavior, and supporting evidence.
  Distinguish existing defects from regressions, required fixes from optional
  suggestions, and report verification limits. A clean review is a valid result.
- Record each round's verdict, reviewed SHA, checks, and findings on the PR.
  Use an eligible independent reviewer identity configured for this repository
  when publishing approvals, and read back the published review to verify its
  author and revision. Artilities' bot and publishing setup are repository
  specific; do not assume they are configured for Mermade.
- The implementer addresses valid findings in the original worktree, verifies,
  commits, and pushes fixes. Respond to every finding on the PR with the fix
  commit and evidence, a supported dispute, or the remaining blocker. Any head
  change, including a CI fix, needs review of the new revision.
- Read the latest user directions in both chats before GitHub writes, review
  dispatches, and the final readiness or merge decision. Honor a pause or scope
  change. After three rounds, leave unresolved work open and report the current
  and last reviewed SHAs; further rounds require a new request.
- Before reporting readiness or merging, verify the intended base, unchanged
  reviewed head, clean verdict, resolved required findings, mergeability, and
  passing required checks and approvals for that revision. Never bypass branch
  protections. For an authorized merge, preserve the reviewed commits with
  `gh pr merge <PR> --merge --match-head-commit <reviewed-sha>`; do not squash.
  Report a conflicting repository merge policy rather than changing methods.
- Archive the reviewer chat after a successful completed review, keeping it
  available while findings remain. Reopen and reuse it for further authorized
  rounds. Keep the implementation chat open and verify any merge before
  reporting success.

Hand off the result, worktree, branch, commit, checks, and outstanding limits.
Distinguish local commits from reviewed integration and deployment.
