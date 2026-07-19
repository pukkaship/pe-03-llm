# Reflection — the one idea

Fill this in after you have fixed all five bugs. CI checks it is at least 30 words.

## An LLM call is a non-deterministic, unreliable network call — transport success (200 OK) is not content success; a well-formed HTTP response can still carry an unusable body.

Restate this in your own words. Name the silent-failure shape the five bugs share: the system
responds as if it succeeded while the evidence — a null field, a dropped document, a wrong
classification — is quietly written somewhere nobody checks.

## Connect the bugs (write 1–2 paragraphs)

Explain how the five bugs are views of the same failure: a system that *appears* to succeed while
doing (or protecting) nothing. What general rule ties them together? How do the two discovery
bugs (3 and 5) show that a success signal is not proof?

[your reflection here]
