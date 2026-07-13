# Bug 1 — a write that silently does nothing

Fill this in as you fix Bug 1. At least 80 words. Run `npm run unlock -- 1` when done.

**1.** What did the failing test (`bug-01.test.ts`) actually check that a return-value-only test
would have missed? Paste the assertion that caught the silent write.

```
[paste here]
```

**2.** Before your fix, the function returned a normal-looking result while nothing was stored.
In your own words, why is trusting a "success" signal (a returned value, a 2xx status) not the
same as proving the effect happened?

[your answer]

**3.** Name one place in a real production system where a success response could hide a silent
failure, and what you would assert to catch it.

[your answer]

**AI use (required for every bug):**

- Paste any prompt you gave your AI assistant.
- Could it have found this from the code alone, with no failing test? Why or why not?
