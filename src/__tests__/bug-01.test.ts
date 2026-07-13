import { describe, it, expect, beforeEach } from "vitest";
import { extractInvoice, getInvoices, resetExtractor } from "../extract";
import type { LLMClient } from "../extract";

// Bug 1 — no content validation: a truncated body writes null-filled fields.
//
// The LLM returns HTTP 200, so transport looks fine. But the body is cut off
// mid-response — the model hit its completion-token limit. JSON.parse throws.
// The error handler catches it and still writes a row stamped "processed" with
// every invoice field null.
//
// This test reads the amount back after extraction. A test that only checked the
// return value or the HTTP status would be fooled. Reading the persisted row back
// is the only way to catch a silent write.

const truncatedBody =
  '{"invoiceNumber":"INV-2026-001","vendor":"Mehta Spices Ltd","date":"2026-01-15","amount":';

const truncatedClient: LLMClient = async (_doc) => ({
  status: 200,
  body: truncatedBody, // JSON.parse will throw — body is incomplete
});

describe("Bug 1: a truncated LLM body must not write null-filled fields", () => {
  beforeEach(() => resetExtractor());

  it("does not store a row with amount null when the body is unparseable", async () => {
    await extractInvoice("invoice-text-001.txt", truncatedClient);

    const invoices = getInvoices();
    // The system must NOT write a record with null amount.
    // It should either dead-letter (getInvoices() is empty) or have stored a valid amount.
    if (invoices.length > 0) {
      expect(invoices[0]!.amount).not.toBeNull();
      expect(typeof invoices[0]!.amount).toBe("number");
    } else {
      // Correct fix path: dead-lettered, nothing in invoiceStore.
      expect(invoices).toHaveLength(0);
    }
  });

  it("does not stamp status 'processed' when the body could not be parsed", async () => {
    await extractInvoice("invoice-text-001.txt", truncatedClient);

    const invoices = getInvoices();
    // A null-filled row with status "processed" is the bug — it impersonates success.
    expect(
      invoices.some((r) => r.status === "processed" && r.amount === null)
    ).toBe(false);
  });
});
