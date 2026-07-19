# pe-03-llm — LLM Reliability

> A team automated invoice processing for 200 SME customers. An LLM extracted eight structured
> fields from each uploaded document. It ran 400 invoices a day for three months without an
> incident. Then a large enterprise customer onboarded — government-contractor invoices, vendor
> names up to 280 characters, a table layout the model had never seen. On day 3 the model hit
> its completion-token limit mid-response. The retry logic reran the identical call four times,
> hit the same wall four times, then wrote a row with every field null except one: `status:
> "processed"`. The customer's ledger imported 47 blank entries. Nobody noticed for nine days.
> End-of-quarter reconciliation found ₹8.4 million in unrecorded payables.

This is **Module 3**. The one idea: **a completed response is not a usable answer — transport
success and content success are two separate claims your code must prove separately.**

---

## What it does (once fixed)

`extract_invoice(document, model_client)` accepts a raw invoice string and an injected
`ModelClient`, calls the model to extract eight fields, validates the response body, and
writes either an `InvoiceRecord` to the invoice store or a `DeadLetterRecord` to the
dead-letter store. Read `get_invoices()` and `get_dead_letters()` to observe state in tests.

---

## What is broken

- **Bug 1 (failing now):** When the LLM returns a truncated body and JSON parsing throws, the
  exception is swallowed and a null-filled row is written with `status="processed"`. The
  invoice store fills with blank records the accounting system imports as real payables.

- **Bug 2:** A content failure (a well-formed JSON response with the wrong schema) is
  classified the same way as a transport error and retried. The identical call re-triggers the
  identical schema failure on every attempt.

- **Bug 3 (a report, no error to chase):** A teammate reports: *"I fixed the duplicate-invoice
  bug last week and all the tests went green. But Finance says some invoices in the ledger
  still have a null amount. I can't reproduce it — the API always returns a record."*

- **Bug 4:** When transport retries are exhausted, the function returns `None` with no
  dead-letter record. The original document is silently discarded — there is no recovery path
  and no auditable trace.

> The test suite runs fully offline and deterministically. No network calls, no live LLM.
> `ModelClient` is injected so tests control every response.

---

## Before touching code — reading (~40 min + video)

▶ **Orientation video** — watch first: https://customer-r5z7zoebyw1di9aq.cloudflarestream.com/232c7c420cf7eb1b766ffe002d2849e4/watch

1. [`docs/week3-01-reading.md`](docs/week3-01-reading.md) — the module's core reading (~20 min).
2. [`docs/week3-02-glossary.md`](docs/week3-02-glossary.md) — the terms this module leans on (~10 min).
3. [`docs/week3-03-design-review.md`](docs/week3-03-design-review.md) — the running design-review habit (~5 min).
4. [`docs/week3-04-ai-workflow.md`](docs/week3-04-ai-workflow.md) — using AI as a reviewed collaborator (~5 min).
5. [`docs/week3-05-defense.md`](docs/week3-05-defense.md) — what the final defense recording involves (~2 min).

Then fill in [`hypothesis.md`](hypothesis.md) and run `node scripts/begin.cjs`.

---

## How to proceed — one bug at a time

1. Do the reading → fill in `hypothesis.md` → `node scripts/begin.cjs`
2. Fix Bug 1 → fill in `bug-journal/bug-01.md` → push, open a PR, **merge when CI is green**
3. Pull `main` — the gate bot delivers the next bug's test → fix it → open a PR → **merge again**
4. Repeat through all bugs. **Bug 3 is a discovery bug** — see below. There may be more.
5. Fill in `REFLECTION.md`, `SKILL-STATEMENT.md`, and `ai-session-log.md`.
6. `node scripts/validate_pr.cjs` → open your final pull request → **merge when CI is green**
7. After the final merge, record your **defense** on Loom (3–5 min) and submit the URL via the
   platform. See [`docs/week3-05-defense.md`](docs/week3-05-defense.md) for what the gate expects.

See [`docs/pull-request-flow.md`](docs/pull-request-flow.md) for the full PR + merge loop.

> **Discovery bugs.** Bug 3's test *passes* when you receive it. That is the point.
> A test that only checks a surface signal proves the code answered — not that anything
> actually happened correctly. You have to notice the lie, reproduce the silent failure, and
> rewrite the test to prove what really happened. Not every discovery in this module is
> announced. Some surface later. Apply the same habit each time.

---

## Getting started

```bash
python --version          # need 3.12+
pip install -e ".[dev]"
node scripts/begin.cjs    # fails until hypothesis.md is complete
pytest                    # one test fails (Bug 1) — start there
mypy src                  # must stay clean
```

---

## PR requirements

Your PR description must include:

- **Why each fix was necessary** — one short paragraph per bug, naming the *failure mode*.
- **Hypothesis** — what you thought was wrong before you started editing (required on the final PR).
- **Discovery** — how you found the bugs nothing pointed you to directly (required on the final PR).

## What this demonstrates

*Leave blank. You fill this in at the portfolio wrap.*
