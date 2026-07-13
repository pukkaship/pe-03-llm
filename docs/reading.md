# Module 3 reading — Transport ≠ content

Read this before writing any code. The entry quiz draws directly from this document and the
orientation video. You do not need the repo open to answer it.

---

## The one idea

**An LLM call is a non-deterministic, unreliable network call — transport success (200 OK) is
not content success; a well-formed HTTP response can still carry an unusable body.**

Every developer who has worked with REST APIs knows that a 200 OK means the request reached the
server. With an LLM call, that is all it means. The body might be:

- A truncated JSON string — the model hit its completion-token limit mid-response.
- A JSON object with all the right keys, but `amount: null` (present but not a usable value).
- A JSON object in a completely different schema than you expected.
- A valid JSON string containing an error message from the model, not the structured output you asked for.

In each case: transport succeeded. Content failed.

---

## Why retry semantics differ by failure class

When a database connection drops, retrying the same query against a new connection works.
The query is the same; only the connection was bad.

When an LLM returns a truncated body because it hit its token limit, retrying the *identical*
call against the *same document* with the *same prompt* hits the **same token limit** every time.
The failure is in the content — the document plus the prompt produce a response that exceeds the
model's completion budget. Nothing about that changes on retry.

This is why transport failures and content failures require two separate guards — and why the retry
policy must be decided per failure class:

| Failure class | Cause | Retryable? | Correct response |
|---|---|---|---|
| HTTP 429 rate limit | Provider quota hit | **Yes** — bounded, with backoff/jitter | Retry up to N times; dead-letter on exhaustion |
| HTTP 5xx transient | Provider internal error | **Yes** — bounded | Same as 429 |
| `JSON.parse` throws | Truncated / malformed body | **No** | Dead-letter immediately; preserve document |
| Valid JSON, wrong schema | Off-schema / null fields | **No** | Dead-letter immediately; preserve document |

---

## The dead-letter is the recovery path, not the failure

When an invoice cannot be extracted, there are two possible outcomes:

1. **Null-fill and stamp "processed"** — the accounting UI shows `—` for every field, but the
   row has `status: "processed"`. Finance imports 47 blank entries. Nobody notices for nine days.

2. **Dead-letter** — the original document is preserved, along with the reason and error type.
   The accounting UI shows `—` (awaiting extraction). When someone fixes the root cause — a wider
   token budget, a corrected schema, a rate-limit that has cleared — the document can be
   re-processed from the dead-letter queue.

The dead-letter is not the failure. It is the **recovery**. Stamping null rows "processed" is
the bug because it impersonates a successful extraction and prevents recovery.

A dead-letter record must carry the **original document** — not just the reason and error type.
Without the original document, there is nothing to re-process.

---

## The three-bullet artifact (for your PR)

Write these before you touch code:

1. **What the system does.** The extractor accepts a raw document string, calls an LLM to
   classify eight fields, validates the response, and persists the result as an invoice record
   or a dead-letter entry.

2. **Where its state lives and the one path allowed to change it.** State lives in the in-memory
   `invoiceStore` and `deadLetterStore`. The only path that changes them is `extractInvoice()`.
   Tests observe state via `getInvoices()` and `getDeadLetters()` — never by reading
   `invoiceStore` directly.

3. **Where a success signal could lie — and what you would assert to catch it.** The function
   returns a non-null `InvoiceRecord` and sets `status: "processed"`. Both are true even when
   `amount` is null. A test that only checks those signals is fooled. The assertion that catches
   it: `getInvoices()[0].amount` is a positive number (read the effect back from the store, not
   from the return value).

<a id="access"></a>
## Who may call the extractor (access)

`extractInvoice` is called by the billing service worker — one call per uploaded document,
after the document passes a size and format check. No direct calls from HTTP handlers.
The `LLMClient` is injected so tests never hit the network.
