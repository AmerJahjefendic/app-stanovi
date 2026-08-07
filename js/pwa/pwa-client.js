const SERVICE_WORKER_URL = "./service-worker.js";
const UPDATE_MESSAGE = "ACTIVATE_UPDATE";
const CHANNEL_NAME = "appstanovi-pwa";
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const BUSY_RESPONSE_WAIT_MS = 450;
const UPDATE_REMIND_AFTER_MS = 24 * 60 * 60 * 1000;
const DISMISS_STORAGE_KEY = "appstanovi-update-dismissed";

let registration = null;
let waitingWorker = null;
let updateBanner = null;
let updateText = null;
let updateButton = null;
let laterButton = null;
let reloadRequested = false;
let activationInProgress = false;
let lastUpdateCheckAt = 0;
let waitingWorkerId = null;
let settingsUpdatePanel = null;

const channel = "BroadcastChannel" in window
  ? new BroadcastChannel(CHANNEL_NAME)
  : null;

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.navigator.standalone === true;
}

function hasOpenEditor() {
  const selectors = [
    "#incomeModal:not(.is-hidden)",
    "#expModal:not(.is-hidden)",
    "#aptModal:not(.is-hidden)",
    "#shareSetModal:not(.is-hidden)",
  ];

  return selectors.some((selector) => document.querySelector(selector));
}

function ensureUpdateBanner() {
  if (updateBanner) return updateBanner;

  const banner = document.createElement("div");
  banner.className = "pwaUpdateBanner is-hidden";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.innerHTML = `
    <div class="pwaUpdateContent">
      <span class="pwaUpdateText">Dostupna je nova verzija AppStanovi.</span>
      <div class="pwaUpdateActions">
        <button type="button" class="btn pwaUpdateNow">Osvježi aplikaciju</button>
        <button type="button" class="btn secondary pwaUpdateLater">Kasnije</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);
  updateBanner = banner;
  updateText = banner.querySelector(".pwaUpdateText");
  updateButton = banner.querySelector(".pwaUpdateNow");
  laterButton = banner.querySelector(".pwaUpdateLater");

  updateButton?.addEventListener("click", () => {
    void requestUpdateActivation();
  });

  laterButton?.addEventListener("click", () => {
    dismissCurrentUpdate();
  });

  return banner;
}

function showUpdateBanner(message = "Dostupna je nova verzija AppStanovi.") {
  ensureUpdateBanner();
  if (updateText) updateText.textContent = message;
  updateBanner?.classList.remove("is-hidden");
}

function hideUpdateBanner() {
  updateBanner?.classList.add("is-hidden");
}

function readDismissedUpdate() {
  try {
    const raw = sessionStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.workerId !== "string" || !Number.isFinite(parsed.dismissedAt)) {
      sessionStorage.removeItem(DISMISS_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(DISMISS_STORAGE_KEY);
    return null;
  }
}

function isUpdateDismissed(workerId) {
  if (!workerId) return false;
  const dismissed = readDismissedUpdate();
  if (!dismissed || dismissed.workerId !== workerId) return false;

  const stillDeferred = Date.now() - dismissed.dismissedAt < UPDATE_REMIND_AFTER_MS;
  if (!stillDeferred) {
    sessionStorage.removeItem(DISMISS_STORAGE_KEY);
  }
  return stillDeferred;
}

function dismissCurrentUpdate() {
  if (waitingWorkerId) {
    sessionStorage.setItem(
      DISMISS_STORAGE_KEY,
      JSON.stringify({ workerId: waitingWorkerId, dismissedAt: Date.now() })
    );
  }
  hideUpdateBanner();
  renderSettingsUpdatePanel();
}

function clearDismissedUpdate() {
  sessionStorage.removeItem(DISMISS_STORAGE_KEY);
}

function requestWorkerIdentity(worker) {
  if (!worker) return Promise.resolve(null);

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(null), 750);

    messageChannel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      const id = event.data?.workerId;
      resolve(typeof id === "string" && id ? id : null);
    };

    try {
      worker.postMessage({ type: "GET_UPDATE_ID" }, [messageChannel.port2]);
    } catch {
      window.clearTimeout(timeout);
      resolve(null);
    }
  });
}

function isSettingsPage() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  return page === "settings.html";
}

function ensureSettingsUpdatePanel() {
  if (!isSettingsPage()) return null;
  if (settingsUpdatePanel) return settingsUpdatePanel;

  const panel = document.createElement("div");
  panel.className = "pwaSettingsUpdate is-hidden";
  panel.innerHTML = `
    <div>
      <strong>Nova verzija aplikacije je dostupna.</strong>
      <div class="muted pwaSettingsUpdateMeta"></div>
    </div>
    <button type="button" class="btn pwaSettingsUpdateNow">Ažuriraj</button>
  `;

  const main = document.querySelector("main") || document.body;
  main.prepend(panel);
  panel.querySelector(".pwaSettingsUpdateNow")?.addEventListener("click", () => {
    clearDismissedUpdate();
    void requestUpdateActivation();
  });
  settingsUpdatePanel = panel;
  return panel;
}

function renderSettingsUpdatePanel() {
  const panel = ensureSettingsUpdatePanel();
  if (!panel) return;

  if (!waitingWorker) {
    panel.classList.add("is-hidden");
    return;
  }

  const meta = panel.querySelector(".pwaSettingsUpdateMeta");
  if (meta) {
    meta.textContent = waitingWorkerId
      ? `Spremno za instalaciju: ${waitingWorkerId}`
      : "Spremno za instalaciju.";
  }
  panel.classList.remove("is-hidden");
}

function setUpdateControlsDisabled(disabled) {
  if (updateButton) updateButton.disabled = disabled;
  if (laterButton) laterButton.disabled = disabled;
}

async function announceWaitingWorker(worker) {
  if (!worker || worker.state !== "installed") return;
  waitingWorker = worker;
  waitingWorkerId = await requestWorkerIdentity(worker);
  renderSettingsUpdatePanel();

  if (!isUpdateDismissed(waitingWorkerId)) {
    showUpdateBanner();
  }
}

function observeInstallingWorker(worker) {
  if (!worker) return;

  worker.addEventListener("statechange", () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) {
      void announceWaitingWorker(worker);
    }
  });
}

function setupRegistrationListeners(reg) {
  if (reg.waiting) {
    void announceWaitingWorker(reg.waiting);
  }

  if (reg.installing) {
    observeInstallingWorker(reg.installing);
  }

  reg.addEventListener("updatefound", () => {
    observeInstallingWorker(reg.installing);
  });
}

function askOtherTabsIfBusy() {
  if (!channel) return Promise.resolve(false);

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    let busy = false;

    const listener = (event) => {
      const data = event.data || {};
      if (data.type !== "BUSY_STATUS" || data.requestId !== requestId) return;
      if (data.busy) busy = true;
    };

    channel.addEventListener("message", listener);
    channel.postMessage({ type: "QUERY_BUSY", requestId });

    window.setTimeout(() => {
      channel.removeEventListener("message", listener);
      resolve(busy);
    }, BUSY_RESPONSE_WAIT_MS);
  });
}

async function requestUpdateActivation() {
  if (activationInProgress) return;

  const worker = waitingWorker || registration?.waiting;
  if (!worker) {
    showUpdateBanner("Nova verzija više nije u waiting stanju. Pokušaj ponovo nakon provjere ažuriranja.");
    return;
  }

  if (hasOpenEditor()) {
    showUpdateBanner("Prvo sačuvaj ili zatvori otvoreni unos, pa zatim osvježi aplikaciju.");
    return;
  }

  const anotherTabBusy = await askOtherTabsIfBusy();
  if (anotherTabBusy) {
    showUpdateBanner("Drugi AppStanovi tab ima otvoren unos. Sačuvaj ili zatvori taj unos prije ažuriranja.");
    return;
  }

  activationInProgress = true;
  clearDismissedUpdate();
  reloadRequested = true;
  sessionStorage.setItem("appstanovi-update-reload", "1");
  setUpdateControlsDisabled(true);
  showUpdateBanner("Ažuriranje se aktivira…");
  worker.postMessage({ type: UPDATE_MESSAGE });
}

async function checkForUpdate({ force = false } = {}) {
  if (!registration || !navigator.onLine) return;

  const now = Date.now();
  if (!force && now - lastUpdateCheckAt < UPDATE_CHECK_INTERVAL_MS) return;
  lastUpdateCheckAt = now;

  try {
    await registration.update();
  } catch (error) {
    console.warn("AppStanovi update check failed.", error);
  }
}

function setupCrossTabCoordination() {
  if (!channel) return;

  channel.addEventListener("message", (event) => {
    const data = event.data || {};

    if (data.type === "QUERY_BUSY" && data.requestId) {
      channel.postMessage({
        type: "BUSY_STATUS",
        requestId: data.requestId,
        busy: hasOpenEditor(),
      });
    }
  });
}

function setupControllerChangeReload() {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloadRequested) return;

    reloadRequested = false;
    if (sessionStorage.getItem("appstanovi-update-reload") !== "1") return;

    sessionStorage.removeItem("appstanovi-update-reload");
    window.location.reload();
  });
}

function setupForegroundUpdateChecks() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkForUpdate();
    }
  });

  window.addEventListener("online", () => {
    void checkForUpdate({ force: true });
  });
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  try {
    registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: "./",
      updateViaCache: "none",
    });

    setupRegistrationListeners(registration);
    setupControllerChangeReload();
    setupCrossTabCoordination();
    setupForegroundUpdateChecks();

    // Browsers already perform an update check during registration. An explicit
    // check is useful for long-lived installed windows without being aggressive.
    window.setTimeout(() => {
      void checkForUpdate({ force: true });
    }, 1500);

    return registration;
  } catch (error) {
    console.error("AppStanovi service worker registration failed.", error);
    return null;
  }
}

export { isStandalone };

void registerServiceWorker();
