# pe-03-llm — First LLM classifier + transport vs content

> Your billing team inherited an LLM invoice-extraction service from a nearby team. It parses
> eight structured fields out of uploaded documents, has HTTP error guards, and has been
> "working" for three months at 400 documents a day. Then a new customer sends documents
> outside the shape the model was ever tested on. The model hits its token limit mid-response.
> `JSON.parse` throws. The error handler swallows it to `null`. The write path stamps the row
> `"processed"` with every field null. The accounting ledger imports 47 blank entries. Nobody
> notices for nine days — the UI renders empty fields as `—`, not errors. End-of-quarter
> reconciliation finds ₹8.4 million in unrecorded payables.

This is **Module 3**. The one idea: **an LLM call is a non-deterministic, unreliable network
call — transport success (200 OK) is not content success; a well-formed HTTP response can still
carry an unusable body.**

You will guard transport and content as two separate failure classes, bound the retry loop,
and dead-letter what cannot be trusted — without touching the extraction prompt or the LLM
call itself.

---

## What it does (once fixed)

`extractInvoice(document, client)` sends the document to the injected LLM client, validates
the body before any write, and either:

- stores a complete `InvoiceRecord` in the invoice store (`getInvoices()`), or
- writes a `DeadLetter` with the original document + reason + error type (`getDeadLetters()`).

Nothing is null-filled and stamped "processed". Nothing is retried more than `MAX_RETRIES` times.

---

## What is broken

- **[Bug 1]** A truncated body (`JSON.parse` throws) is swallowed to `null`. A null-filled row is
  written with `status: "processed"`. Transport was fine. Content was not.
- **[Bug 2]** The retry logic treats schema-mismatch (a content failure) as retryable — running
  the identical call 4 times against a document that will always exceed the token limit.
- **[Bug 3]** An invoice with `amount: null` is written as `status: "processed"`. The test that
  delivered this bug only checks the status code and non-null return — nothing proves the amount
  is a real number.
- **[Bug 4]** After MAX_RETRIES 429 responses, the function returns `null` and walks away. No
  dead-letter is written. The original document is gone — nothing to re-process when the rate
  limit clears.
- **[Bug 5]** The retry loop has no attempt cap. One 429 then success works fine. A persistent
  429 (or a truncation that never clears) retries without bound.

> The test suite runs fully offline. All LLM calls are mocked via the injected `LLMClient` —
> no network, no real API keys required in CI.

---

## Before touching code — reading (~40 min + video)

▶ **Orientation video** — watch first: https://customer-r5z7zoebyw1di9aq.cloudflarestream.com/232c7c420cf7eb1b766ffe002d2849e4/watch

1. [`docs/reading.md`](docs/reading.md) — transport ≠ content, retry semantics, dead-lettering.
2. [`docs/glossary.md`](docs/glossary.md) — terms this module uses (~10 min).
3. [`docs/design-review.md`](docs/design-review.md) — the resilience design decision (~5 min).
4. [`docs/ai-workflow.md`](docs/ai-workflow.md) — using AI as a reviewed collaborator (~5 min).

Then fill in [`hypothesis.md`](hypothesis.md) and run `npm run begin`.

---

## How to proceed — one bug at a time

1. Do the reading → fill in `hypothesis.md` → `npm run begin`
2. Fix Bug 1 → fill in `bug-journal/bug-01.md` → push, open a PR, **merge when CI is green**
3. Pull `main` — the gate bot delivers the next bug's test → fix it → open a PR → **merge again**
4. Repeat through Bug 5. **Bugs 3 and 5 are discovery bugs** — see below.
5. Fill in `REFLECTION.md`, `SKILL-STATEMENT.md`, and `ai-session-log.md`. Watch the exit video.
6. `npm run validate` → open your final pull request → **merge when CI is green**

See [`docs/pull-request-flow.md`](docs/pull-request-flow.md) for the full PR + merge loop.

> **The discovery bugs (Bugs 3 and 5).** Their tests *pass* when you receive them. That is the
> point. A test that only checks a surface signal (`status === "processed"`, `result !== null`)
> proves the extractor returned something — not that the content is valid. You have to notice the
> lie, reproduce the silent failure, and rewrite the test to prove what really happened (read the
> amount back from the store, or assert the dead-letter was written). The gate checks both.

> **What is actually enforced:** `begin` and `unlock` are local scaffolds that keep you honest —
> they are not enforced. The real gate is **CI on your pull request** (`npm run validate` +
> typecheck + tests). **You click Merge when CI is green** — the gate bot only runs after merge.

---

## Getting started

Open [`docs/cursor-setup.md`](docs/cursor-setup.md) if you have not set up Cursor yet.

```bash
node -v          # need 20+ (22 recommended — see .nvmrc)
npm install
npm run begin    # fails until hypothesis.md is complete
npm test         # two tests fail (Bug 1) — start there
```

## The Cursor rule

You may use Cursor. You may ask it what an error means. You may **not** ask it to fix code you
have not read. At your weekly sync you will explain each fix — especially how you found Bugs 3
and 5 — without looking at your PR.

## PR requirements

Your PR description must include:

- **Why each fix was necessary** — one short paragraph per bug, naming the *failure mode*.
- **Hypothesis** — what you thought was wrong before you started editing (required at the capstone).
- **Discovery** — how you found Bugs 3 and 5, the bugs nothing pointed you to directly.

## What this demonstrates

*Leave blank. You fill this in at the portfolio wrap.*
