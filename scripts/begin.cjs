#!/usr/bin/env node
// npm run begin
//
// Entry gate (LOCAL, honor-system). Thin wrapper — logic lives in gate-engine.cjs + gates.json.

const path = require("node:path");
const { loadGates, runBegin } = require("./gate-engine.cjs");

const gatesPath = path.join(__dirname, "gates.json");
let gates;
try {
  gates = loadGates(gatesPath);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
runBegin({ cwd: process.cwd(), gates });
