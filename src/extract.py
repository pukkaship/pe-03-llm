# @pukkaship-exercise
"""Invoice extractor — transport vs content failure.

This module is the focus of Module 3. It calls an LLM to extract eight
structured fields from a raw invoice document, then routes the response
to either the invoice store or the dead-letter store.

Five bugs are planted here. Bug 1 ships red (the test is already in tests/).
Bugs 2–5 arrive one at a time after each PR merge.

Do not read ahead. Work from the failing test in front of you.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import List, Optional, Protocol


# ── Domain types ────────────────────────────────────────────────────────

@dataclass
class InvoiceRecord:
    id: str
    vendor_name: Optional[str]
    invoice_number: Optional[str]
    date: Optional[str]
    amount: Optional[float]
    currency: Optional[str]
    tax_rate: Optional[float]
    line_items: Optional[list]
    bank_details: Optional[str]
    status: str = "processed"


@dataclass
class DeadLetterRecord:
    original_document: str
    reason: str
    error_type: str   # "parse_error" | "schema_invalid" | "retries_exhausted"
    created_at: float = field(default_factory=time.time)


class TransportError(Exception):
    """Raised by a ModelClient when the LLM call fails at the transport layer."""

    def __init__(self, message: str, error_type: str) -> None:
        super().__init__(message)
        self.error_type = error_type  # "transport_429" | "transport_5xx"


class ModelClient(Protocol):
    """Protocol for an injected LLM client. Tests provide a fake implementation."""

    def complete(self, prompt: str, document: str) -> str: ...

    def get_call_count(self) -> int: ...


# ── In-memory store ─────────────────────────────────────────────────────

_invoice_store: List[InvoiceRecord] = []
_dead_letter_store: List[DeadLetterRecord] = []
_next_id: List[int] = [1]


def get_invoices() -> List[InvoiceRecord]:
    return list(_invoice_store)


def get_dead_letters() -> List[DeadLetterRecord]:
    return list(_dead_letter_store)


def reset_store() -> None:
    _invoice_store.clear()
    _dead_letter_store.clear()
    _next_id[0] = 1


# ── Retry config ─────────────────────────────────────────────────────────

MAX_RETRIES = 3
_BACKOFF_BASE = 0.001   # tiny so unit tests don't wait


# ── Failure classifier ────────────────────────────────────────────────────

def _classify_failure(error_type: str) -> str:
    """Return 'retryable' or 'non_retryable' for the given error_type.

    Bug 2: content failures (parse_error, schema_invalid) are incorrectly
    classified as 'retryable'. The fix is to return 'non_retryable' for
    both — re-running the identical call against the same document re-triggers
    the same content failure every time.
    """
    if error_type in ("transport_429", "transport_5xx"):
        return "retryable"
    return "retryable"  # Bug 2: should be "non_retryable"


# ── Schema check ──────────────────────────────────────────────────────────

_REQUIRED_FIELDS = ["vendor_name", "invoice_number", "amount"]


def _is_usable(parsed: dict) -> Optional[str]:
    """Return an error string if parsed is not usable for writing; None otherwise.

    Bug 3 (discovery): only checks that required keys are present in the dict —
    it does not check that 'amount' has a non-null numeric value. A response like
    {"vendor_name": "Tata", "invoice_number": "INV-001", "amount": null} passes
    this check and is written as a 'processed' row with amount=None.
    Fix: add `or parsed[f] is None` to the guard.
    """
    for f in _REQUIRED_FIELDS:
        if f not in parsed:
            return f"required field '{f}' is missing"
    return None   # Bug 3: should also check parsed["amount"] is not None


# ── Main extractor ────────────────────────────────────────────────────────

_EXTRACTION_PROMPT = (
    "Extract the following fields from the invoice as JSON: "
    "vendor_name (string), invoice_number (string), date (string), "
    "amount (number), currency (string), tax_rate (number), "
    "line_items (list of strings), bank_details (string)."
)


def extract_invoice(
    document: str, model_client: ModelClient
) -> Optional[InvoiceRecord]:
    """Extract structured fields from a raw invoice document.

    Calls model_client.complete(), validates the response body, and
    appends either an InvoiceRecord to _invoice_store or a
    DeadLetterRecord to _dead_letter_store.

    Bug 1: a JSON parse failure is swallowed in the except block —
        a null-filled InvoiceRecord is written with status='processed'
        instead of dead-lettering the document. Fix: dead-letter on any
        parse failure and never write an InvoiceRecord until the body
        is confirmed usable.

    Bug 4: when transport retries are exhausted the function returns None
        without writing a DeadLetterRecord. The document is silently
        discarded with no auditable trace. Fix: write a DeadLetterRecord
        with error_type='retries_exhausted' before returning None.

    Bug 5 (discovery): the transport-retry loop has no attempt cap — with
        a persistent 429 it will loop until the process is killed. The
        green test delivered with this bug only exercises the transient case
        (one 429, then success), so it never reaches the missing cap.
        Fix: bound the loop with MAX_RETRIES and dead-letter on exhaustion.
    """
    transport_attempts = 0

    while True:  # Bug 5: should be `while transport_attempts < MAX_RETRIES + 1:`

        # ── Transport call ────────────────────────────────────────────────
        try:
            body = model_client.complete(_EXTRACTION_PROMPT, document)
        except TransportError as exc:
            classification = _classify_failure(exc.error_type)
            if classification == "retryable":
                transport_attempts += 1
                if transport_attempts > MAX_RETRIES:
                    # Bug 4: return None without writing a DeadLetterRecord.
                    # Fix: append a DeadLetterRecord with original_document=document
                    # and error_type="retries_exhausted" before returning None.
                    return None
                time.sleep(_BACKOFF_BASE * transport_attempts)
                continue
            # Non-retryable transport error → dead-letter immediately
            _dead_letter_store.append(
                DeadLetterRecord(
                    original_document=document,
                    reason=str(exc),
                    error_type=exc.error_type,
                )
            )
            return None

        # ── Parse ─────────────────────────────────────────────────────────
        try:
            parsed: dict = json.loads(body)
        except Exception:
            # Bug 1: swallows the parse error and writes a null-filled row.
            # Fix: dead-letter the document here instead of writing a record.
            record = InvoiceRecord(
                id=str(_next_id[0]),
                vendor_name=None,
                invoice_number=None,
                date=None,
                amount=None,
                currency=None,
                tax_rate=None,
                line_items=None,
                bank_details=None,
            )
            _next_id[0] += 1
            _invoice_store.append(record)
            return record

        # ── Schema check ──────────────────────────────────────────────────
        schema_error = _is_usable(parsed)
        if schema_error is not None:
            classification = _classify_failure("schema_invalid")
            if classification == "retryable":
                # Bug 2: content failures reach this branch; the call is re-run
                # against the same document and re-triggers the same failure.
                transport_attempts += 1
                time.sleep(_BACKOFF_BASE * transport_attempts)
                continue
            _dead_letter_store.append(
                DeadLetterRecord(
                    original_document=document,
                    reason=schema_error,
                    error_type="schema_invalid",
                )
            )
            return None

        # ── Write ─────────────────────────────────────────────────────────
        record = InvoiceRecord(
            id=str(_next_id[0]),
            vendor_name=parsed.get("vendor_name"),
            invoice_number=parsed.get("invoice_number"),
            date=parsed.get("date"),
            amount=parsed.get("amount"),
            currency=parsed.get("currency"),
            tax_rate=parsed.get("tax_rate"),
            line_items=parsed.get("line_items"),
            bank_details=parsed.get("bank_details"),
        )
        _next_id[0] += 1
        _invoice_store.append(record)
        return record
