# Defense recording — Module 3

After your final PR merges, the platform will prompt you to record a short live defense. This is
the last step before the module credential is issued.

---

## What it is

A **3 to 5 minute** live recording where you walk through your own code and answer one question
the gate picks at submission time. You cannot pre-script it — the question is not revealed until
you submit the Loom URL.

---

## How to record

1. Go to [loom.com](https://loom.com) — the free tier is enough.
2. Record your screen with camera. Share your screen + show your face.
3. Walk through your fixes live: open the file, read the code, explain what it does and why.
4. Keep it between **3 and 5 minutes**. Under 3 minutes is too thin; over 5 minutes means you
   are reading rather than explaining.
5. Click **Share** → copy the share link (`loom.com/share/...`). That is the URL you submit.

---

## What the gate picks

When you submit the URL, the gate reveals two things:

**One bug to walk through** — the gate picks from your five fixed bugs. You are expected to:
- Open the file and read the relevant code live
- Explain what was broken, what you changed, and why the fix is correct
- Do NOT read from your PR description — speak from the code in front of you

**One fork question** — the gate picks from a bank of six questions. Examples of what you may
be asked:

- Your commit history: which commit first made your rewritten test_bug_03.py fail, and what did
  the pytest output say?
- Your prediction: where was your hypothesis.md right and where wrong?
- A design trade-off: given the resilience constraint, should a string amount be coerced or
  dead-lettered?
- Rejected AI: name one AI suggestion you rejected and explain what would have stayed broken.
- **Live perturbation (fq5):** the gate injects a fresh model client that may return a truncated
  body, a wrong-schema body, or a persistent 429. Before you run anything, say on camera what
  your code will do and how many model calls it will make — then run it and explain any gap.
- **State & correctness (fq6):** walk through where the system's state lives and the one path
  allowed to change it — the two stores, the single function that writes them, the two functions
  a test may observe them through — then show live one place a "success" signal is true while the
  state is not what it claims, and the assertion you wrote to catch it.

---

## What the gate checks mechanically

1. The URL is a valid `loom.com/share/...` or `loom.com/embed/...` link.
2. The recording is between 3 and 5 minutes.
3. The bug you walked through matches the bug the gate assigned.
4. The fork question you answered matches the question the gate assigned.

A transcript of your recording is scored by an AI judge on the `survive-failure` dimension.
A random sample of all defenses is reviewed by a human mentor.

---

## Tips

- Close distracting tabs before recording.
- Open your code before you hit record — no hunting for files on camera.
- For fq5, pause and speak your prediction out loud before running anything. The prediction is
  what is scored, not just the outcome.
- Speak to the code, not to the camera. Point at lines. Read them aloud.
