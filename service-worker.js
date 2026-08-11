/**
 * AppStanovi versioned offline app shell.
 *
 * Important lifecycle rules:
 * - no IndexedDB access
 * - no automatic skipWaiting()
 * - clients.claim() is used only after a user-approved waiting worker activates
 * - only AppStanovi-owned caches are cleaned up
 * - the full critical app shell must precache successfully or install fails
 */
importScripts("./js/shared/app-version.js");

const APP_VERSION = globalThis.APPSTANOVI_APP_VERSION;
const APP_SHELL_REVISION = globalThis.APPSTANOVI_APP_SHELL_REVISION;
const CACHE_PREFIX = "appstanovi-static-v";
const STATIC_CACHE = `${CACHE_PREFIX}${APP_VERSION}-r${APP_SHELL_REVISION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./income.html",
  "./expenses.html",
  "./settings.html",
  "./shopping.html",
  "./more.html",

  "./css/app.css",
  "./css/print.css",

  "./manifest.webmanifest",
  "./assets/icons/appstanovi-v2-48.png",
  "./assets/icons/appstanovi-v2-180.png",
  "./assets/icons/appstanovi-v2-192.png",
  "./assets/icons/appstanovi-v2-512.png",
  "./assets/icons/appstanovi-v2-maskable-192.png",
  "./assets/icons/appstanovi-v2-maskable-512.png",
  "./assets/signature.png",
  "./assets/stamp.png",

  "./vendor/xlsx.full.min.js",

  "./js/shared/app-version.js",
  "./js/backup/backup.service.js",
  "./js/pwa/pwa-client.js",
  "./js/app/home.data.js",
  "./js/app/home.events.js",
  "./js/app/home.page.js",
  "./js/app/more.page.js",
  "./js/app/more-menu.js",
  "./js/app/report-print.action.js",
  "./js/app/report-context.js",
  "./js/app/home.ui.js",
  "./js/db/db.js",
  "./js/expenses/expenses.page.js",
  "./js/expenses/expenses.ui.js",
  "./js/income/income.page.js",
  "./js/income/income.ui.js",
  "./js/reports/metrics.service.js",
  "./js/settings/app-info.js",
  "./js/settings/settings.page.js",
  "./js/settings/settings.ui.js",
  "./js/shared/apartments.service.js",
  "./js/shared/shared-expense-allocation.service.js",
  "./js/shared/apartment-select.js",
  "./js/shared/commission-rules.service.js",
  "./js/shared/constants.js",
  "./js/shared/importXlsx.js",
  "./js/shared/income-period-view.service.js",
  "./js/shared/log.js",
  "./js/shared/managed-income-calculator.js",
  "./js/shared/mappingConfig.js",
  "./js/shared/parseFilename.js",
  "./js/shared/pdf.js",
  "./js/shared/record-timestamps.js",
  "./js/shared/reservation-financial.service.js",
  "./js/shared/settings.js",
  "./js/shared/shopping-scopes.service.js",
  "./js/shared/state.js",
  "./js/shared/stay-allocation.js",
  "./js/shared/ui.js",
  "./js/shared/utils.js",
  "./js/shopping/shopping.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(CACHE_PREFIX) && cacheName !== STATIC_CACHE
          )
          .map((cacheName) => caches.delete(cacheName))
      );

      await self.clients.claim();
    })()
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_UPDATE_ID") {
    event.ports?.[0]?.postMessage({
      workerId: `${APP_VERSION}-r${APP_SHELL_REVISION}`,
    });
    return;
  }

  if (event.data?.type === "ACTIVATE_UPDATE") {
    self.skipWaiting();
  }
});


function isSameOriginGet(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin;
}

async function matchPrecache(request) {
  const cache = await caches.open(STATIC_CACHE);

  // All application URLs are intentionally versioned by the cache namespace,
  // not by ad-hoc query parameters. Ignore incidental query strings so a
  // bookmark such as income.html?foo=bar still resolves to the same app shell.
  return cache.match(request, { ignoreSearch: true });
}

function offlineUnavailableResponse(request) {
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  const body = acceptsHtml
    ? "AppStanovi nije mogao otvoriti ovu stranicu offline jer resurs nije dio instalirane verzije aplikacije. Ponovo pokušajte kada budete online."
    : "AppStanovi resurs nije dostupan offline.";

  return new Response(body, {
    status: 503,
    statusText: "Offline resource unavailable",
    headers: {
      "Content-Type": acceptsHtml
        ? "text/plain; charset=utf-8"
        : "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (!isSameOriginGet(request)) return;

  event.respondWith(
    (async () => {
      const cached = await matchPrecache(request);
      if (cached) return cached;

      try {
        return await fetch(request);
      } catch (error) {
        if (request.mode === "navigate") {
          return offlineUnavailableResponse(request);
        }
        throw error;
      }
    })()
  );
});
