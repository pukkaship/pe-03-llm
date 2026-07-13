#!/usr/bin/env node
/**
 * Shared gate logic for learner repos. Thin wrappers in scripts/{begin,unlock,validate_pr}.cjs
 * load gates.json and delegate here.
 */

const { execSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * @param {string} gatesPath
 * @returns {object}
 */
function loadGates(gatesPath) {
  if (!fs.existsSync(gatesPath)) {
    const err = new Error(`gates.json not found at ${gatesPath}`);
    err.code = "GATES_MISSING";
    throw err;
  }
  return JSON.parse(fs.readFileSync(gatesPath, "utf8"));
}

function fail(messages, prefix) {
  console.error(`\n\u274c ${prefix}:\n`);
  for (const m of messages) console.error("  \u2022 " + m);
  console.error("");
  process.exit(1);
}

function wordCountText(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function wordCountFile(filePath) {
  return wordCountText(fs.readFileSync(filePath, "utf8"));
}

/**
 * @param {string} cwd
 * @param {object} gates
 */
function runBegin({ cwd, gates }) {
  const prev = process.cwd();
  try {
    process.chdir(cwd);
    const hypothesisPath = "hypothesis.md";
    if (!fs.existsSync(hypothesisPath)) {
      fail(["hypothesis.md is missing. Fill in the template before you begin."], "Not ready to start");
    }

    const hypothesis = fs.readFileSync(hypothesisPath, "utf8").trim();
    const count = wordCountText(hypothesis);
    const failures = [];
    const minWords = gates.begin?.minWords ?? 100;

    if (count < minWords) {
      failures.push(`hypothesis.md has ${count} words \u2014 needs at least ${minWords}`);
    }

    for (const pattern of gates.begin?.mustMatch ?? []) {
      const re = new RegExp(pattern, "i");
      if (!re.test(hypothesis)) {
        if (pattern === "hypothesis|error") {
          failures.push(
            'hypothesis.md must mention "hypothesis" or "error" (shows you read the module material)'
          );
        } else if (pattern === "the rule is") {
          failures.push(
            'hypothesis.md must contain "the rule is" \u2014 finish the sentence from the orientation video'
          );
        } else {
          failures.push(`hypothesis.md must match /${pattern}/i`);
        }
      }
    }

    if (failures.length > 0) {
      fail(failures, "Not ready to start");
    }

    const msg = gates.begin?.successMessage ?? "Ready. Now run: npm test \u2014 one test is failing. Start there.";
    console.log(`\n\u2713 ${msg}\n`);
    return { ok: true };
  } finally {
    process.chdir(prev);
  }
}

/**
 * @param {string} cwd
 * @param {object} gates
 * @param {number} bugNumber
 */
function runUnlock({ cwd, gates, bugNumber }) {
  const prev = process.cwd();
  try {
    process.chdir(cwd);

    try {
      execSync("npx vitest run", { stdio: "inherit" });
    } catch {
      console.error("\n\u274c Tests are not passing. Fix the current bug before unlocking the next.\n");
      process.exit(1);
    }

    const journalPath = path.join("bug-journal", `bug-0${bugNumber}.md`);
    if (!fs.existsSync(journalPath)) {
      console.error(`\n\u274c ${journalPath} is missing. Fill in the journal before unlocking.\n`);
      process.exit(1);
    }

    const journal = fs.readFileSync(journalPath, "utf8");
    const count = wordCountText(journal);
    const minJournal = gates.minJournalWords ?? 80;
    const failures = [];

    if (count < minJournal) {
      failures.push(`bug-0${bugNumber}.md has ${count} words \u2014 needs at least ${minJournal}`);
    }

    const keywordPatterns = gates.unlockKeywords?.[String(bugNumber)] ?? gates.unlockKeywords?.[bugNumber] ?? [];
    keywordPatterns.forEach((pattern, i) => {
      const re = new RegExp(pattern, "i");
      if (!re.test(journal)) {
        failures.push(
          `bug-0${bugNumber}.md seems incomplete (check question ${i + 1} \u2014 your answer is missing key reasoning)`
        );
      }
    });

    if (failures.length > 0) {
      console.error("\n\u274c Journal not complete:\n");
      for (const f of failures) console.error("  \u2022 " + f);
      console.error("");
      process.exit(1);
    }

    if (bugNumber < 5) {
      const next = bugNumber + 1;
      console.log(`\n\u2713 Bug ${bugNumber} complete.\n`);
      console.log(`  Push your branch and open a PR \u2014 the gate bot will`);
      console.log(`  deliver Bug ${next}'s test file after you merge.\n`);
    } else {
      console.log("\n\u2713 All five bugs fixed. Before opening your PR:\n");
      console.log("  1. Fill in REFLECTION.md");
      console.log("  2. Fill in SKILL-STATEMENT.md");
      console.log("  3. Fill in ai-session-log.md (one entry per bug)");
      console.log("  4. Run: npm run validate\n");
    }

    return { ok: true };
  } finally {
    process.chdir(prev);
  }
}

/**
 * @param {object} rewrite
 * @param {string} content
 */
function discoveryRewritePasses(rewrite, content) {
  if (rewrite.anyOfGroups) {
    return rewrite.anyOfGroups.some((group) => {
      const combined = group.join("|");
      return new RegExp(combined, "i").test(content);
    });
  }
  if (rewrite.anyOf) {
    const patterns = Array.isArray(rewrite.anyOf) ? rewrite.anyOf : [rewrite.anyOf];
    return patterns.some((p) => new RegExp(p, "i").test(content));
  }
  if (rewrite.regex) {
    return new RegExp(rewrite.regex, "i").test(content);
  }
  return false;
}

function highestUnlockedBug(cwd) {
  let n = 0;
  for (let i = 1; i <= 5; i++) {
    if (fs.existsSync(path.join(cwd, "src", "__tests__", `bug-0${i}.test.ts`))) n = i;
  }
  return n;
}

function requireFile(cwd, failures, file, minWords, label) {
  const full = path.join(cwd, file);
  if (!fs.existsSync(full)) {
    failures.push(`${label} (${file}) is missing`);
    return;
  }
  if (minWords > 0 && wordCountFile(full) < minWords) {
    failures.push(`${label} (${file}) is too short \u2014 needs at least ${minWords} words`);
  }
}

/**
 * @param {string} cwd
 * @param {object} gates
 * @param {NodeJS.ProcessEnv} env
 */
function runValidate({ cwd, gates, env = process.env }) {
  const failures = [];
  const currentBug = highestUnlockedBug(cwd);

  if (currentBug === 0) {
    failures.push("No bug tests found in src/__tests__/ \u2014 start with Bug 1");
  } else {
    console.log(`\u2139 Validating milestone Bug ${currentBug} of 5 (incremental gate-bot flow)`);
  }

  const hypothesisMin = gates.begin?.minWords ?? 100;
  requireFile(cwd, failures, "hypothesis.md", hypothesisMin, "Pre-code hypothesis");

  const minJournal = gates.minJournalWords ?? 80;
  for (let i = 1; i <= currentBug; i++) {
    requireFile(cwd, failures, `bug-journal/bug-0${i}.md`, minJournal, `Bug ${i} journal`);
  }

  const capstone = gates.capstone ?? {};
  if (currentBug >= 5) {
    requireFile(cwd, failures, "REFLECTION.md", capstone.reflectionMinWords ?? 30, "REFLECTION.md");
    requireFile(cwd, failures, "SKILL-STATEMENT.md", 0, "SKILL-STATEMENT.md");
    const skillPath = path.join(cwd, "SKILL-STATEMENT.md");
    if (fs.existsSync(skillPath) && fs.readFileSync(skillPath, "utf8").trim().length < (capstone.skillStatementMinChars ?? 20)) {
      failures.push("SKILL-STATEMENT.md is essentially empty \u2014 fill it in");
    }
    const aiLogPath = "ai-session-log.md";
    const aiMin = capstone.aiSessionLogMinWords ?? 20;
    if (!fs.existsSync(path.join(cwd, aiLogPath))) {
      failures.push("ai-session-log.md is missing");
    } else {
      const aiWords = wordCountFile(path.join(cwd, aiLogPath));
      if (aiWords < aiMin) {
        failures.push(`ai-session-log.md has ${aiWords} words \u2014 needs \u2265 ${aiMin}`);
      }
    }
  }

  for (const check of gates.artifactChecks ?? []) {
    if (currentBug >= (check.whenBugAtLeast ?? 1)) {
      const filePath = path.join(cwd, check.file);
      if (fs.existsSync(filePath)) {
        if (!new RegExp(check.regex).test(fs.readFileSync(filePath, "utf8"))) {
          failures.push(check.failMessage);
        }
      }
    }
  }

  for (let i = 1; i <= currentBug; i++) {
    if (!fs.existsSync(path.join(cwd, "src", "__tests__", `bug-0${i}.test.ts`))) {
      failures.push(`src/__tests__/bug-0${i}.test.ts is missing`);
    }
  }

  const discoveryBugs = gates.discoveryBugs ?? [3, 5];
  for (const bugNum of discoveryBugs) {
    if (currentBug < bugNum) continue;
    const testRel = `src/__tests__/bug-0${bugNum}.test.ts`;
    const testPath = path.join(cwd, testRel);
    if (!fs.existsSync(testPath)) continue;
    const content = fs.readFileSync(testPath, "utf8");
    const rewrite = gates.discoveryRewrites?.[String(bugNum)] ?? gates.discoveryRewrites?.[bugNum];
    if (rewrite && !discoveryRewritePasses(rewrite, content)) {
      failures.push(rewrite.failMessage);
    }
  }

  const prBody =
    env.PR_BODY || (fs.existsSync(path.join(cwd, "PR_BODY.md")) ? fs.readFileSync(path.join(cwd, "PR_BODY.md"), "utf8") : "");

  if (prBody) {
    const always = gates.requiredPRSections?.always ?? ["Why each fix was necessary"];
    for (const section of always) {
      if (!new RegExp(section, "i").test(prBody)) {
        failures.push(`PR description must include a section titled "${section}"`);
      }
    }
    if (currentBug >= 5) {
      const atBug5 = gates.requiredPRSections?.atBug5 ?? ["Discovery"];
      for (const section of atBug5) {
        if (!new RegExp(section, "i").test(prBody)) {
          if (section === "Hypothesis") {
            failures.push(
              'PR description must include a "Hypothesis" section (what you thought was wrong before editing)'
            );
          } else if (section === "Discovery") {
            failures.push(
              'PR description must include a "Discovery" section (how you found the bugs nothing pointed you to \u2014 Bugs 3 and 5)'
            );
          } else {
            failures.push(`PR description must include a "${section}" section`);
          }
        }
      }
    }
  } else {
    console.log("\u2139 No PR body found (PR_BODY env or PR_BODY.md). Skipping PR-section check locally.");
  }

  if (failures.length > 0) {
    console.error("\n\u274c PR validation failed:\n");
    for (const f of failures) console.error("  \u2022 " + f);
    console.error("\nFix the above and push again.\n");
    return { ok: false, failures };
  }

  console.log(`\n\u2713 Milestone Bug ${currentBug} validation passed.\n`);
  return { ok: true, failures: [] };
}

/**
 * Discover the reference implementations in a slot dir.
 * A behaviourally gated bug needs exactly one `buggy*`, one `fixed*`, and ≥1 `mutant*`
 * file (curriculum-remediation-plan.md Principle 4 / Fix 2). Multiple mutants are allowed
 * (mutant.ts, mutant-2.ts, …) — the candidate test must fail against every one of them.
 *
 * @param {string} referenceRoot absolute path to platform/solutions/<module>/reference/<slot>
 * @returns {{ buggy: string|null, fixed: string|null, mutants: string[], errors: string[] }}
 */
function discoverReferenceImpls(referenceRoot) {
  const errors = [];
  if (!fs.existsSync(referenceRoot)) {
    return { buggy: null, fixed: null, mutants: [], errors: [`reference dir missing: ${referenceRoot}`] };
  }
  const files = fs.readdirSync(referenceRoot).filter((f) => !f.startsWith("."));
  const pick = (kind) => files.filter((f) => path.basename(f).startsWith(kind)).sort();
  const buggyList = pick("buggy");
  const fixedList = pick("fixed");
  const mutants = pick("mutant");

  if (buggyList.length === 0) errors.push(`no "buggy*" reference impl in ${referenceRoot}`);
  if (buggyList.length > 1) errors.push(`multiple "buggy*" impls in ${referenceRoot} — expected exactly one`);
  if (fixedList.length === 0) errors.push(`no "fixed*" reference impl in ${referenceRoot}`);
  if (fixedList.length > 1) errors.push(`multiple "fixed*" impls in ${referenceRoot} — expected exactly one`);
  if (mutants.length === 0) errors.push(`no "mutant*" reference impl in ${referenceRoot} — need ≥1 (a wrong fix that looks right)`);

  return {
    buggy: buggyList[0] ? path.join(referenceRoot, buggyList[0]) : null,
    fixed: fixedList[0] ? path.join(referenceRoot, fixedList[0]) : null,
    mutants: mutants.map((m) => path.join(referenceRoot, m)),
    errors,
  };
}

/**
 * Default test runner: swap `implFile` in for `targetModule` in the learner repo,
 * run the candidate discovery test, restore the original, return whether it passed.
 * Injectable — unit tests pass a stub so no vitest/TS toolchain is needed.
 *
 * @param {{ cwd:string, testFile:string, targetModule:string, implFile:string }} a
 * @returns {{ passed: boolean }}
 */
function defaultRunTest({ cwd, testFile, targetModule, implFile }) {
  const targetAbs = path.join(cwd, targetModule);
  const backup = fs.existsSync(targetAbs) ? fs.readFileSync(targetAbs) : null;
  try {
    fs.copyFileSync(implFile, targetAbs);
    execSync(`npx vitest run ${JSON.stringify(testFile)}`, { cwd, stdio: "ignore" });
    return { passed: true };
  } catch {
    return { passed: false };
  } finally {
    if (backup !== null) fs.writeFileSync(targetAbs, backup);
  }
}

/**
 * Behavioural discovery gate — remediation-plan Principle 4 / Fix 2.
 *
 * A rewritten discovery test is real evidence of understanding only if it behaves
 * correctly against three founder-authored reference implementations:
 *   1. `buggy*`  (the planted implementation)        → the test must FAIL
 *   2. `fixed*`  (the canonical fix)                  → the test must PASS
 *   3. `mutant*` (a wrong fix that looks right, ≥1)   → the test must FAIL
 *
 * Regexes remain a cheap pre-check for fast feedback elsewhere; they are never the
 * pass condition. This is (Principle 4: "no gate may use source-pattern matching as
 * its only evidence of understanding").
 *
 * @param {object} args
 * @param {string} args.cwd            learner repo root (the candidate test lives here)
 * @param {object} args.gate          one `behaviouralGates` entry:
 *        { targetModule: string, candidateTest: string }
 * @param {string} args.referenceRoot absolute path to the slot's reference impls
 * @param {(a:{cwd:string,testFile:string,targetModule:string,implFile:string})=>{passed:boolean}} [args.runTest]
 * @returns {{ ok:boolean, results:Array<{kind:string,implFile:string,passed:boolean,expectPass:boolean,ok:boolean}>, failures:string[] }}
 */
function runBehaviouralGate({ cwd, gate, referenceRoot, runTest = defaultRunTest }) {
  const failures = [];
  const results = [];

  if (!gate || !gate.targetModule || !gate.candidateTest) {
    return {
      ok: false,
      results,
      failures: ['behavioural gate config needs "targetModule" and "candidateTest"'],
    };
  }

  const testFile = gate.candidateTest;
  if (!fs.existsSync(path.join(cwd, testFile))) {
    return { ok: false, results, failures: [`candidate test missing: ${testFile}`] };
  }

  const { buggy, fixed, mutants, errors } = discoverReferenceImpls(referenceRoot);
  // Fail closed: a missing reference impl means the gate cannot prove anything.
  if (errors.length > 0) {
    return { ok: false, results, failures: errors };
  }

  const cases = [
    { kind: "buggy", implFile: buggy, expectPass: false },
    { kind: "fixed", implFile: fixed, expectPass: true },
    ...mutants.map((m) => ({ kind: `mutant:${path.basename(m)}`, implFile: m, expectPass: false })),
  ];

  for (const c of cases) {
    const { passed } = runTest({ cwd, testFile, targetModule: gate.targetModule, implFile: c.implFile });
    const ok = passed === c.expectPass;
    results.push({ kind: c.kind, implFile: c.implFile, passed, expectPass: c.expectPass, ok });
    if (!ok) {
      if (c.kind === "buggy") {
        failures.push(
          `${testFile} PASSES against the planted buggy impl — it does not catch the bug it claims to prove. A rewritten discovery test must fail against the bug.`
        );
      } else if (c.kind === "fixed") {
        failures.push(
          `${testFile} FAILS against the canonical fix — it rejects correct code. The test must pass once the bug is genuinely fixed.`
        );
      } else {
        failures.push(
          `${testFile} PASSES against ${c.kind} — a wrong fix that looks right slips through the gate. Strengthen the assertion so it distinguishes the real fix from this mutant.`
        );
      }
    }
  }

  return { ok: failures.length === 0, results, failures };
}

// ---- Loom defense gate (remediation-plan Principles 5 + 6) ----

/**
 * Validate a module's defense-gate config: duration bounds + fork-question bank.
 * Fail-closed — a malformed bank must never be able to gate a real defense, so any
 * structural problem is an error, not a warning.
 *
 * @param {object} defense  the `gates.defense` block
 * @returns {string[]} errors (empty array = valid)
 */
function validateDefenseConfig(defense) {
  if (!defense || typeof defense !== "object") {
    return ['gates.json has no "defense" block (Principles 5+6 — Loom defense gate)'];
  }
  const errors = [];
  const { durationSecMin: min, durationSecMax: max } = defense;
  if (!Number.isFinite(min) || min <= 0) {
    errors.push("defense.durationSecMin must be a positive number of seconds");
  }
  if (!Number.isFinite(max) || max <= 0) {
    errors.push("defense.durationSecMax must be a positive number of seconds");
  }
  if (Number.isFinite(min) && Number.isFinite(max) && min >= max) {
    errors.push("defense.durationSecMin must be less than defense.durationSecMax");
  }

  const bank = Array.isArray(defense.forkQuestions) ? defense.forkQuestions : [];
  if (bank.length < 3) {
    errors.push(
      `defense.forkQuestions needs \u22653 questions for the server to pick from (Principle 6); found ${bank.length}`
    );
  }
  const seen = new Set();
  for (const q of bank) {
    if (!q || typeof q.id !== "string" || q.id.length === 0) {
      errors.push('every defense fork question needs a non-empty string "id"');
      continue;
    }
    if (seen.has(q.id)) errors.push(`duplicate fork question id: ${q.id}`);
    seen.add(q.id);
    if (typeof q.prompt !== "string" || q.prompt.trim().length === 0) {
      errors.push(`fork question ${q.id} has no prompt text`);
    }
  }
  return errors;
}

/**
 * Deterministic, uniform-ish index in [0, modulo) derived from a seed string.
 * SHA-256 so the pick is reproducible (the gate-worker can recompute/audit it) yet
 * unguessable before the seed's PR component exists.
 */
function seededIndex(seed, modulo) {
  if (modulo <= 0) return 0;
  const hash = crypto.createHash("sha256").update(String(seed)).digest();
  let n = 0;
  for (let i = 0; i < 6; i++) n = n * 256 + hash[i];
  return n % modulo;
}

/**
 * Server-side pick of the defense challenge: WHICH bug the student must walk through +
 * ONE fork question from the bank. Deterministic from `seed` so the gate-worker can
 * recompute and audit it, but unpredictable to the student until the seed's post-merge
 * component (the PR number) exists. Rotating the cohort component of the seed rotates the
 * pick per cohort (Principle 9 — last cohort's public PRs are not this cohort's script).
 *
 * @param {object} a
 * @param {object} a.defense    the `gates.defense` block
 * @param {number} a.bugCount   total bugs in the module (default candidate walk-through set)
 * @param {string} a.seed       opaque seed, e.g. `${learner}|${cohort}|${module}|${pr}`
 * @returns {{ bug:number, forkQuestion:{id:string,prompt:string} }}
 */
function pickDefenseChallenge({ defense, bugCount, seed }) {
  const errors = validateDefenseConfig(defense);
  if (errors.length > 0) {
    const err = new Error(
      `cannot pick defense challenge \u2014 invalid config:\n  - ${errors.join("\n  - ")}`
    );
    err.code = "DEFENSE_CONFIG_INVALID";
    throw err;
  }
  if (!Number.isInteger(bugCount) || bugCount < 1) {
    throw new Error(`pickDefenseChallenge needs a positive integer bugCount; got ${bugCount}`);
  }
  if (typeof seed !== "string" || seed.length === 0) {
    throw new Error("pickDefenseChallenge needs a non-empty seed string");
  }

  const candidates =
    Array.isArray(defense.candidateBugs) && defense.candidateBugs.length > 0
      ? defense.candidateBugs
      : Array.from({ length: bugCount }, (_, i) => i + 1);

  const bug = candidates[seededIndex(`${seed}|bug`, candidates.length)];
  const forkQuestion = defense.forkQuestions[seededIndex(`${seed}|fork`, defense.forkQuestions.length)];
  return { bug, forkQuestion };
}

/** True only for a syntactically valid https:// URL. */
function isHttpsUrl(s) {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Loom defense gate — MECHANICAL checks only (Principle 5: "the gate checks the mechanical
 * parts (URL present, duration in bounds)"). Content quality is scored by a judge model
 * with a human-audited sample (Principle 6) — that lives in the grading path, not here.
 *
 * Against the server-picked `challenge`, this verifies:
 *   1. a recording URL is present, a well-formed https URL, and matches the allowed host
 *   2. the recording duration is within the module's bounds
 *   3. the walked-through bug matches the bug the server picked (no pre-scripting one bug)
 *   4. the answered fork question matches the server's pick AND exists in the bank (plumbing)
 *
 * Fail-closed: a missing challenge, missing submission, or any missing field blocks it.
 *
 * @param {object} a
 * @param {object} a.defense     the `gates.defense` block (bounds + fork bank + url pattern)
 * @param {{ bug:number, forkQuestion:{id:string} }} a.challenge  the server pick
 * @param {{ recordingUrl?:string, durationSec?:number, walkedBug?:number, forkQuestionId?:string }} a.submission
 * @returns {{ ok:boolean, failures:string[], checks:Record<string,boolean> }}
 */
function runDefenseGate({ defense, challenge, submission }) {
  const failures = [];
  const checks = {};

  const configErrors = validateDefenseConfig(defense);
  if (configErrors.length > 0) return { ok: false, failures: configErrors, checks };

  if (
    !challenge ||
    typeof challenge.bug !== "number" ||
    !challenge.forkQuestion ||
    typeof challenge.forkQuestion.id !== "string"
  ) {
    return {
      ok: false,
      failures: ["defense gate has no valid server-picked challenge (bug + forkQuestion) \u2014 fail closed"],
      checks,
    };
  }
  if (!submission || typeof submission !== "object") {
    return {
      ok: false,
      failures: ["no defense submission \u2014 a Loom recording is required (fail closed)"],
      checks,
    };
  }

  // 1. Recording URL present + well-formed https + allowed host
  const url = submission.recordingUrl;
  const urlPattern = defense.recordingUrlPattern ?? "loom\\.com/(share|embed)/";
  if (!url || typeof url !== "string" || url.trim().length === 0) {
    checks.recordingUrl = false;
    failures.push("defense recording URL is missing");
  } else if (!isHttpsUrl(url)) {
    checks.recordingUrl = false;
    failures.push(`defense recording URL is not a valid https URL: ${url}`);
  } else if (!new RegExp(urlPattern, "i").test(url)) {
    checks.recordingUrl = false;
    failures.push(`defense recording URL does not match the allowed recording host (/${urlPattern}/)`);
  } else {
    checks.recordingUrl = true;
  }

  // 2. Duration in bounds
  const dur = submission.durationSec;
  if (!Number.isFinite(dur)) {
    checks.duration = false;
    failures.push("defense recording duration (durationSec) is missing or not a number");
  } else if (dur < defense.durationSecMin || dur > defense.durationSecMax) {
    checks.duration = false;
    failures.push(
      `defense recording is ${dur}s \u2014 out of bounds (${defense.durationSecMin}\u2013${defense.durationSecMax}s)`
    );
  } else {
    checks.duration = true;
  }

  // 3. Walked-through bug matches the server pick
  if (submission.walkedBug !== challenge.bug) {
    checks.bugMatch = false;
    failures.push(
      `defense walks through bug ${submission.walkedBug ?? "(none named)"}, but the server picked bug ${challenge.bug} \u2014 you cannot pre-script one rehearsed bug`
    );
  } else {
    checks.bugMatch = true;
  }

  // 4. Fork question answered matches the server pick AND exists in the bank
  const bankIds = new Set(defense.forkQuestions.map((q) => q.id));
  if (!bankIds.has(challenge.forkQuestion.id)) {
    checks.forkMatch = false;
    failures.push(
      `server-picked fork question "${challenge.forkQuestion.id}" is not in this module's fork bank \u2014 plumbing error, fail closed`
    );
  } else if (submission.forkQuestionId !== challenge.forkQuestion.id) {
    checks.forkMatch = false;
    failures.push(
      `defense answers fork question "${submission.forkQuestionId ?? "(none)"}", but the server picked "${challenge.forkQuestion.id}"`
    );
  } else {
    checks.forkMatch = true;
  }

  return { ok: failures.length === 0, failures, checks };
}

// ---- Adversarial red-team mode (remediation-plan Principle 9) ----
//
// Problem (case file §Problem 2): one LLM authoring both the rewritten discovery test and
// its mutant shares blind spots — it invents the mutant its own test conveniently catches.
// The credential is only as strong as its hardest mutant, so we bring in a CROSS-FAMILY
// adversary that gets ONLY the files a student receives (Principle 9 threat model) and tries
// to produce a "wrong fix that looks right" the candidate test still PASSES. If it can, the
// gate is too weak (RED). Every wrong fix it finds that the test DOES catch is frozen as a
// permanent reference fixture so the gate is hardened against it forever.

/**
 * Model routing baked into the pipeline (case file §Scope 3 / 6):
 *   - Sonnet DRIVES the attack loop (this engine, deterministic).
 *   - Opus is the CROSS-FAMILY attacker that authors/reviews buggy/fixed/mutant triads and
 *     proposes surviving mutants — a different family from whatever authored the gate.
 *   - Fable optionally critiques scenario/quiz prose (not used by this engine).
 */
const RED_TEAM_MODEL_ROUTING = Object.freeze({
  driver: "sonnet",
  attacker: "opus",
  proseCritic: "fable",
});

/** File extension (no dot) of a path; defaults to "ts". */
function extOf(file) {
  const e = path.extname(file);
  return e ? e.slice(1) : "ts";
}

/**
 * Gather ONLY the files a student receives (Principle 9): the delivered discovery test (which
 * carries its banner), the buggy implementation under test, and — when configured — the journal
 * template and/or a separate banner file. Reads exclusively from the learner repo (`cwd`) via a
 * WHITELIST, so the attacker structurally cannot see the founder's `fixed`/`mutant` reference
 * impls (those live only under referenceRoot) or any stray solution file in the repo.
 *
 * @param {{ cwd:string, gate:object }} a
 * @param {object} a.gate  a behaviouralGates entry: { targetModule, candidateTest, journalTemplate?, bannerFile? }
 * @returns {{ files: Record<string,string>, missing: string[] }}
 */
function collectDeliveredFiles({ cwd, gate }) {
  const files = {};
  const missing = [];
  const whitelist = [
    { rel: gate.candidateTest, required: true },
    { rel: gate.targetModule, required: true },
    { rel: gate.journalTemplate, required: false },
    { rel: gate.bannerFile, required: false },
  ];
  for (const { rel, required } of whitelist) {
    if (!rel) continue;
    const abs = path.join(cwd, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      files[rel] = fs.readFileSync(abs, "utf8");
    } else if (required) {
      missing.push(rel);
    }
  }
  return { files, missing };
}

/**
 * Next free `mutant*` filename in a slot's reference dir. The seed mutant is `mutant.<ext>`;
 * frozen adversarial mutants are `mutant-2.<ext>`, `mutant-3.<ext>`, … so `discoverReferenceImpls`
 * (which globs `mutant*`) picks all of them up.
 */
function nextMutantPath(referenceRoot, ext) {
  const existing = fs.existsSync(referenceRoot)
    ? fs.readdirSync(referenceRoot).filter((f) => path.basename(f).startsWith("mutant"))
    : [];
  if (existing.length === 0) return path.join(referenceRoot, `mutant.${ext}`);
  let n = 2;
  while (fs.existsSync(path.join(referenceRoot, `mutant-${n}.${ext}`))) n++;
  return path.join(referenceRoot, `mutant-${n}.${ext}`);
}

/**
 * Freeze a caught mutant as a permanent reference fixture (case file §Scope 3: "FREEZE that
 * mutant as a new reference fixture so the gate is permanently hardened against it"). Dedupes
 * on exact content so re-runs don't pile up identical mutants. Injectable — unit tests pass a
 * recording stub so nothing touches the committed fixtures.
 *
 * @param {{ referenceRoot:string, source:string, ext?:string }} a
 * @returns {{ path: string|null, deduped: boolean }}
 */
function defaultFreezeMutant({ referenceRoot, source, ext = "ts" }) {
  fs.mkdirSync(referenceRoot, { recursive: true });
  const existing = fs.readdirSync(referenceRoot).filter((f) => path.basename(f).startsWith("mutant"));
  for (const f of existing) {
    if (fs.readFileSync(path.join(referenceRoot, f), "utf8") === source) {
      return { path: null, deduped: true };
    }
  }
  const target = nextMutantPath(referenceRoot, ext);
  fs.writeFileSync(target, source);
  return { path: target, deduped: false };
}

/**
 * Build the real red-team attacker around ONE injected model call (Opus, cross-family). The
 * model only ever sees the delivered-files set + prior attempts; it never receives the founder
 * reference impls. Isolating the model behind `callModel` (case file §Scope 3: "isolate that
 * behind one injected function") keeps runRedTeam unit-testable with a plain stub — no LLM, no
 * network, no vitest toolchain.
 *
 * @param {{ callModel: (a:{deliveredFiles:Record<string,string>, priorAttempts:Array, round:number, maxRounds:number}) => {source?:string, ext?:string, rationale?:string, missingAssertion?:string, giveUp?:boolean} }} a
 * @returns {(a:object)=>object} an attacker function for runRedTeam
 */
function makeModelAttacker({ callModel }) {
  if (typeof callModel !== "function") {
    throw new Error("makeModelAttacker needs a callModel function (the Opus cross-family attacker)");
  }
  return function attacker({ deliveredFiles, priorAttempts, round, maxRounds }) {
    return callModel({ deliveredFiles, priorAttempts, round, maxRounds });
  };
}

function configFail(rounds, frozen, failures) {
  return { ok: false, red: false, rounds, frozen, survivingMutant: null, failures };
}

/**
 * Adversarial red-team loop — Principle 9 threat model, case file §Scope 3.
 *
 * Each round the cross-family `attacker` (Opus in production; a stub in tests) proposes a
 * mutant using ONLY the delivered files. We run the learner's candidate discovery test against
 * that mutant (via the injected `runTest` — same seam as runBehaviouralGate):
 *   - test PASSES against the mutant → the mutant SURVIVED → the gate is too weak → RED. Report
 *     the surviving mutant + the assertion the test is missing, and stop.
 *   - test FAILS against the mutant → the test CAUGHT it → freeze it as a permanent reference
 *     fixture (hardening) and let the attacker try again.
 * Capped at ≤3 rounds per gated bug. Exhausting the rounds (or the attacker giving up) with no
 * survivor means the gate held → GREEN.
 *
 * @param {object} a
 * @param {string} a.cwd            learner repo root (candidate test + buggy impl live here)
 * @param {object} a.gate           { targetModule, candidateTest, journalTemplate?, bannerFile? }
 * @param {string} [a.referenceRoot] slot reference dir; frozen mutants are written here
 * @param {(a:object)=>object} a.attacker   cross-family adversary (inject a stub in tests)
 * @param {(a:{cwd:string,testFile:string,targetModule:string,implFile:string})=>{passed:boolean}} [a.runTest]
 * @param {(a:{referenceRoot:string,source:string,ext?:string})=>{path:string|null,deduped:boolean}} [a.freeze]
 * @param {number} [a.maxRounds]    1..3 (default 3)
 * @returns {{ ok:boolean, red:boolean, rounds:Array, frozen:string[], survivingMutant:object|null, failures:string[] }}
 */
function runRedTeam({
  cwd,
  gate,
  referenceRoot,
  attacker,
  runTest = defaultRunTest,
  freeze = defaultFreezeMutant,
  maxRounds = 3,
}) {
  const rounds = [];
  const frozen = [];

  if (!gate || !gate.targetModule || !gate.candidateTest) {
    return configFail(rounds, frozen, ['red-team needs a gate with "targetModule" and "candidateTest"']);
  }
  if (typeof attacker !== "function") {
    return configFail(rounds, frozen, ["red-team needs an injected attacker function (the cross-family adversary)"]);
  }
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 3) {
    return configFail(rounds, frozen, [`red-team maxRounds must be an integer 1..3 (Principle 9 cap); got ${maxRounds}`]);
  }
  if (!fs.existsSync(path.join(cwd, gate.candidateTest))) {
    return configFail(rounds, frozen, [`candidate test missing: ${gate.candidateTest}`]);
  }
  if (!fs.existsSync(path.join(cwd, gate.targetModule))) {
    return configFail(rounds, frozen, [`buggy impl under test missing: ${gate.targetModule}`]);
  }

  const ext = extOf(gate.targetModule);

  for (let round = 1; round <= maxRounds; round++) {
    const { files: deliveredFiles } = collectDeliveredFiles({ cwd, gate });
    const priorAttempts = rounds.map((r) => ({
      source: r.mutantSource,
      caught: r.caught,
      rationale: r.rationale,
    }));

    let proposal;
    try {
      proposal = attacker({ deliveredFiles, priorAttempts, round, maxRounds });
    } catch (e) {
      return configFail(rounds, frozen, [`attacker threw in round ${round}: ${e.message}`]);
    }

    // Adversary cannot find a candidate mutant → the gate held for this round; stop attacking.
    if (!proposal || proposal.giveUp || typeof proposal.source !== "string" || proposal.source.trim() === "") {
      rounds.push({ round, gaveUp: true });
      break;
    }

    const mutantExt = proposal.ext || ext;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "redteam-mutant-"));
    const tmpFile = path.join(tmpDir, `mutant.${mutantExt}`);
    fs.writeFileSync(tmpFile, proposal.source);

    let passed;
    try {
      ({ passed } = runTest({
        cwd,
        testFile: gate.candidateTest,
        targetModule: gate.targetModule,
        implFile: tmpFile,
      }));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // The candidate test FAILING against the mutant means it CAUGHT the wrong fix.
    const caught = passed === false;
    const record = { round, caught, rationale: proposal.rationale ?? null, mutantSource: proposal.source };

    if (!caught) {
      record.survived = true;
      rounds.push(record);
      const missingAssertion =
        proposal.missingAssertion ??
        "the candidate test does not distinguish this mutant from the canonical fix";
      return {
        ok: false,
        red: true,
        rounds,
        frozen,
        survivingMutant: { source: proposal.source, rationale: proposal.rationale ?? null, missingAssertion },
        failures: [
          `red-team defeated the gate in round ${round}: a plausible wrong fix survives the candidate ` +
            `test. Strengthen the test — missing assertion: ${missingAssertion}`,
        ],
      };
    }

    // Caught → harden the gate permanently by freezing this mutant as a reference fixture.
    if (referenceRoot) {
      const { path: frozenPath, deduped } = freeze({ referenceRoot, source: proposal.source, ext: mutantExt });
      if (frozenPath) {
        frozen.push(frozenPath);
        record.frozen = frozenPath;
      } else if (deduped) {
        record.frozen = null;
        record.deduped = true;
      }
    }
    rounds.push(record);
  }

  // Rounds exhausted (or adversary gave up) with no survivor → the gate held.
  return { ok: true, red: false, rounds, frozen, survivingMutant: null, failures: [] };
}

// ---- End grading: defense scoring + honest credential report (Principles 6 + 8) ----
//
// Phase 2 checks the MECHANICAL parts of the Loom (URL, duration, bug/fork match). Phase 4
// adds the CONTENT scoring layer and assembles the credential's Proof-Track report.
//
// Principle 6: "AI-scored, human-audited sample." A judge MODEL scores the defense transcript
// against the module's rubric dimension; the founder watches a random ~10–15% sample plus every
// borderline score. Principle 8: the credential reports ONLY what was verified and HOW — an
// absent or failed Proof gate is reported as unverified/red, never silently as a pass.

/**
 * Model routing for the grading pipeline (case file §Scope 4 / 6). Sonnet drives; the DEFENSE
 * JUDGE is a model isolated behind ONE injected function and must be a DIFFERENT family from
 * whatever authored the content — the red-team authors are Claude (Sonnet driver, Opus attacker/
 * triads), so the judge is cross-family (GPT/Gemini), mirroring the GPT+Claude dual-judge reviews
 * that produced the remediation plan. Fable optionally critiques prose.
 */
const DEFENSE_JUDGE_MODEL_ROUTING = Object.freeze({
  driver: "sonnet",
  judge: "gpt",
  proseCritic: "fable",
});

/** The one honesty label the credential prints for every defense score (Principle 6/8). */
const DEFENSE_HONESTY_LABEL = "defense: AI-scored, human-audited sample";

/** ~10–15% random human-audit sample (Principle 6). */
const DEFAULT_AUDIT_SAMPLE_RATE = 0.12;
/** A score within ±this of the pass threshold is "borderline" and is ALWAYS audited. */
const DEFAULT_BORDERLINE_BAND = 0.5;

/**
 * Validate a module's defense rubric. Fail-closed: an invalid rubric can never yield a pass
 * (a credential must not claim a dimension it could not score).
 *
 * @param {object} rubric  { dimension:string, passThreshold:number, maxScore:number }
 * @returns {string[]} errors (empty array = valid)
 */
function validateRubric(rubric) {
  if (!rubric || typeof rubric !== "object") {
    return ["defense rubric is missing (need the module's trained dimension + threshold)"];
  }
  const errors = [];
  if (typeof rubric.dimension !== "string" || rubric.dimension.trim().length === 0) {
    errors.push("rubric.dimension must be a non-empty string (the instinct/dimension the module trains)");
  }
  if (!Number.isFinite(rubric.maxScore) || rubric.maxScore <= 0) {
    errors.push("rubric.maxScore must be a positive number");
  }
  if (!Number.isFinite(rubric.passThreshold) || rubric.passThreshold <= 0) {
    errors.push("rubric.passThreshold must be a positive number");
  }
  if (
    Number.isFinite(rubric.maxScore) &&
    Number.isFinite(rubric.passThreshold) &&
    rubric.passThreshold > rubric.maxScore
  ) {
    errors.push("rubric.passThreshold cannot exceed rubric.maxScore");
  }
  return errors;
}

/**
 * Band a numeric score relative to the pass threshold. A score within `band` of the threshold
 * (either side) is "borderline" — it may still pass or fail, but it is always human-audited.
 *
 * @returns {"strong"|"borderline"|"weak"}
 */
function scoreBand(score, threshold, band = DEFAULT_BORDERLINE_BAND) {
  if (Math.abs(score - threshold) <= band) return "borderline";
  return score >= threshold ? "strong" : "weak";
}

/**
 * Build the real defense judge around ONE injected model call (cross-family, GPT/Gemini). The
 * model only ever sees the transcript + the rubric dimension — never the reference impls or the
 * canonical fix. Isolating it behind `callModel` (mirror of makeModelAttacker, case file §Scope 4)
 * keeps scoreDefense unit-testable with a plain stub — no LLM, no network.
 *
 * @param {{ callModel: (a:{transcript:string, dimension:string, maxScore:number}) => {score?:number, rationale?:string} }} a
 * @returns {(a:object)=>object} a judge function for scoreDefense
 */
function makeDefenseJudge({ callModel }) {
  if (typeof callModel !== "function") {
    throw new Error("makeDefenseJudge needs a callModel function (the cross-family defense judge)");
  }
  return function judge({ transcript, dimension, maxScore }) {
    return callModel({ transcript, dimension, maxScore });
  };
}

/**
 * Score a recorded defense (Principle 6). The judge MODEL is injected so tests use a stub.
 *
 * Fail-closed — none of these can ever return a pass:
 *   - missing/empty transcript
 *   - missing/invalid rubric
 *   - judge throws
 *   - judge returns a non-finite / out-of-range score
 *
 * @param {object} a
 * @param {string} a.transcript                 the defense transcript (Loom auto-transcript, etc.)
 * @param {object} a.rubric                      { dimension, passThreshold, maxScore }
 * @param {(a:{transcript:string,dimension:string,maxScore:number})=>{score:number,rationale?:string}} a.judge
 * @param {number} [a.borderlineBand]
 * @returns {{ ok:boolean, pass:boolean, score:number|null, band:string|null, dimension:string|null, rationale:string|null, failures:string[] }}
 */
function scoreDefense({ transcript, rubric, judge, borderlineBand = DEFAULT_BORDERLINE_BAND }) {
  const dimension = rubric && typeof rubric.dimension === "string" ? rubric.dimension : null;
  const closed = (failures) => ({
    ok: false,
    pass: false,
    score: null,
    band: null,
    dimension,
    rationale: null,
    failures,
  });

  if (typeof transcript !== "string" || transcript.trim().length === 0) {
    return closed(["defense transcript is missing or empty \u2014 fail closed (no transcript, no pass)"]);
  }
  const rubricErrors = validateRubric(rubric);
  if (rubricErrors.length > 0) {
    return closed(rubricErrors);
  }
  if (typeof judge !== "function") {
    return closed(["scoreDefense needs an injected judge function (the cross-family judge model)"]);
  }

  let verdict;
  try {
    verdict = judge({ transcript, dimension: rubric.dimension, maxScore: rubric.maxScore });
  } catch (e) {
    return closed([`defense judge threw: ${e.message} \u2014 fail closed`]);
  }

  const score = verdict ? verdict.score : undefined;
  if (!Number.isFinite(score) || score < 0 || score > rubric.maxScore) {
    return closed([
      `defense judge returned an invalid score (${score}) \u2014 must be a number in [0, ${rubric.maxScore}]; fail closed`,
    ]);
  }

  const pass = score >= rubric.passThreshold;
  const band = scoreBand(score, rubric.passThreshold, borderlineBand);
  return {
    ok: true,
    pass,
    score,
    band,
    dimension: rubric.dimension,
    rationale: verdict.rationale ?? null,
    failures: [],
  };
}

/** Deterministic fraction in [0,1) from a seed string (reuses the auditable seededIndex hash). */
function seededFraction(seed) {
  const RESOLUTION = 1_000_000;
  return seededIndex(seed, RESOLUTION) / RESOLUTION;
}

/**
 * Human-audit selector (Principle 6: "AI-scored, human-audited sample"). Deterministic and
 * reproducible for a given seed (same seededIndex pattern as pickDefenseChallenge) so the founder
 * can recompute exactly which defenses were flagged. A defense is audited when EITHER:
 *   - its score is borderline (within `borderlineBand` of the threshold) \u2014 ALWAYS audited, or
 *   - it falls into the deterministic ~10–15% random sample.
 *
 * @param {object} a
 * @param {number|null} a.score         the judged score (null/non-finite \u21d2 not borderline)
 * @param {number} a.threshold          the rubric pass threshold
 * @param {string} a.seed               opaque, auditable seed, e.g. `${learner}|${cohort}|${module}|${pr}`
 * @param {number} [a.sampleRate]       fraction in (0,1); default 0.12
 * @param {number} [a.borderlineBand]
 * @returns {{ audit:boolean, reasons:string[] }}
 */
function selectForAudit({ score, threshold, seed, sampleRate = DEFAULT_AUDIT_SAMPLE_RATE, borderlineBand = DEFAULT_BORDERLINE_BAND }) {
  if (typeof seed !== "string" || seed.length === 0) {
    throw new Error("selectForAudit needs a non-empty seed string (auditable, reproducible)");
  }
  const reasons = [];
  if (Number.isFinite(score) && Number.isFinite(threshold) && Math.abs(score - threshold) <= borderlineBand) {
    reasons.push("borderline");
  }
  if (seededFraction(`${seed}|audit`) < sampleRate) {
    reasons.push("random-sample");
  }
  return { audit: reasons.length > 0, reasons };
}

/** null/undefined \u21d2 didn't run \u21d2 "unverified"; else pass iff `ok === true`. */
function normaliseProofGateStatus(result) {
  if (!result || typeof result !== "object") return "unverified";
  return result.ok === true ? "pass" : "red";
}

/**
 * Defense status is three-way: never scored / fail-closed \u21d2 "unverified"; judged fail \u21d2 "red";
 * judged pass \u21d2 "pass". A judge error must NOT read as a fail of the student — it read as
 * "we could not verify" (unverified), which the credential shows honestly.
 */
function normaliseDefenseStatus(defense) {
  if (!defense || typeof defense !== "object") return "unverified";
  if (defense.ok !== true) return "unverified";
  return defense.pass === true ? "pass" : "red";
}

function normaliseUnseenTask(u) {
  const allowed = ["pass", "fail", "pending"];
  if (!u || typeof u !== "object" || !allowed.includes(u.status)) {
    return { status: "pending", note: (u && u.note) || "unseen transfer task not yet run (later phase)" };
  }
  return { status: u.status, note: u.note ?? null };
}

/**
 * Assemble the per-module Proof-Track credential report (Principle 8). Reports ONLY what was
 * verified and HOW. Every Proof-Track item carries a `method`/`howVerified` label; an absent or
 * failed Proof gate is "unverified"/"red", never "pass". Proof Track (hard, no waive) is kept
 * separate from Learning Track (practice, waivable). The unseen-transfer-task slot may be a
 * documented placeholder (that task is a later phase) but is reported honestly, never as a pass
 * it did not earn.
 *
 * @param {object} a
 * @param {Array<{
 *   module:string,
 *   behavioural?:object|null,   // runBehaviouralGate result (or null = did not run)
 *   redTeam?:object|null,       // runRedTeam result (or null = did not run)
 *   defense?:object|null,       // scoreDefense result (or null = did not run)
 *   audited?:boolean,           // selectForAudit().audit for this defense
 *   unseenTask?:object|null,    // { status, note } — placeholder allowed
 *   learning?:object            // informational learning-track items (waivable)
 * }>} a.modules
 * @returns {object} the credential report
 */
function buildProofTrackReport({ modules }) {
  if (!Array.isArray(modules)) {
    throw new Error("buildProofTrackReport needs a modules array");
  }

  const perModule = modules.map((m) => {
    const behaviouralStatus = normaliseProofGateStatus(m.behavioural);
    const redTeamStatus = normaliseProofGateStatus(m.redTeam);
    const defenseStatus = normaliseDefenseStatus(m.defense);
    const unseen = normaliseUnseenTask(m.unseenTask);

    const implementedGateStatuses = [behaviouralStatus, redTeamStatus, defenseStatus];
    const anyRed = implementedGateStatuses.includes("red");
    const anyUnverified = implementedGateStatuses.includes("unverified");
    // "verified" covers only the gates this pipeline runs; the unseen task is reported separately
    // and must ALSO pass before the module's credential is complete (honest, not silently claimed).
    const verified = implementedGateStatuses.every((s) => s === "pass");
    const status = anyRed ? "red" : anyUnverified ? "unverified" : "verified";

    return {
      module: m.module,
      status,
      verified,
      credentialComplete: verified && unseen.status === "pass",
      proofTrack: {
        waivable: false,
        note: "hard gates \u2014 no waive; these are the credential (Principle 8)",
        behaviouralGate: {
          status: behaviouralStatus,
          method: "behavioural: candidate test must FAIL vs buggy, PASS vs fixed, FAIL vs every mutant",
        },
        redTeam: {
          status: redTeamStatus,
          method: "adversarial: cross-family red-team, \u22643 rounds; a surviving mutant marks it red",
        },
        defense: {
          status: defenseStatus,
          score: m.defense && Number.isFinite(m.defense.score) ? m.defense.score : null,
          band: m.defense && m.defense.band ? m.defense.band : null,
          dimension: m.defense && m.defense.dimension ? m.defense.dimension : null,
          howVerified: DEFENSE_HONESTY_LABEL,
          humanAudited: m.audited === true,
        },
        unseenTask: {
          status: unseen.status,
          note: unseen.note,
          method: "unseen transfer task (behavioural gate + live phase defense)",
        },
      },
      learningTrack: {
        waivable: true,
        note: "practice \u2014 completion-tracked; remediation ladder + auto-waive allowed; NOT part of the credential's proof",
        items: m.learning ?? {},
      },
    };
  });

  const summary = {
    total: perModule.length,
    verified: perModule.filter((x) => x.status === "verified").length,
    red: perModule.filter((x) => x.status === "red").length,
    unverified: perModule.filter((x) => x.status === "unverified").length,
    credentialComplete: perModule.filter((x) => x.credentialComplete).length,
  };

  return {
    honesty: {
      defenseLabel: DEFENSE_HONESTY_LABEL,
      statement:
        "Proof Track items are hard gates (no waive) and are the credential. Learning Track items " +
        "are practice (completion-tracked, waivable). An absent or failed Proof gate is reported as " +
        "unverified/red \u2014 never as a pass.",
    },
    summary,
    modules: perModule,
  };
}

module.exports = {
  loadGates,
  runBegin,
  runUnlock,
  runValidate,
  discoveryRewritePasses,
  highestUnlockedBug,
  discoverReferenceImpls,
  runBehaviouralGate,
  defaultRunTest,
  validateDefenseConfig,
  pickDefenseChallenge,
  runDefenseGate,
  RED_TEAM_MODEL_ROUTING,
  collectDeliveredFiles,
  nextMutantPath,
  defaultFreezeMutant,
  makeModelAttacker,
  runRedTeam,
  DEFENSE_JUDGE_MODEL_ROUTING,
  DEFENSE_HONESTY_LABEL,
  validateRubric,
  scoreBand,
  makeDefenseJudge,
  scoreDefense,
  selectForAudit,
  buildProofTrackReport,
};
