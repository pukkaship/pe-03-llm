# Module 3 AI workflow — First LLM classifier + transport vs content

Using AI as a *reviewed collaborator*, not an autopilot (~5 min).

## The rule

You may ask AI what an error means, what a term means, and to review your reasoning. You may not
ask it to fix code you have not read. Every bug journal has an "AI use" section — you record what
the AI got right, what it missed, and where your own investigation went further.

## Why the discovery bugs matter here

An AI can turn a red test green. It is far weaker at noticing that a *green* test is lying —
because nothing points at it. Bugs 3 and 5 are where you out-investigate the model.

> TODO(scaffold): tailor this to the module (e.g. formalizing intake; treating a prompt as a
> reviewed asset). Keep the "reviewed collaborator" frame.
