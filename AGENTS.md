# Mermade working agreements

These instructions apply to every Codex chat working in this repository. Read
[README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), and any applicable
nested `AGENTS.md` before changing files.

## Branches and worktrees

- Every new Codex editing chat must have its own newly created Git branch and
  worktree before beginning repository work. If Codex already created a dedicated
  pair for that chat, use it rather than creating a second pair. This is standing
  authorization; do not ask again for routine creation.
- Check `git status --short`, `git branch --show-current`, `git branch --all`,
  and `git worktree list` first. Confirm the intended base. For editing chats,
  use a descriptive, unique `codex/<topic>` branch name. Keep the shared primary
  checkout on `main`.
- Reuse the editing chat's assigned branch and worktree for follow-up work,
  testing, and review fixes. A new editing chat gets a new pair; a new message
  in the same chat does not. Bring needed base-branch changes into that branch.
- Reviewer chats use an isolated worktree with detached HEAD at the exact
  revision being reviewed. Do not create a branch for a review. Implementation
  fixes belong in the original editing chat's branch and worktree.
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

Use the [repository-local `review` skill](.agents/skills/review/SKILL.md), adapted
from Artilities, when the user invokes `@review`, `$review`, or the review-and-fix
loop. The invocation requests a PR, a separate reviewer chat in a detached
worktree, and up to three rounds of independent review and fixes. Use
`code-review-and-quality` for correctness, readability, architecture, security,
and performance criteria.

Plain `@review` stops at merge readiness. `@review and merge` also authorizes
merging the reviewed revision after all requirements pass. The reviewer owns
its verdict and publishes through `muttis-minder[bot]`; the user's account owns
the PR, pushes, implementation replies, and merge. Follow the skill's publisher
preflight to verify the App has access to Mermade. Preserve the reviewed commits;
never squash merge. Discussing the workflow does not start it.

Hand off the result, worktree, branch, commit, checks, and outstanding limits.
Distinguish local commits from reviewed integration and deployment.
