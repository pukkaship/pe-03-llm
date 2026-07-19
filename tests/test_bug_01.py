"""Bug 1 — a parse failure must not reach the invoice store.

This is the only test active when you clone the repo. It fails.
Read it carefully, then read extract_invoice() in src/extract.py.

The function calls an LLM and tries to parse the response as JSON.
When parsing fails — because the model hit its token limit mid-response
and the body is truncated — the current code swallows the exception and
writes a null-filled InvoiceRecord with status='processed'.

This test does the one thing that catches a silent failure: it calls
extract_invoice() with a client that returns a broken body, then reads
the invoice store back. A test that only checked the return value would
be fooled — the function returns a record. The store read catches it.
"""

import json
import pytest

from src.extract import extract_invoice, get_invoices, reset_store, TransportError


class _TruncatedClient:
    """Returns a body that ends mid-JSON — simulating a completion-token truncation."""

    def __init__(self) -> None:
        self._calls = 0

    def complete(self, prompt: str, document: str) -> str:
        self._calls += 1
        return '{"vendor_name": "Tata Motors", "invoice_number": "INV-001", "amount":'  # truncated

    def get_call_count(self) -> int:
        return self._calls


@pytest.fixture(autouse=True)
def _clean() -> None:
    reset_store()


def test_truncated_body_does_not_produce_processed_row() -> None:
    """Bug 1: a truncated body must never be written as a 'processed' invoice."""
    client = _TruncatedClient()
    extract_invoice("raw invoice document", client)

    invoices = get_invoices()
    assert len(invoices) == 0, (
        f"Expected 0 invoices after a parse failure, got {len(invoices)}. "
        "A truncated body should be dead-lettered, not stamped 'processed'."
    )
