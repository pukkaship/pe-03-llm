# Pull request flow

One bug = one pull request. **You merge when CI is green** — no one merges for you.

## Steps (every bug)

1. Push your branch and open a PR against `main`.
2. Wait for the **CI** check (`verify`) to finish — usually under a minute. It runs typecheck,
   tests, and validates your PR description.
3. When all required checks are green, click **Merge pull request** on GitHub.
4. Within seconds, the gate bot commits the next bug's test and journal template to `main`.
   Pull `main` locally (`git pull`) before starting the next bug.

If CI fails, read the Actions log, fix, and push again — checks re-run automatically.

## What each check does

| Check | Blocks merge? | What it means |
|-------|---------------|---------------|
| **CI / verify** | Yes | Typecheck, tests, and PR body validation for your current bug milestone |
| **AI PR review** | No | Advisory comment only — may no-op if not configured |

Green **CI** is the gate. Merge yourself as soon as it passes.

## PR description

Module 1 requires **"Why each fix was necessary"** in the PR body from Bug 1 onward. CI reads
the description — write it in the PR form on GitHub, not only in a local file.

## After merge

- Pull latest `main` before you edit again.
- Read the gate bot comment on your merged PR — it confirms the next bug was delivered.
- Fill in the bug journal for the bug you just fixed before opening the next PR.
