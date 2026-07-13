import { defineConfig } from "vitest/config";

// Staged tests live in src/__tests__/tests-staged/ and are NOT run until the gate
// system delivers them into src/__tests__/. Excluding them here is what makes the
// "one failing test at a time" sequence work.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/tests-staged/**", "**/node_modules/**"],
  },
});
