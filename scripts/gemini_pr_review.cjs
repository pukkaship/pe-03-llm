#!/usr/bin/env node
// Best-effort AI PR reviewer for Module 3. Milestone-aware: matches validate_pr.cjs
// incremental gate-bot flow. Reads PR body + bug journals through current milestone +
// ai-session-log when present. Never blocks merge.
//
// No-ops cleanly if GEMINI_API_KEY is missing (e.g. on forks). The enforced gate is CI.

const fs = require("node:fs");
const { execSync } = require("node:child_process");

const apiKey = process.env.GEMINI_API_KEY;
const prBody = process.env.PR_BODY || "";
const prNumber = process.env.PR_NUMBER;
const repo = process.env.REPO;

if (!apiKey) {
  console.log("GEMINI_API_KEY not set \u2014 skipping AI review (this is fine).");
  process.exit(0);
}

function highestUnlockedBug() {
  let n = 0;
  for (let i = 1; i <= 5; i++) {
    if (fs.existsSync(`tests/test_bug_0${i}.py`)) n = i;
  }
  return n;
}

function readOptional(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function buildArtifactsSection(currentBug) {
  const parts = [];
  for (let i = 1; i <= currentBug; i++) {
    const rel = `bug-journal/bug-0${i}.md`;
    const content = readOptional(rel);
    parts.push(`--- ${rel} ---\n${content || "(missing)"}`);
  }
  const aiLog = readOptional("ai-session-log.md");
  if (aiLog) parts.push(`--- ai-session-log.md ---\n${aiLog}`);
  if (currentBug >= 5) {
    for (const file of ["REFLECTION.md", "SKILL-STATEMENT.md"]) {
      const content = readOptional(file);
      if (content) parts.push(`--- ${file} ---\n${content}`);
    }
  }
  return parts.length ? parts.join("\n\n") : "(no artifact files found in checkout)";
}

function buildMilestoneContext(currentBug) {
  const lines = [
    "## Milestone scope (read this first)",
    "",
    "Learners ship **one bug per PR**; the gate bot delivers the next test after each merge.",
    `**This checkout's milestone: Bug ${currentBug} of 5** (inferred from highest test_bug_0N.py present).`,
    "",
    `Apply the rubric **only to bugs 1 through ${currentBug}**. Do NOT penalize missing work on later bugs.`,
  ];
  if (currentBug < 5) {
    lines.push("- REFLECTION.md, SKILL-STATEMENT.md, and full capstone Discovery narrative: **not required yet**.");
    lines.push("- ai-session-log.md: optional/in-progress; judge entries for bugs completed so far if present.");
  }
  if (currentBug < 3) {
    lines.push("- Bug 3 discovery criteria: **out of scope** \u2014 skip.");
  }
  if (currentBug < 5) {
    lines.push("- Bug 5 discovery criteria: **out of scope** \u2014 skip.");
  }
  lines.push("");
  lines.push(`Verdict READY if in-scope criteria pass; NEEDS CHANGES only for gaps in bugs 1\u2013${currentBug}.`);
  return lines.join("\n");
}

const currentBug = highestUnlockedBug();
if (currentBug === 0) {
  console.log("No bug tests found \u2014 skipping AI review.");
  process.exit(0);
}

console.log(`\u2139 AI review for milestone Bug ${currentBug} of 5`);

const rules = fs.existsSync(".github/gemini-review-rules.md")
  ? fs.readFileSync(".github/gemini-review-rules.md", "utf8")
  : "Review this Module 3 PR for whether it explains WHY each fix was necessary.";

const prompt = [
  rules,
  buildMilestoneContext(currentBug),
  "--- PULL REQUEST DESCRIPTION ---",
  prBody || "(empty)",
  "--- REPO ARTIFACTS (from checkout; may supplement the PR description) ---",
  buildArtifactsSection(currentBug),
  "--- END ---",
  "",
  'Respond with a verdict line "VERDICT: READY" or "VERDICT: NEEDS CHANGES", then specific feedback on in-scope items only.',
].join("\n\n");

async function main() {
  const model = "gemini-3-flash-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) {
    console.log(`Gemini call failed (${res.status}) \u2014 skipping.`);
    return;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "AI review produced no text.";
  const comment =
    `### \uD83E\uDD16 AI PR review (advisory \u2014 not a merge gate)\n\n` +
    `_Milestone Bug ${currentBug} of 5_\n\n${text}`;

  if (prNumber && repo && process.env.GH_TOKEN) {
    fs.writeFileSync("/tmp/ai-review.md", comment);
    try {
      execSync(`gh pr comment ${prNumber} --repo ${repo} --body-file /tmp/ai-review.md`, { stdio: "inherit" });
    } catch {
      console.log("Could not post comment; printing instead:\n" + comment);
    }
  } else {
    console.log(comment);
  }
}

main().catch((e) => {
  console.log("AI review error (non-blocking): " + e.message);
});
