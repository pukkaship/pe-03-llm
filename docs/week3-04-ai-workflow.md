# Module 3 AI workflow — First LLM classifier + transport vs content

Using AI as a *reviewed collaborator*, not an autopilot (~5 min).

## The one thing to remember

**An AI can turn a red test green. It is far weaker at noticing that a *green* test is lying —
because nothing points at it.**

That single asymmetry is the whole module. The assistant is fast and confident precisely where
you most need to slow down and check: the announced discovery bug is a green test hiding a broken system, and no
error message will send the model — or you — looking. Everything below follows from that.

## Why this module is different for AI use

Every module so far has had AI as a capable pair-programmer. This module is the first where the
thing you are building *is itself an AI call* — and that changes the relationship twice over.

First, the code under test calls a language model. The bugs are not in the model; they are in how
your code handles what the model returns. An AI assistant is fluent at making a model call
"work", which is exactly the instinct that produced the bugs in this repo: make it return
something, write it down, move on.

Second, you are using an AI assistant to fix code that handles an AI's output. It is easy to let
the assistant paper over a failure — coerce a null to zero, soften a schema check, widen a retry —
because that is the fastest path to green. Those are the precise moves this module is teaching you
to *refuse*.

So the frame for this module is sharper than usual: the AI is a fast, confident collaborator whose
default instincts (make it pass, make it not crash) point at the wrong fix. Your job is to use it
for understanding and to reject it for judgement. The sections below say where each line falls.

## The rule

You may ask AI what an error means, what a term means, and to review your reasoning. You may not
ask it to fix code you have not read. Every bug journal has an "AI use" section — you record what
the AI got right, what it missed, and where your own investigation went further.

## Why the discovery bug matters here

The announced discovery bug is where you out-investigate the model. The green test that lies (see the top of
this doc) has no error to hand the assistant — so the only way through is your own investigation:
read the effect back from the store, not the return value.

## The prompt is a reviewed asset

This module includes an LLM prompt. Treat it the way you treat a database schema — not as a dial
to turn until the output looks right.

When a bug produces null fields or a wrong schema, the temptation is to edit the prompt: add
"always return a number for amount", or "never return null". Do not. The bugs in this module are
in the **handling code** — the validation, retry, and dead-letter layer — not in the prompt. A
prompt change that suppresses a null does not fix the root cause; it shifts the failure mode
somewhere less visible. The design-review resilience constraint says it directly: no LLM response
reaches a write until it has passed content validation. That guard lives in code, not in the
prompt.

If you ask AI to improve the prompt to avoid the bugs, note it in your bug journal and explain
why you rejected it.

## What AI is good for here (and what it isn't)

| Use AI for | Not for |
|---|---|
| Explaining what `json.loads` raises and why | Fixing the parse-error handler for you |
| Describing what a dead-letter queue is | Writing the dead-letter path |
| Reviewing your hypothesis before you edit | Telling you which line is wrong |
| Checking your rewritten oracle reads back state | Writing the oracle |
| Explaining `Optional[str]` return type semantics | Completing `_is_usable()` |

The journal's "AI use" section is where you record: what you asked, what the model said, whether
it was right, and what it missed. At the weekly sync you explain each fix without the PR open.
Optimise for that conversation — not for the fastest path to green.
