# Module 3 design review — First LLM classifier + transport vs content

The running design-review habit (~5 min). Each module adds one section; you keep the earlier ones.

## State & correctness

Before you change code, answer:

1. Where does this system's state live, and what is the *one* path allowed to change it?
2. What does each "success" signal assume that it should not?
3. Is your planned fix the root cause, or does it only satisfy the test in front of you?

---

<a id="resilience"></a>
## Resilience

**Decision: transport failures and content failures are handled by two separate guards, and the
retry policy is decided per failure class.**

- A **transport failure** (HTTP 429, HTTP 5xx) is retryable. The LLM provider may recover; the
  same document can be sent again after a bounded wait. The retry must be **bounded** — a finite
  attempt cap with exponential backoff and jitter. After the cap is exhausted, the document is
  dead-lettered.

- A **content failure** (JSON.parse throws; schema validation fails) is **not** retryable. The
  failure is caused by the relationship between the document and the prompt — the model
  consistently produces the same unusable output for the same input. Re-running the identical
  call re-triggers the same failure. The document must be dead-lettered immediately (attempt
  count 0 retries for content failures).

**Constraint: no LLM response reaches a database write until it has passed content validation.**

A parse failure or schema-validation failure must **fail loud** (dead-letter), never be coerced
to `null` and written with `status: "processed"`. Stamping a null-filled row "processed"
impersonates a successful extraction.

The dead-letter record must carry:
- `originalDocument` — the raw document string, so it can be re-processed after the root cause
  is fixed (a wider token budget, a corrected schema, a cleared rate limit).
- `reason` — a human-readable description of what failed.
- `errorType` — `"parse_error"` | `"schema_invalid"` | `"retries_exhausted"`.
- `createdAt` — timestamp for the audit trail.

**What the accounting UI should show for a dead-lettered invoice:** `—` (awaiting extraction /
pending manual review) — not null fields stamped `"processed"`. The dead-letter is the recovery
path, not the final state.

**The fix lives entirely in the validation / retry / dead-letter layer. The extraction prompt
and the LLM call itself are not modified.**
