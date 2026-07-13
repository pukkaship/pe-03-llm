# Cursor setup — your lab environment

Pukkaship ships a **Cursor-native** workspace. Rules and hooks are preloaded so the AI guides you instead of solving exercises for you.

## 1. Install Cursor

Download from [cursor.com](https://cursor.com). Students with a `.edu` email can claim [one year of Pro free](https://cursor.com/students).

Sign in with GitHub so private repo access works out of the box.

## 2. Open this repo in Cursor

**Option A — one click (if Cursor is installed):**

Use the **Open in Cursor** link on your [pukkaship.dev/welcome](https://pukkaship.dev/welcome) page after registration.

**Option B — clone from the terminal:**

```bash
git clone https://github.com/pukkaship/pe-01-YOUR_GITHUB_USERNAME.git
cd pe-01-YOUR_GITHUB_USERNAME
cursor .
```

**Option C — from inside Cursor:**

`Cmd+Shift+P` → **Git: Clone** → pick your private `pukkaship/pe-01-*` repo.

## 3. Install dependencies

From the repo root (the folder that contains `package.json`):

```bash
node -v          # need 20+ (22 recommended — see .nvmrc)
npm install
```

This downloads Vitest, TypeScript, and the rest. It should finish in under a minute with no errors.
If install fails with `ESTRICTALLOWSCRIPTS` or mentions `esbuild`, pull the latest `main` — the
repo ships an approved script list for npm 11+.

## 4. Verify the pack loaded

Open **Cursor Settings → Rules** (or `.cursor/rules/` in the file tree). You should see:

| Rule | Purpose |
|------|---------|
| `exercise-guard` | Blocks the agent from patching `src/` for you |
| `ai-collaboration` | Reminds you to understand before you fix |

Hooks (`.cursor/hooks.json`) add a second line of defense: the agent asks before writing to exercise files.

Try it: ask the agent *"fix bug 1 for me"* — it should respond with questions, not a patch.

## 5. How to use AI here

Read [`docs/day1-micro-loop.md`](day1-micro-loop.md) for the full loop. The short version:

- Ask what errors **mean**, not how to fix them
- Read the code yourself before accepting any suggestion
- Write the **why** in your bug journal and PR — that's what gets graded

## 6. Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm install` fails on `esbuild` / `ESTRICTALLOWSCRIPTS` | Pull latest `main` (includes `allowScripts` in `package.json`) |
| `vitest: command not found` | Run `npm install` from the repo root first |
| Rules not showing | Re-open the repo folder (not a parent monorepo) |
| Clone fails (private repo) | Sign in to GitHub inside Cursor; use HTTPS clone |
| Agent still writes fixes | Check `.cursor/rules/` exists; restart Cursor |
| Using VS Code or another editor | Follow the AI rule in the README and `docs/day1-micro-loop.md` — gates are editor-agnostic |

Cursor is the recommended runtime. The curriculum and gates work in any editor — the `.cursor/` folder is optional but strongly recommended.
