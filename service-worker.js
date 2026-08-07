/**
 * AppStanovi service worker bootstrap.
 *
 * Versioned caching and the controlled update lifecycle are intentionally
 * introduced in later implementation phases. This worker currently provides
 * only a stable registration target and does not access Cache Storage or
 * IndexedDB.
 */
self.addEventListener("install", () => {
  // Do not call skipWaiting() here. Updates must remain user-controlled.
});

self.addEventListener("activate", () => {
  // Do not delete caches or access IndexedDB in this bootstrap phase.
});
