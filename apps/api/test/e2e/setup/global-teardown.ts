/**
 * Runs once after the entire E2E suite completes.
 * Drop test database or perform cleanup as needed.
 */
export default async function globalTeardown() {
  // Intentionally left minimal — CI containers are ephemeral.
  // Add explicit DB drop here if running locally and you want a clean slate.
}
