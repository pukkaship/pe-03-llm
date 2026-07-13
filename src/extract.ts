// @pukkaship-exercise
//
// LLM invoice extractor — inherited from a nearby team.
// Pulls eight structured fields out of an uploaded document via an LLM call.
// Has HTTP error guards. Has been "working" for three months at 400 documents/day.
//
// Five bugs are planted here. Fix them one at a time, in order.
// The test suite is fully offline — the LLMClient is injected and mocked in every test.

export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceRecord = {
  invoiceNumber: string;
  vendor: string;
  date: string;
  amount: number;
  lineItems: LineItem[];
  status: "processed" | "dead_lettered";
};

export type DeadLetter = {
  reason: string;
  errorType: "parse_error" | "schema_invalid" | "retries_exhausted";
  originalDocument: string;
  createdAt: string;
};

/** Injectable LLM client — swap a mock in tests so nothing hits the network. */
export type LLMClient = (
  document: string
) => Promise<{ status: number; body: string }>;

// ---------------------------------------------------------------------------
// In-memory stores — visible only inside this module via the getter functions.
// Call resetExtractor() in every beforeEach.
// ---------------------------------------------------------------------------

const invoiceStore: InvoiceRecord[] = [];
const deadLetterStore: DeadLetter[] = [];
let callCount = 0;

export function getInvoices(): readonly InvoiceRecord[] {
  return invoiceStore;
}

export function getDeadLetters(): readonly DeadLetter[] {
  return deadLetterStore;
}

/** How many times the LLM client was called in the last extractInvoice call. */
export function getLastCallCount(): number {
  return callCount;
}

export function resetExtractor(): void {
  invoiceStore.length = 0;
  deadLetterStore.length = 0;
  callCount = 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Decide whether a failure should be retried.
 *
 * Bug 2 (planted): returns "retryable" for schema-mismatch content failures —
 * these should be "non_retryable" because re-running the identical LLM call
 * against the same document will hit the same content limit every time.
 */
function classifyFailure(
  httpStatus: number,
  _reason: "parse_error" | "schema_invalid"
): "retryable" | "non_retryable" {
  if (httpStatus === 429 || httpStatus >= 500) return "retryable";
  // Bug 2: content failures (parse_error, schema_invalid) should return
  // "non_retryable" here — re-running the identical call re-triggers the same
  // limit. Fix: add a check on _reason and return "non_retryable" for content failures.
  return "retryable";
}

function recordDeadLetter(
  originalDocument: string,
  reason: string,
  errorType: DeadLetter["errorType"]
): void {
  deadLetterStore.push({
    reason,
    errorType,
    // Unannounced bug (planted): originalDocument and createdAt are dropped here.
    // A dead-letter without the original document cannot be re-processed after the
    // root cause is fixed. Fix: include originalDocument and createdAt.
  } as DeadLetter);
}

const BACKOFF_BASE_MS = 50;

function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bug 5 (planted): MAX_RETRIES is Infinity — the retry loop has no attempt cap.
// A persistent 429 or a recurring truncation (the real incident) retries forever.
// Fix: set MAX_RETRIES to a small finite number (e.g. 3).
const MAX_RETRIES = Infinity;

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extract structured invoice fields from a raw document using the injected LLM.
 *
 * Returns the stored InvoiceRecord on success, or null when the failure was
 * non-retryable and the document was dead-lettered.
 *
 * All writes go through the in-memory store — read back with getInvoices() /
 * getDeadLetters() in tests.
 */
export async function extractInvoice(
  document: string,
  client: LLMClient
): Promise<InvoiceRecord | null> {
  callCount = 0;
  let attempts = 0;

  while (attempts <= MAX_RETRIES) {
    callCount++;
    attempts++;

    const response = await client(document);

    // Transport guard: non-200 responses are transport-level failures.
    if (response.status !== 200) {
      const classification = classifyFailure(response.status, "parse_error");

      if (classification === "non_retryable") {
        recordDeadLetter(document, `http_${response.status}`, "retries_exhausted");
        return null;
      }

      // Retryable transport failure (e.g. 429 rate limit).
      if (attempts > MAX_RETRIES) {
        // Bug 4 (planted): after exhausting transport retries, the function
        // returns null without recording the original document. Any re-processing
        // attempt after the rate-limit clears has nothing to work with.
        // Fix: call recordDeadLetter here before returning null.
        return null;
      }

      await sleep(backoffMs(attempts));
      continue;
    }

    // Content guard — parse the body.
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(response.body) as Record<string, unknown>;
    } catch {
      // Bug 1 (planted): a truncated / unparseable body makes JSON.parse throw.
      // The catch block swallows the error and writes a null-filled row stamped
      // "processed" — exactly the ₹8.4M incident. Transport was fine (200 OK);
      // the content was garbage.
      //
      // Fix: dead-letter the document here instead of writing a null-filled row.
      //   recordDeadLetter(document, "body did not parse as JSON", "parse_error");
      //   return null;
      const record: InvoiceRecord = {
        invoiceNumber: null as unknown as string,
        vendor: null as unknown as string,
        date: null as unknown as string,
        amount: null as unknown as number,
        lineItems: [],
        status: "processed",
      };
      invoiceStore.push(record);
      return record;
    }

    // Schema check — verify all required fields are present and have the right types.
    // (A content failure after a successful parse is non-retryable — the identical
    // call will return the same shape every time.)
    const schemaError = validateSchema(parsed);
    if (schemaError) {
      const classification = classifyFailure(200, "schema_invalid");

      if (classification === "non_retryable") {
        recordDeadLetter(document, schemaError, "schema_invalid");
        return null;
      }

      // Bug 2 (triggered here): classifyFailure returns "retryable" for schema
      // failures, so the loop retries — hitting the same content limit each time.
      if (attempts > MAX_RETRIES) {
        recordDeadLetter(document, schemaError, "schema_invalid");
        return null;
      }

      await sleep(backoffMs(attempts));
      continue;
    }

    // All guards passed — write the record.
    const record: InvoiceRecord = {
      invoiceNumber: parsed.invoiceNumber as string,
      vendor: parsed.vendor as string,
      date: parsed.date as string,
      amount: parsed.amount as number,
      lineItems: (parsed.lineItems as LineItem[]) ?? [],
      status: "processed",
    };
    invoiceStore.push(record);
    return record;
  }

  return null;
}

/**
 * Returns an error message if any required field is absent or has the wrong type.
 * Returns null when the schema is valid.
 *
 * Note: does NOT check for null values inside present fields — a field can be
 * present but null and still pass this check. That gap is Bug 3 (discovery).
 */
function validateSchema(parsed: Record<string, unknown>): string | null {
  const required: Array<[string, string]> = [
    ["invoiceNumber", "string"],
    ["vendor", "string"],
    ["date", "string"],
    ["amount", "number"],
    ["lineItems", "object"],
  ];

  for (const [field, _type] of required) {
    if (!(field in parsed)) {
      return `required field '${field}' is missing`;
    }
    // Bug 3 (discovery gap): does not check typeof parsed[field] — a null value
    // for 'amount' passes this check. The delivered bug-03.test.ts will be green
    // because the record is written with status "processed" even when amount is null.
  }

  return null;
}
