# Module 3 design review — First LLM classifier + transport vs content

The running design-review habit (~5 min). Each module adds one section; you keep the earlier ones.

## The system you are reviewing

Before the questions, hold the whole system in your head. It is small enough to fit.

`extract_invoice(document, model_client)` is a single function that turns one raw invoice string
into one of two outcomes:

```
                        ┌─────────────────────────────┐
document ──▶ model_client.complete() ──▶ body (a string, possibly garbage)
                        └─────────────────────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │  is this body usable?    │
                        └────────────┬────────────┘
                    usable │                 │ not usable
                           ▼                 ▼
                  _invoice_store       _dead_letter_store
                  (InvoiceRecord)      (DeadLetterRecord + original document)
```

Three facts about this system shape every decision below:

1. **The model call is the only untrusted input.** Everything downstream is your code. The
   document and prompt are fixed; the *body* the model returns is non-deterministic and may be
   truncated, off-schema, or a rate-limit error instead of JSON.
2. **There are exactly two terminal states — a written invoice or a dead-letter — and no third.**
   "Returned but wrote nothing", "returned a null-filled row stamped processed", and "silently
   dropped the document" are all bugs, not states.
3. **State is append-only and observed through two functions.** `get_invoices()` and
   `get_dead_letters()` are the only lens tests get. If you cannot prove an outcome through those
   two functions, you have not proven it.

Now walk the review questions against that picture.

<a id="state-correctness"></a>
## State & correctness

This is the design-review habit applied to *this* system. For each question below, answer it in
your own head **before** you expand the toggle. The value is in the gap between your answer and
the one written down — if they match, you understood it; if they do not, you just found where
your model of the system was wrong.

**1. Where does this system's state live, and what is the one path allowed to change it?**

<details>
<summary>Think, then expand.</summary>

State lives in two append-only stores: `_invoice_store` (successful extractions) and `_dead_letter_store` (failed ones). The only path that writes to either is `extract_invoice()`. Tests observe state via `get_invoices()` and `get_dead_letters()` — never by reading the private store variables directly. If a test imports the store list and inspects it, that test is bypassing the contract.
</details>

**2. What does each "success" signal assume that it should not?**

<details>
<summary>Think, then expand.</summary>

`extract_invoice()` returns a non-null `InvoiceRecord` — this assumes the returned record contains usable field values. `status: "processed"` assumes the extraction actually succeeded. Both signals are produced even when `amount` is `null`, when every field is `None`, and when the JSON body was garbage. A test that only asserts `result is not None` has accepted the success signal at face value without checking what it is claiming.
</details>

**3. Is your planned fix the root cause, or does it only satisfy the test in front of you?**

<details>
<summary>Think, then expand.</summary>

The recurring trap in this codebase is coercion — silently converting a bad value into a plausible-looking one so the check passes. Coercing `None` to `0.0` makes `amount is not None` true. A coerced value satisfies a shallow test without fixing the design flaw. The root cause in every case is the same: a bad response reaches a write path it should never reach. The fix must close that path — not paper over the bad value once it arrives.
</details>

---

<a id="resilience"></a>
## Resilience

**Decision: transport failures and content failures are handled by two separate guards, and the
retry policy is decided per failure class.**

- A **transport failure** (HTTP 429, HTTP 5xx) is retryable. The LLM provider may recover; the
  same document can be sent again after a bounded wait. The retry must be **bounded** — a finite
  attempt cap with exponential backoff and jitter. After the cap is exhausted, the document is
  dead-lettered.

- A **content failure** (`json.loads` raises; schema validation fails) is **not** retryable. The
  failure is caused by the relationship between the document and the prompt — the model
  consistently produces the same unusable output for the same input. Re-running the identical
  call re-triggers the same failure. The document must be dead-lettered immediately (attempt
  count 0 retries for content failures).

**Constraint: no LLM response reaches a database write until it has passed content validation.**

A parse failure or schema-validation failure must **fail loud** (dead-letter), never be coerced
to `null` and written with `status: "processed"`. Stamping a null-filled row "processed"
impersonates a successful extraction.

The dead-letter record must carry:
- `original_document` — the raw document string, so it can be re-processed after the root cause
  is fixed (a wider token budget, a corrected schema, a cleared rate limit).
- `reason` — a human-readable description of what failed.
- `error_type` — `"parse_error"` | `"schema_invalid"` | `"retries_exhausted"`.
- `created_at` — timestamp for the audit trail.

**What the accounting UI should show for a dead-lettered invoice:** `—` (awaiting extraction /
pending manual review) — not null fields stamped `"processed"`. The dead-letter is the recovery
path, not the final state.

**The fix lives entirely in the validation / retry / dead-letter layer. The extraction prompt
and the LLM call itself are not modified.**
