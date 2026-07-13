#!/usr/bin/env node
// npm run unlock -- N   (N = 1..5)
//
// Bug gate (LOCAL, honor-system scaffold). Thin wrapper — logic lives in gate-engine.cjs + gates.json.

const path = require("node:path");
const { loadGates, runUnlock } = require("./gate-engine.cjs");

const N = parseInt(process.argv[2], 10);
if (!N || N < 1 || N > 5) {
  console.error("\nUsage: npm run unlock -- <1-5>\n");
  process.exit(1);
}

const gatesPath = path.join(__dirname, "gates.json");
let gates;
try {
  gates = loadGates(gatesPath);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
runUnlock({ cwd: process.cwd(), gates, bugNumber: N });
