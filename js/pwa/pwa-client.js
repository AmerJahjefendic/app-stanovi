const SERVICE_WORKER_URL = "./service-worker.js";

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: "./",
      updateViaCache: "none",
    });
  } catch (error) {
    console.error("AppStanovi service worker registration failed.", error);
    return null;
  }
}

void registerServiceWorker();
