/**
 * SSOT for defense recording provider config (PLAT-2026-07-21-010).
 *
 * Per-module gates.json still carries recordingUrlPattern (learner-local validate +
 * content-repo fetch), but the active pattern and retired denylist live here.
 * sync-cursor-pack forces the active pattern into copied gates.json; check-manifest-drift
 * fails closed on retired providers or drift from ACTIVE_RECORDING_URL_PATTERN.
 */
"use strict";

module.exports = {
  ACTIVE_RECORDING_URL_PATTERN: "customer-r5z7zoebyw1di9aq\\.cloudflarestream\\.com/",
  ACTIVE_RECORDING_HOST: "customer-r5z7zoebyw1di9aq.cloudflarestream.com",
  /** Patterns that must never appear in live gates.json / engine fallbacks. */
  RETIRED_RECORDING_PROVIDER_PATTERNS: [/loom/i],
};
