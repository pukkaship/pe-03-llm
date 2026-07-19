# Module 3 glossary

Key terms for this module. Read before the entry quiz.

---

**Transport success**
An HTTP response with a 2xx status code, or an SDK call that completed without throwing a
network error. Proves bytes arrived. Says nothing about whether the body is parseable, complete,
or matches the expected schema.

**Content success**
The response body is valid JSON, matches the expected schema, and every required field has a
usable value. A content check must be separate from the transport check — the two can disagree.

**Non-determinism**
An LLM call with the same prompt and the same document can return a different body on each call.
This matters for retry semantics: a retry that repairs a dropped database connection is safe
because the query is deterministic. A retry that re-runs an LLM call against the same document
that caused a token-limit truncation will re-trigger the same truncation — the call is not
idempotent in the same way.

**Dead-letter**
A record that preserves a document (or message) that could not be processed, along with the
failure reason and error type. A dead-letter is not the final state — it is the **recovery path**:
once the root cause is fixed, the original document can be re-processed. A dead-letter record
without the original document body cannot be re-processed.

**Retryable failure**
A failure caused by an external condition that may change — a rate limit that clears, a
transient network hiccup. Retrying with a bounded attempt cap and exponential backoff is correct.

**Non-retryable failure**
A failure caused by the content of the call itself — a truncated body, a schema mismatch, an
off-schema field. Re-running the identical call against the same document re-triggers the same
failure. Dead-lettering immediately (0 retries) is correct.

**Attempt cap**
The maximum number of times a retryable call is re-tried before the system gives up and
dead-letters. Without an attempt cap, a persistent failure triggers an infinite retry loop.

**Exponential backoff**
A retry-timing policy that increases the wait between attempts geometrically — for example 1s,
then 2s, then 4s, doubling each time. Retrying instantly re-trips the same rate limit and adds
load to a provider that is already struggling; backing off gives the external condition time to
clear. It applies only to retryable failures and is still bounded by the attempt cap.

**Jitter**
A small random offset added to each backoff delay so that many clients retrying at once do not
all wake at the same instant. Without jitter, a fleet of clients retries in lockstep and
stampedes the recovering provider back down (the "thundering herd").

**Null-fill / coerce-and-write**
Writing a record with null (or zero, or empty string) values for fields that could not be
extracted, and marking the record "processed". This is the bug: it impersonates a successful
extraction and prevents recovery — the accounting system imports blank entries and has no
auditable trace that the extraction failed.

<a id="silent-failure"></a>
**Silent failure**
A failure that produces no error, no exception, and no visible signal — the system returns a
"success" status and continues. The only way to detect it is to read the actual effect back
(check the database row, not the function return value).

<a id="side-effect"></a>
**Side effect**
A change to state that persists beyond the function call — a database write, a dead-letter
entry, a queue message. Tests that only check the function's return value miss side-effect bugs.
Always read the effect back from the store after the call.
