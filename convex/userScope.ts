// @convex-dev/auth issues session-scoped identity subjects ("userId|sessionId").
// Data must be keyed by the stable userId part only, otherwise everything becomes
// invisible after re-login (and salt lookup fails, silently regenerating the E2E
// salt — permanent data loss). See migrate.ts for the one-time cleanup.
export function stableUserId(subject: string): string {
  const idx = subject.indexOf("|");
  return idx >= 0 ? subject.slice(0, idx) : subject;
}
