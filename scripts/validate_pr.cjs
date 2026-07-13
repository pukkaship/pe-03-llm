#!/usr/bin/env node
// npm run validate    (also runs in CI on every pull request)
//
// THE ENFORCED GATE. Thin wrapper — logic lives in gate-engine.cjs + gates.json.

const path = require("node:path");
const { loadGates, runValidate } = require("./gate-engine.cjs");

const gatesPath = path.join(__dirname, "gates.json");
let gates;
try {
  gates = loadGates(gatesPath);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const result = runValidate({ cwd: process.cwd(), gates, env: process.env });
if (!result.ok) process.exit(1);
